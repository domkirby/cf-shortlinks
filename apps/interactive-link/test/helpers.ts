import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index.js';
import { hmacVerifier } from '../src/lib/hmac.js';

export const BASE = 'https://domk.pro';

export async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const request = new Request(`${BASE}${path}`, init);
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export async function resetTables(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM links'),
    env.DB.prepare('DELETE FROM themes'),
  ]);
}

export interface SeedLinkOptions {
  slug: string;
  destination?: string;
  active?: boolean;
  expiresAt?: number | null;
  passwordProtected?: boolean;
  /** Plaintext test "verifier" — hashed the same way admin-api would before storing. */
  verifier?: string;
  themeId?: number | null;
}

/** Mirrors what admin-api's routes/links.ts would have stored. */
export async function seedLink(opts: SeedLinkOptions): Promise<void> {
  const now = Date.now();
  let passwordVerifier: string | null = null;
  if (opts.passwordProtected && opts.verifier) {
    const salt = 'aabbcc';
    const hmac = await hmacVerifier(opts.slug, opts.verifier);
    passwordVerifier = `${salt}::${hmac}`;
  }

  await env.DB.prepare(
    `INSERT INTO links
      (slug, destination, owner_email, active, expires_at, tags, password_protected, password_verifier, theme_id, created_at, updated_at)
     VALUES (?1, ?2, 'test@example.com', ?3, ?4, NULL, ?5, ?6, ?7, ?8, ?8)`,
  )
    .bind(
      opts.slug,
      opts.destination ?? 'https://real-destination.example.com',
      opts.active === false ? 0 : 1,
      opts.expiresAt ?? null,
      opts.passwordProtected ? 1 : 0,
      passwordVerifier,
      opts.themeId ?? null,
      now,
    )
    .run();
}

export async function seedTheme(opts: {
  name: string;
  backgroundColor: string;
  logoUrl?: string | null;
}): Promise<number> {
  const now = Date.now();
  const result = await env.DB.prepare(
    'INSERT INTO themes (name, background_color, logo_url, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4) RETURNING id',
  )
    .bind(opts.name, opts.backgroundColor, opts.logoUrl ?? null, now)
    .first<{ id: number }>();
  if (!result) throw new Error('theme insert returned no row');
  return result.id;
}
