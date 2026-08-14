import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { admins } from '@domk/db-schema';
import type { AdminRole } from '@domk/shared-types';
import type { AppEnv } from '../env.js';
import { getDb, isUniqueViolation } from '../lib/db.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { assertValidEmail } from '../lib/validate.js';

/**
 * Human authorization list. Access decides who may reach this API at all; this
 * table decides who may use it and in what role.
 *
 * Owner-gated at the router level — an editor managing the admin list could
 * promote themselves, which makes the role distinction meaningless.
 */
const app = new Hono<AppEnv>();

const ROLES: AdminRole[] = ['owner', 'editor'];

app.get('/', async (c) => {
  const rows = await getDb(c.env).select().from(admins).orderBy(admins.email);
  return c.json({ items: rows.map((r) => ({ email: r.email, role: r.role, createdAt: r.createdAt })) });
});

app.post('/', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; role?: unknown } | null;
  if (!body) throw badRequest('Request body must be a JSON object');

  const email = assertValidEmail(body.email);
  const role = (body.role ?? 'editor') as AdminRole;
  if (!ROLES.includes(role)) throw badRequest(`role must be one of: ${ROLES.join(', ')}`);

  try {
    const rows = await getDb(c.env)
      .insert(admins)
      .values({ email, role, createdAt: Date.now() })
      .returning();
    return c.json(rows[0], 201);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`${email} is already an administrator`);
    throw err;
  }
});

app.patch('/:email', async (c) => {
  const email = assertValidEmail(c.req.param('email'));
  const body = (await c.req.json().catch(() => null)) as { role?: unknown } | null;
  const role = body?.role as AdminRole | undefined;
  if (!role || !ROLES.includes(role)) throw badRequest(`role must be one of: ${ROLES.join(', ')}`);

  assertNotSelf(c, email, 'demote');

  const rows = await getDb(c.env).update(admins).set({ role }).where(eq(admins.email, email)).returning();
  if (!rows[0]) throw notFound(`${email} is not an administrator`);
  return c.json(rows[0]);
});

app.delete('/:email', async (c) => {
  const email = assertValidEmail(c.req.param('email'));
  assertNotSelf(c, email, 'remove');

  const rows = await getDb(c.env).delete(admins).where(eq(admins.email, email)).returning();
  if (!rows[0]) throw notFound(`${email} is not an administrator`);
  return c.body(null, 204);
});

/**
 * Guard against the one-line mistake that locks everyone out: the last owner
 * removing themselves. Cheap to check, and the recovery is a `wrangler d1
 * execute` you'd rather not be doing under pressure.
 */
function assertNotSelf(
  c: { get: (key: 'actor') => { type: string; email?: string } },
  email: string,
  verb: string,
): void {
  const actor = c.get('actor');
  if (actor.type === 'human' && actor.email === email) {
    throw forbidden(`You cannot ${verb} your own admin account`, 'self_modification');
  }
}

export default app;
