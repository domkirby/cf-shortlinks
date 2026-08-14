import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index.js';

/**
 * Requests go to localhost so the dev-auth bypass applies — these tests are
 * about the routes, not about Access. Auth itself is exercised separately in
 * auth.test.ts, which deliberately uses a non-loopback host.
 */
export const BASE = 'http://localhost';

export async function call(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const ctx = createExecutionContext();
  const request = new Request(`${BASE}${path}`, init);
  const response = await app.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export const json = (path: string, method: string, body: unknown, init: RequestInit = {}) =>
  call(path, {
    ...init,
    method,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  });

export async function resetTables(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM links'),
    env.DB.prepare('DELETE FROM admins'),
    env.DB.prepare('DELETE FROM service_tokens'),
  ]);
  const { keys } = await env.LINKS.list();
  await Promise.all(keys.map((key) => env.LINKS.delete(key.name)));
}

export async function seedAdmin(email: string, role: 'owner' | 'editor' = 'owner'): Promise<void> {
  await env.DB.prepare('INSERT INTO admins (email, role, created_at) VALUES (?1, ?2, ?3)')
    .bind(email, role, Date.now())
    .run();
}

export async function seedServiceToken(name: string, active = true): Promise<void> {
  await env.DB.prepare('INSERT INTO service_tokens (name, active, created_at) VALUES (?1, ?2, ?3)')
    .bind(name, active ? 1 : 0, Date.now())
    .run();
}

/** The KV record the redirect worker would read for this slug. */
export async function kvRecord(slug: string): Promise<{ d: string; e?: number } | null> {
  const raw = await env.LINKS.get(slug);
  return raw ? (JSON.parse(raw) as { d: string; e?: number }) : null;
}
