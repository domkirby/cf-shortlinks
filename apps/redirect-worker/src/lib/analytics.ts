import type { ClickEvent, ClickOutcome } from '@domk/shared-types';
import type { Env } from '../env.js';

/** AE caps blobs at 5120 bytes total per data point; stay well inside it. */
const MAX_BLOB_LEN = 256;

function truncate(value: string, max = MAX_BLOB_LEN): string {
  return value.length <= max ? value : value.slice(0, max);
}

/**
 * Collapse a user-agent into a coarse family.
 *
 * Deliberately crude: full UA strings blow up AE cardinality and are near
 * useless as a group-by key. Order matters — Edge and Chrome both claim
 * "Chrome", Chrome claims "Safari".
 */
export function uaFamily(ua: string | null): string {
  if (!ua) return 'unknown';
  const s = ua.toLowerCase();

  if (s.includes('bot') || s.includes('crawler') || s.includes('spider')) return 'bot';
  if (s.includes('curl') || s.includes('wget') || s.includes('python-requests')) return 'tool';
  if (s.includes('edg/')) return 'edge';
  if (s.includes('opr/') || s.includes('opera')) return 'opera';
  if (s.includes('firefox')) return 'firefox';
  if (s.includes('chrome') || s.includes('chromium')) return 'chrome';
  if (s.includes('safari')) return 'safari';
  return 'other';
}

/** Referrer origin only — the full URL is high-cardinality and often private. */
export function referrerOrigin(referer: string | null): string {
  if (!referer) return 'direct';
  try {
    return truncate(new URL(referer).origin);
  } catch {
    return truncate(referer);
  }
}

export function buildClickEvent(
  request: Request,
  slug: string,
  outcome: ClickOutcome,
  now: number,
): ClickEvent {
  return {
    slug: truncate(slug),
    referrer: referrerOrigin(request.headers.get('Referer')),
    country: (request.cf?.country as string | undefined) ?? 'XX',
    uaFamily: uaFamily(request.headers.get('User-Agent')),
    outcome,
    timestamp: now,
  };
}

/**
 * Write one click. Called through `ctx.waitUntil`, never awaited on the
 * response path — telemetry must not be able to break a redirect.
 *
 * `indexes: [slug]` makes slug the sampling key, so per-link numbers stay
 * accurate under load even when the dataset as a whole is sampled.
 */
export function writeClick(env: Env, event: ClickEvent): void {
  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [event.slug, event.referrer, event.country, event.uaFamily, event.outcome],
      doubles: [event.timestamp],
      // AE caps an index at 96 bytes and rejects the whole write if it's over.
      indexes: [truncate(event.slug, 96)],
    });
  } catch (err) {
    console.error('analytics write failed', { slug: event.slug, err: String(err) });
  }
}
