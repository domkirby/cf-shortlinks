import { eq } from 'drizzle-orm';
import { serviceTokens } from '@domk/db-schema';
import type { ServiceActor } from '@domk/shared-types';
import type { Db } from '../lib/db.js';
import { forbidden } from '../lib/errors.js';

/**
 * Resolve a service-token assertion into an actor.
 *
 * Access has already validated the client id/secret against the service-auth
 * policy at the edge — by the time we're here the caller is provably holding a
 * valid token. What this adds is the second revocation lever: a row in
 * `service_tokens` we control, so a token can be killed from the admin API
 * without touching Zero Trust config.
 *
 * A token Access accepts but we have no row for is rejected. Registration is
 * explicit (`POST /api/tokens`) precisely so that adding a service token to the
 * Access app doesn't silently grant it write access to every link.
 */
export async function resolveServiceActor(db: Db, commonName: string): Promise<ServiceActor> {
  const row = await db.query.serviceTokens.findFirst({
    where: eq(serviceTokens.name, commonName),
  });

  if (!row) {
    throw forbidden(
      `Service token "${commonName}" is not registered with this API`,
      'unknown_service_token',
    );
  }
  if (row.active !== 1) {
    throw forbidden(`Service token "${commonName}" has been revoked`, 'revoked_service_token');
  }

  return { type: 'service', name: row.name };
}
