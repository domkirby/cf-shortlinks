import type { Env } from '../env.js';
import { encodeKvRecord, isExpired, kvTtlSeconds, type ResolvedLink } from './kv-lookup.js';

interface LinkRow {
  destination: string;
  expires_at: number | null;
  active: number;
}

/**
 * Cold path: KV missed, so ask the source of truth.
 *
 * Reached on propagation lag (a slug created seconds ago), a cache entry that
 * fell out, or a slug that was never synced correctly. Inactive links are
 * excluded here as well as being KV-deleted on deactivation, so a botched
 * write-through can't resurrect a killed slug.
 */
export async function lookupSlugInD1(
  env: Env,
  slug: string,
  now: number,
): Promise<ResolvedLink | null> {
  const row = await env.DB.prepare(
    'SELECT destination, expires_at, active FROM links WHERE slug = ?1 LIMIT 1',
  )
    .bind(slug)
    .first<LinkRow>();

  if (!row || row.active !== 1) return null;

  const link: ResolvedLink = {
    destination: row.destination,
    expiresAt: row.expires_at ?? null,
  };
  return isExpired(link, now) ? null : link;
}

/**
 * Repopulate KV after a D1 hit. Fire-and-forget via `waitUntil` — a failed
 * cache write costs the next visitor a D1 read, nothing more, so it must never
 * turn into a failed redirect.
 */
export async function selfHealKv(
  env: Env,
  slug: string,
  link: ResolvedLink,
  now: number,
): Promise<void> {
  const expirationTtl = kvTtlSeconds(env, link, now);
  if (expirationTtl === undefined) return;

  try {
    await env.LINKS.put(slug, encodeKvRecord(link), { expirationTtl });
  } catch (err) {
    console.error('kv self-heal failed', { slug, err: String(err) });
  }
}
