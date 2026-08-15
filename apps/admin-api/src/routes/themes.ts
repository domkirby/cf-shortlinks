import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { links, themes } from '@domk/db-schema';
import type { ListThemesResponse, Theme } from '@domk/shared-types';
import type { AppEnv } from '../env.js';
import { getDb, isUniqueViolation } from '../lib/db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { assertValidHexColor, assertValidLogoUrl, assertValidThemeName } from '../lib/validate.js';

/**
 * Unlock-page themes for password-protected links. Owner-only (see
 * index.ts's mount) — this is account-wide config, not per-link data.
 */
const app = new Hono<AppEnv>();

const toTheme = (row: {
  id: number;
  name: string;
  backgroundColor: string;
  logoUrl: string | null;
  createdAt: number;
  updatedAt: number;
}): Theme => ({
  id: row.id,
  name: row.name,
  backgroundColor: row.backgroundColor,
  logoUrl: row.logoUrl,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

app.get('/', async (c) => {
  const rows = await getDb(c.env).select().from(themes).orderBy(desc(themes.createdAt));
  const body: ListThemesResponse = { items: rows.map(toTheme) };
  return c.json(body);
});

app.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { name?: unknown; backgroundColor?: unknown; logoUrl?: unknown }
    | null;
  if (!body || typeof body !== 'object') throw badRequest('Request body must be a JSON object');

  const name = assertValidThemeName(body.name);
  const backgroundColor = assertValidHexColor(body.backgroundColor);
  const logoUrl = assertValidLogoUrl(body.logoUrl);
  const now = Date.now();

  try {
    const rows = await getDb(c.env)
      .insert(themes)
      .values({ name, backgroundColor, logoUrl, createdAt: now, updatedAt: now })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no row');
    return c.json(toTheme(row), 201);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`A theme named "${name}" already exists`);
    throw err;
  }
});

app.patch('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const body = (await c.req.json().catch(() => null)) as
    | { name?: unknown; backgroundColor?: unknown; logoUrl?: unknown }
    | null;
  if (!body || typeof body !== 'object') throw badRequest('Request body must be a JSON object');

  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if ('name' in body) patch.name = assertValidThemeName(body.name);
  if ('backgroundColor' in body) patch.backgroundColor = assertValidHexColor(body.backgroundColor);
  if ('logoUrl' in body) patch.logoUrl = assertValidLogoUrl(body.logoUrl);
  if (Object.keys(patch).length === 1) throw badRequest('No updatable fields present');

  let updated;
  try {
    const rows = await getDb(c.env).update(themes).set(patch).where(eq(themes.id, id)).returning();
    updated = rows[0];
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`A theme named "${String(patch.name)}" already exists`);
    throw err;
  }
  if (!updated) throw notFound(`No theme with id ${id}`);
  return c.json(toTheme(updated));
});

app.delete('/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10);
  const db = getDb(c.env);

  // No FK cascade is configured (D1 doesn't enforce it anyway) — block the
  // delete explicitly rather than silently orphaning links.theme_id.
  const inUse = await db.select({ id: links.id }).from(links).where(eq(links.themeId, id)).limit(1);
  if (inUse.length) throw conflict('Theme is still assigned to one or more links');

  const rows = await db.delete(themes).where(eq(themes.id, id)).returning();
  if (!rows[0]) throw notFound(`No theme with id ${id}`);
  return c.body(null, 204);
});

export default app;
