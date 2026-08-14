import type { KvLinkRecord, Link } from '@domk/shared-types';
import type { Env } from '../env.js';
import { apiError } from './errors.js';

const DEFAULT_TTL_SECONDS = 86_400;
/** KV's floor for expirationTtl. Below this, a put is rejected outright. */
const MIN_KV_TTL_SECONDS = 60;

function ttlFor(env: Env, link: Link, now: number): number | undefined {
  const configured = Number.parseInt(env.KV_TTL_SECONDS ?? '', 10);
  const base = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_SECONDS;

  if (link.expiresAt === null) return base;
  const untilExpiry = Math.floor((link.expiresAt - now) / 1000);
  if (untilExpiry <= 0) return undefined;
  const ttl = Math.min(base, untilExpiry);
  return ttl >= MIN_KV_TTL_SECONDS ? ttl : undefined;
}

function shouldBeCached(link: Link, now: number): boolean {
  return link.active && (link.expiresAt === null || link.expiresAt > now);
}

/**
 * Write-through to the redirect cache after a D1 mutation.
 *
 * `previousSlug` matters on rename: the old key has to go, or the link keeps
 * resolving under a name that no longer exists in the source of truth.
 *
 * Failure handling is deliberately asymmetric. A failed *put* is survivable —
 * the redirect worker's D1 fallback self-heals the entry on the next request —
 * so it's logged and swallowed. A failed *delete* is not: it leaves a killed
 * slug live at the edge, so it's raised to the caller as a 503 to retry.
 */
export async function syncLinkToKv(
  env: Env,
  link: Link,
  now: number,
  previousSlug?: string,
): Promise<void> {
  if (previousSlug && previousSlug !== link.slug) {
    await removeSlugFromKv(env, previousSlug);
  }

  if (!shouldBeCached(link, now)) {
    await removeSlugFromKv(env, link.slug);
    return;
  }

  const expirationTtl = ttlFor(env, link, now);
  if (expirationTtl === undefined) {
    // Expiring within the minute — not worth a cache entry that KV would
    // reject anyway. The D1 fallback covers the handful of requests left.
    await removeSlugFromKv(env, link.slug);
    return;
  }

  const record: KvLinkRecord = { d: link.destination };
  if (link.expiresAt !== null) record.e = link.expiresAt;

  try {
    await env.LINKS.put(link.slug, JSON.stringify(record), { expirationTtl });
  } catch (err) {
    console.error('kv write-through failed', { slug: link.slug, err: String(err) });
  }
}

/** Hard delete — a killed slug 404s at the edge immediately, no tombstone. */
export async function removeSlugFromKv(env: Env, slug: string): Promise<void> {
  try {
    await env.LINKS.delete(slug);
  } catch (err) {
    console.error('kv delete failed', { slug, err: String(err) });
    throw apiError(
      503,
      'kv_delete_failed',
      `The link was removed from the database but the edge cache still holds "${slug}". Retry the request.`,
    );
  }
}
