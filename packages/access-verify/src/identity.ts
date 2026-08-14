import type { AccessJwtPayload } from '@domk/shared-types';
import { AccessVerifyError } from './errors.js';

export type AccessIdentity =
  | { kind: 'human'; email: string }
  | { kind: 'service'; commonName: string };

/**
 * Decide which trust model a verified assertion belongs to.
 *
 * Access mints JWTs for service tokens through the same app and the same
 * JWKS as human logins — the only difference is the claim set: service tokens
 * carry `common_name` and no `email`. `common_name` is checked first so a
 * future Access change that starts attaching a synthetic email to service
 * tokens can't quietly promote one into the human path (and the `admins`
 * table).
 */
export function identityFromPayload(payload: AccessJwtPayload): AccessIdentity {
  const commonName = typeof payload.common_name === 'string' ? payload.common_name.trim() : '';
  if (commonName) {
    return { kind: 'service', commonName };
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (email) {
    return { kind: 'human', email };
  }

  throw new AccessVerifyError(
    'invalid_token',
    'Access JWT carries neither an email nor a common_name claim',
    403,
  );
}
