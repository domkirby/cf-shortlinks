import type { ClickOutcome } from '@domk/shared-types';
import type { Env } from './env.js';
import { buildClickEvent, writeClick } from './lib/analytics.js';
import { lookupSlug } from './lib/kv-lookup.js';
import { lookupSlugInD1, selfHealKv } from './lib/d1-fallback.js';

/**
 * Public redirect worker for example.com.
 *
 * Anonymous, high-QPS, latency-critical: one KV read on the happy path, no
 * framework, no admin logic, nothing imported that isn't on the critical path.
 * Everything that isn't the 302 itself runs through `ctx.waitUntil`.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    const url = new URL(request.url);
    const wellKnown = handleWellKnown(url.pathname);
    if (wellKnown) return wellKnown;

    const slug = extractSlug(url.pathname);
    const now = Date.now();

    if (!slug) {
      // Bare "/" — not a slug, so don't spend a KV read on it.
      return finish(request, env, ctx, '', null, now);
    }

    const cached = await lookupSlug(env, slug, now);
    if (cached) {
      return finish(request, env, ctx, slug, cached.destination, now);
    }

    // KV missed: propagation lag, an evicted entry, or a slug that never
    // synced. D1 is authoritative, and a hit here repopulates the cache.
    let destination: string | null = null;
    try {
      const row = await lookupSlugInD1(env, slug, now);
      if (row) {
        destination = row.destination;
        ctx.waitUntil(selfHealKv(env, slug, row, now));
      }
    } catch (err) {
      // D1 unavailable. The configured fallback still works, which is the
      // whole reason it's an env var rather than a row in the database.
      console.error('d1 fallback failed', { slug, err: String(err) });
    }

    return finish(request, env, ctx, slug, destination, now);
  },
} satisfies ExportedHandler<Env>;

/**
 * Build the response and record the click. Every exit from `fetch` goes
 * through here so no path can forget the telemetry — including the misses,
 * which are the interesting ones: they tell you which dead links people are
 * actually hitting and are worth creating.
 */
function finish(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  slug: string,
  destination: string | null,
  now: number,
): Response {
  let outcome: ClickOutcome;
  let response: Response;

  if (destination) {
    outcome = 'hit';
    response = redirect(destination, redirectStatus(env));
  } else if (env.DEFAULT_REDIRECT_URL) {
    outcome = 'fallback';
    response = redirect(env.DEFAULT_REDIRECT_URL, 302);
  } else {
    outcome = 'miss';
    response = notFound();
  }

  ctx.waitUntil(
    Promise.resolve().then(() => writeClick(env, buildClickEvent(request, slug, outcome, now))),
  );

  return response;
}

function redirect(destination: string, status: number): Response {
  return new Response(null, {
    status,
    headers: {
      Location: destination,
      // Links are editable and revocable; letting a browser or intermediary
      // hold onto the mapping would outlive the edit.
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'unsafe-url',
    },
  });
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

function redirectStatus(env: Env): number {
  const parsed = Number.parseInt(env.REDIRECT_STATUS ?? '', 10);
  return parsed === 301 || parsed === 307 || parsed === 308 ? parsed : 302;
}

/**
 * First path segment, percent-decoded. Multi-segment paths are not slugs and
 * resolve to "" so they take the fallback/404 path rather than matching a
 * prefix.
 */
export function extractSlug(pathname: string): string {
  const trimmed = pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed || trimmed.includes('/')) return '';
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * Paths that must never be treated as slugs. Answered before any storage
 * access — browsers request /favicon.ico constantly and each one would
 * otherwise be a KV read plus a D1 read plus an analytics row.
 */
function handleWellKnown(pathname: string): Response | null {
  switch (pathname) {
    case '/favicon.ico':
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=86400' } });
    case '/robots.txt':
      return new Response('User-agent: *\nDisallow: /\n', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
      });
    case '/healthz':
      return new Response('ok', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    default:
      return null;
  }
}
