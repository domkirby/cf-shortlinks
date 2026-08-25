import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import { admins } from '@domk/db-schema';
import {
  AccessVerifyError,
  extractAccessJwt,
  identityFromPayload,
  verifyAccessJwt,
} from '@domk/access-verify';
import type { Actor, AdminRole, HumanActor } from '@domk/shared-types';
import type { AppEnv, Env } from '../env.js';
import { getDb, type Db } from '../lib/db.js';
import { apiError, forbidden, unauthorized } from '../lib/errors.js';
import { resolveServiceActor } from './access-service.js';

/**
 * Resolve a verified human identity into an actor.
 *
 * The JWT proves who they are; this table decides whether they may do
 * anything. Someone who passes the Access policy but isn't in `admins` gets a
 * 403, not a 401 — they authenticated fine, they're just not authorized.
 */
export async function resolveHumanActor(db: Db, email: string): Promise<HumanActor> {
  const row = await db.query.admins.findFirst({ where: eq(admins.email, email) });
  if (!row) {
    throw forbidden(`${email} is not an administrator of this instance`, 'not_an_admin');
  }
  return { type: 'human', email: row.email, role: row.role as AdminRole };
}

/**
 * Local-dev escape hatch: `wrangler dev` has no Access proxy in front of it,
 * so there's no assertion to verify.
 *
 * Two independent conditions must hold — the flag, and a loopback hostname —
 * so that a `DEV_BYPASS_AUTH` accidentally left in production vars still can't
 * authenticate a real request to links.example.com.
 */
function devBypassActor(request: Request, env: Env): Actor | null {
  if (env.DEV_BYPASS_AUTH !== '1') return null;

  const hostname = new URL(request.url).hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]') {
    console.error('DEV_BYPASS_AUTH is set on a non-loopback host; ignoring it', { hostname });
    return null;
  }

  return {
    type: 'human',
    email: env.DEV_ACTOR_EMAIL || 'dev@localhost',
    role: 'owner',
  };
}

/**
 * Authenticate every request on the admin surface.
 *
 * Both credential types arrive the same way — Access validates them at the
 * edge and injects a JWT in `Cf-Access-Jwt-Assertion` — so verification is
 * shared and identical (same JWKS, same audience check, one implementation in
 * `packages/access-verify`). Only afterwards do the flows diverge, on claim
 * shape: `common_name` means a service token, `email` means a person.
 */
export const accessAuth = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const bypass = devBypassActor(c.req.raw, c.env);
    if (bypass) {
      c.set('actor', bypass);
      await next();
      return;
    }

    const token = extractAccessJwt(c.req.raw);
    if (!token) {
      throw unauthorized(
        'No Cloudflare Access assertion on this request. Requests must arrive through the Access-protected hostname.',
        'missing_access_jwt',
      );
    }

    let identity: ReturnType<typeof identityFromPayload>;
    try {
      const payload = await verifyAccessJwt(token, {
        teamDomain: c.env.ACCESS_TEAM_DOMAIN,
        aud: c.env.ACCESS_AUD,
      });
      identity = identityFromPayload(payload);
    } catch (err) {
      if (err instanceof AccessVerifyError) {
        throw apiError(
          err.status === 500 ? 500 : err.status === 403 ? 403 : 401,
          err.code,
          err.message,
        );
      }
      throw err;
    }

    const db = getDb(c.env);
    const actor: Actor =
      identity.kind === 'service'
        ? await resolveServiceActor(db, identity.commonName)
        : await resolveHumanActor(db, identity.email);

    c.set('actor', actor);
    await next();
  });

/**
 * Gate for operations that change who can use the system. Service tokens pass:
 * they're single-role by design and can do anything the admin API allows.
 */
export const requireOwner = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const actor = c.get('actor');
    if (actor.type === 'human' && actor.role !== 'owner') {
      throw forbidden('This operation requires the owner role', 'owner_required');
    }
    await next();
  });
