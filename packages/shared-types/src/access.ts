/**
 * Claims Cloudflare Access puts in the `Cf-Access-Jwt-Assertion` header.
 *
 * Human logins carry `email`; service tokens carry `common_name` (the token's
 * name in the Zero Trust dashboard) and no email. That difference is the only
 * reliable way to tell the two apart inside the Worker — see §6b of the
 * architecture doc.
 */
export interface AccessJwtPayload {
  aud: string | string[];
  iss: string;
  sub: string;
  exp: number;
  iat: number;
  nbf?: number;
  /** Present on human sessions. */
  email?: string;
  /** Present on service-token requests. */
  common_name?: string;
  identity_nonce?: string;
  type?: string;
  [claim: string]: unknown;
}

export type AdminRole = 'owner' | 'editor';

export interface HumanActor {
  type: 'human';
  email: string;
  role: AdminRole;
}

export interface ServiceActor {
  type: 'service';
  name: string;
}

/**
 * Who is making the request, after the Access JWT has been verified and the
 * identity resolved against our own tables. The JWT proves identity; the
 * `admins` / `service_tokens` tables decide authorization.
 */
export type Actor = HumanActor | ServiceActor;

export function isOwner(actor: Actor): boolean {
  // Service tokens are single-role by design and can do anything the admin API
  // allows, including owner-only operations.
  return actor.type === 'service' || actor.role === 'owner';
}

export function actorLabel(actor: Actor): string {
  return actor.type === 'human' ? actor.email : `service:${actor.name}`;
}
