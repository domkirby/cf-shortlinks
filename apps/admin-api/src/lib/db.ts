import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from '@domk/db-schema';
import type { LinkRow } from '@domk/db-schema';
import type { Link } from '@domk/shared-types';
import type { Env } from '../env.js';

export type Db = DrizzleD1Database<typeof schema>;

export function getDb(env: Env): Db {
  return drizzle(env.DB, { schema });
}

/**
 * D1 stores booleans as integers and tags as a JSON string; the API speaks in
 * real booleans and arrays. This is the only place that conversion happens.
 */
export function toLink(row: LinkRow): Link {
  return {
    id: row.id,
    slug: row.slug,
    destination: row.destination,
    ownerEmail: row.ownerEmail,
    active: row.active === 1,
    expiresAt: row.expiresAt ?? null,
    tags: parseTags(row.tags),
    passwordProtected: row.passwordProtected === 1,
    themeId: row.themeId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // row.passwordVerifier is deliberately never read here — write-only.
  };
}

export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    // A malformed tags column shouldn't make the link itself unreadable.
    return [];
  }
}

export function serializeTags(tags: string[]): string | null {
  return tags.length ? JSON.stringify(tags) : null;
}

/** True when a D1 error is the unique-index violation on links.slug. */
export function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('UNIQUE constraint failed');
}
