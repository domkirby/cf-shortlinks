import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import type { AccessJwtPayload } from '@domk/shared-types';
import { AccessVerifyError } from './errors.js';

export interface AccessVerifyConfig {
  /**
   * Your Zero Trust team domain. Accepts any of:
   *   "acme"
   *   "acme.cloudflareaccess.com"
   *   "https://acme.cloudflareaccess.com"
   */
  teamDomain: string;
  /** The Access application's AUD tag. */
  aud: string;
  /** Seconds of clock skew tolerated on exp/nbf. Default 30. */
  clockToleranceSec?: number;
}

/** The header Access injects on every authenticated request. */
export const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';
/** Set on browser sessions; the SPA relies on this rather than the header. */
export const ACCESS_COOKIE = 'CF_Authorization';

export function normalizeTeamDomain(teamDomain: string): string {
  const trimmed = teamDomain.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new AccessVerifyError('misconfigured', 'ACCESS_TEAM_DOMAIN is empty', 500);
  }
  const withHost = trimmed.includes('.') ? trimmed : `${trimmed}.cloudflareaccess.com`;
  return withHost.startsWith('http') ? withHost : `https://${withHost}`;
}

export function certsUrl(teamDomain: string): string {
  return `${normalizeTeamDomain(teamDomain)}/cdn-cgi/access/certs`;
}

type RemoteJwkSet = ReturnType<typeof createRemoteJWKSet>;

/**
 * One JWKS per certs URL, cached for the life of the isolate. `jose` handles
 * the key rotation / re-fetch cooldown internally, so re-creating this per
 * request would throw away that cache and add a fetch to the hot path.
 */
const jwksCache = new Map<string, RemoteJwkSet>();

function getJwks(url: string): RemoteJwkSet {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url), {
      cacheMaxAge: 6 * 60 * 60 * 1000,
      cooldownDuration: 30_000,
    });
    jwksCache.set(url, jwks);
  }
  return jwks;
}

/**
 * Verify a Cloudflare Access JWT: signature against the team's JWKS, plus
 * issuer, audience and expiry. Throws {@link AccessVerifyError} on any failure
 * — callers should never see a raw jose error.
 *
 * Both the human and the service-token flows land here; they only diverge
 * afterwards, on claim shape (see `identityFromPayload`).
 */
export async function verifyAccessJwt(
  token: string,
  config: AccessVerifyConfig,
): Promise<AccessJwtPayload> {
  if (!token) {
    throw new AccessVerifyError('missing_token', 'No Access JWT presented');
  }
  if (!config.aud) {
    throw new AccessVerifyError('misconfigured', 'ACCESS_AUD is not configured', 500);
  }

  const issuer = normalizeTeamDomain(config.teamDomain);
  const jwks = getJwks(certsUrl(config.teamDomain));

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: config.aud,
      clockTolerance: config.clockToleranceSec ?? 30,
    });
    return payload as unknown as AccessJwtPayload;
  } catch (err) {
    throw toAccessError(err);
  }
}

function toAccessError(err: unknown): AccessVerifyError {
  if (err instanceof AccessVerifyError) return err;

  if (err instanceof joseErrors.JWTExpired) {
    return new AccessVerifyError('expired_token', 'Access JWT has expired');
  }
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    if (err.claim === 'aud') {
      return new AccessVerifyError('wrong_audience', 'Access JWT audience does not match this app');
    }
    if (err.claim === 'iss') {
      return new AccessVerifyError('wrong_issuer', 'Access JWT was issued by a different team');
    }
    return new AccessVerifyError('invalid_token', `Access JWT claim "${err.claim}" is invalid`);
  }
  if (
    err instanceof joseErrors.JWKSNoMatchingKey ||
    err instanceof joseErrors.JWKSMultipleMatchingKeys ||
    err instanceof joseErrors.JWKSTimeout
  ) {
    // A signing key we can't resolve is indistinguishable from a forged token
    // as far as the caller is concerned, but the operator wants to tell them
    // apart in logs.
    return new AccessVerifyError('jwks_unavailable', 'Could not resolve the Access signing key');
  }
  return new AccessVerifyError('invalid_token', 'Access JWT failed verification');
}

/**
 * Pull the assertion out of a request. Prefers the header Access injects;
 * falls back to the browser session cookie.
 */
export function extractAccessJwt(request: Request): string | null {
  const header = request.headers.get(ACCESS_JWT_HEADER);
  if (header) return header.trim();

  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;

  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === ACCESS_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    }
  }
  return null;
}

/** Clears the module-level JWKS cache. Tests only. */
export function __resetJwksCache(): void {
  jwksCache.clear();
}
