import type { KvLinkRecord } from '@domk/shared-types';
import type { Env } from '../env.js';

export interface ResolvedLink {
  destination: string;
  expiresAt: number | null;
}

/**
 * Parse a KV value into a link.
 *
 * Two shapes are accepted: the JSON record the admin API writes, and a bare
 * destination string. The bare form isn't written by anything in this repo,
 * but a value hand-seeded with `wrangler kv key put` is the obvious way an
 * operator pokes at a slug, and silently 404ing on it would be maddening.
 *
 * Returns null for anything unparseable — a corrupt cache entry falls through
 * to D1, which is exactly the self-healing path we already have.
 */
export function parseKvRecord(raw: string | null): ResolvedLink | null {
  if (raw === null) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('{')) {
    // Only an absolute http(s) URL qualifies. Without this check any garbage
    // in the namespace — a truncated write, a stray key — would be handed
    // straight back as a Location header.
    return isHttpUrl(trimmed) ? { destination: trimmed, expiresAt: null } : null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Partial<KvLinkRecord>;
  if (typeof record.d !== 'string' || !record.d) return null;

  if (!isHttpUrl(record.d)) return null;

  return {
    destination: record.d,
    expiresAt: typeof record.e === 'number' ? record.e : null,
  };
}

/**
 * The admin API already refuses anything but http(s), but this is the last
 * gate before a value becomes a `Location` header, and it's one `new URL`.
 */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function isExpired(link: ResolvedLink, now: number): boolean {
  return link.expiresAt !== null && link.expiresAt <= now;
}

/**
 * The hot path. One KV read, no allocation beyond the parse.
 *
 * An entry past its expiry is reported as a miss so the caller re-checks D1;
 * KV's own `expirationTtl` usually gets there first, but the two clocks are
 * independent and D1 is the one that's authoritative.
 */
export async function lookupSlug(
  env: Env,
  slug: string,
  now: number,
): Promise<ResolvedLink | null> {
  const raw = await env.LINKS.get(slug, 'text');
  const link = parseKvRecord(raw);
  if (!link || isExpired(link, now)) return null;
  return link;
}

export function kvTtlSeconds(env: Env, link: ResolvedLink, now: number): number | undefined {
  const configured = Number.parseInt(env.KV_TTL_SECONDS ?? '', 10);
  const base = Number.isFinite(configured) && configured > 0 ? configured : 86_400;

  if (link.expiresAt === null) return base;

  // Never cache past the link's own expiry.
  const untilExpiry = Math.floor((link.expiresAt - now) / 1000);
  if (untilExpiry <= 0) return undefined;

  // KV rejects a TTL below 60s; below that threshold, skip the write entirely
  // and let the remaining requests go to D1 — there are seconds left of them.
  const ttl = Math.min(base, untilExpiry);
  return ttl >= 60 ? ttl : undefined;
}

export function encodeKvRecord(link: ResolvedLink): string {
  const record: KvLinkRecord = { d: link.destination };
  if (link.expiresAt !== null) record.e = link.expiresAt;
  return JSON.stringify(record);
}
