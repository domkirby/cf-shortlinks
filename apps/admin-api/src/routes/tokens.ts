import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { serviceTokens } from '@domk/db-schema';
import type { ListServiceTokensResponse, ServiceToken } from '@domk/shared-types';
import type { AppEnv } from '../env.js';
import { getDb, isUniqueViolation } from '../lib/db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { assertValidTokenName } from '../lib/validate.js';

/**
 * Service-token registry.
 *
 * This is the app-layer half of the two-lever revocation model. The *secret*
 * lives in Cloudflare Access and is never seen here — creating a row does not
 * mint a credential, it records that a token Access already knows about is
 * allowed to use this API. That means:
 *
 *   - Adding a token to the Access app is not enough on its own. Register it
 *     here too, or the Worker rejects it.
 *   - Revoking here (`active = 0`) is instant and needs no dashboard access,
 *     but the credential still passes Access — delete it there as well when
 *     you're retiring it for good.
 */
const app = new Hono<AppEnv>();

const toToken = (row: { name: string; active: number; createdAt: number; description: string | null }): ServiceToken => ({
  name: row.name,
  active: row.active === 1,
  createdAt: row.createdAt,
});

app.get('/', async (c) => {
  const rows = await getDb(c.env).select().from(serviceTokens).orderBy(desc(serviceTokens.createdAt));
  const body: ListServiceTokensResponse = { items: rows.map(toToken) };
  return c.json(body);
});

/**
 * POST /api/tokens — register a token name.
 *
 * `name` must match the service token's name in Zero Trust exactly; that
 * string is what arrives as the `common_name` claim and is the only thing
 * linking the two systems.
 */
app.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { name?: unknown; description?: unknown } | null;
  if (!body || typeof body !== 'object') throw badRequest('Request body must be a JSON object');

  const name = assertValidTokenName(body.name);
  const description =
    typeof body.description === 'string' ? body.description.trim().slice(0, 256) : null;

  try {
    const rows = await getDb(c.env)
      .insert(serviceTokens)
      .values({ name, active: 1, description, createdAt: Date.now() })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('insert returned no row');
    return c.json(toToken(row), 201);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`Service token "${name}" is already registered`);
    throw err;
  }
});

/** PATCH /api/tokens/:name — flip `active`. Revocation at the app layer. */
app.patch('/:name', async (c) => {
  const name = c.req.param('name');
  const body = (await c.req.json().catch(() => null)) as { active?: unknown } | null;
  if (!body || typeof body.active !== 'boolean') {
    throw badRequest('Body must be {"active": true|false}');
  }

  const rows = await getDb(c.env)
    .update(serviceTokens)
    .set({ active: body.active ? 1 : 0 })
    .where(eq(serviceTokens.name, name))
    .returning();

  const row = rows[0];
  if (!row) throw notFound(`No service token named "${name}"`);
  return c.json(toToken(row));
});

/**
 * DELETE /api/tokens/:name — forget the token entirely.
 *
 * Note this does *not* delete it in Access. Until you do that too, the
 * credential still reaches the Worker; it just gets rejected as unregistered.
 */
app.delete('/:name', async (c) => {
  const name = c.req.param('name');
  const rows = await getDb(c.env)
    .delete(serviceTokens)
    .where(eq(serviceTokens.name, name))
    .returning();

  if (!rows[0]) throw notFound(`No service token named "${name}"`);
  return c.body(null, 204);
});

export default app;
