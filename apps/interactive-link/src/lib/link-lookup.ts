import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '@domk/db-schema';
import { links, themes } from '@domk/db-schema';
import type { Env } from '../env.js';

export interface ProtectedLinkTheme {
  backgroundColor: string;
  logoUrl: string | null;
}

export interface ProtectedLink {
  slug: string;
  /** `{pbkdf_salt}::{hmac_verifier}` */
  passwordVerifier: string;
  /** The real destination — only ever handed out after a correct password. */
  destination: string;
  theme: ProtectedLinkTheme | null;
}

/**
 * Looks up a slug and independently re-validates it's actually protected,
 * active, and unexpired — never trusts that merely being reached via
 * `_i_/pw/{slug}` implies any of that. Someone could hit this route directly
 * for a slug that's unprotected, deleted, deactivated, or expired.
 */
export async function loadProtectedLink(env: Env, slug: string, now: number): Promise<ProtectedLink | null> {
  const db = drizzle(env.DB, { schema });

  const row = await db.query.links.findFirst({ where: eq(links.slug, slug) });
  if (!row) return null;
  if (row.active !== 1) return null;
  if (row.expiresAt !== null && row.expiresAt <= now) return null;
  if (row.passwordProtected !== 1 || !row.passwordVerifier) return null;

  let theme: ProtectedLinkTheme | null = null;
  if (row.themeId !== null) {
    const themeRow = await db.query.themes.findFirst({ where: eq(themes.id, row.themeId) });
    if (themeRow) theme = { backgroundColor: themeRow.backgroundColor, logoUrl: themeRow.logoUrl };
  }

  return {
    slug: row.slug,
    passwordVerifier: row.passwordVerifier,
    destination: row.destination,
    theme,
  };
}
