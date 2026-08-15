import type { CreateLinkInput, UpdateLinkInput } from '@domk/shared-types';
import { badRequest } from './errors.js';

/**
 * Slugs are the entire public surface of this system, so they're kept boring:
 * ASCII alphanumerics plus `-` and `_`, starting with an alphanumeric.
 */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Paths the redirect worker answers itself. A link on one of these would be
 * created successfully and then never resolve, which is worse than refusing it.
 */
const RESERVED_SLUGS = new Set(['favicon.ico', 'robots.txt', 'healthz', 'api', '_', 'admin', '_i_']);

const SLUG_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GENERATED_SLUG_LENGTH = 7;

export function assertValidSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!SLUG_RE.test(trimmed)) {
    throw badRequest(
      'Slug must be 1-64 characters of letters, digits, hyphen or underscore, starting with a letter or digit',
      { slug: trimmed },
    );
  }
  if (RESERVED_SLUGS.has(trimmed.toLowerCase())) {
    throw badRequest(`"${trimmed}" is reserved`, { slug: trimmed });
  }
  return trimmed;
}

/**
 * Destinations must be absolute http(s) URLs.
 *
 * The protocol check is the security-relevant part: a `javascript:` or `data:`
 * destination handed back in a `Location` header is a stored XSS vector in any
 * client that follows it, and there is no legitimate use for one here.
 */
export function assertValidDestination(destination: string): string {
  const trimmed = destination.trim();
  if (!trimmed) throw badRequest('Destination is required', { destination: '' });
  if (trimmed.length > 2048) throw badRequest('Destination is too long (max 2048 characters)');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw badRequest('Destination must be an absolute URL', { destination: trimmed });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('Destination must use http or https', { destination: trimmed });
  }
  return url.toString();
}

export function assertValidExpiry(expiresAt: unknown, now: number): number | null {
  if (expiresAt === null || expiresAt === undefined) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    throw badRequest('expiresAt must be epoch milliseconds or null');
  }
  const value = Math.floor(expiresAt);
  if (value <= now) throw badRequest('expiresAt must be in the future');
  return value;
}

export function assertValidTags(tags: unknown): string[] {
  if (tags === undefined || tags === null) return [];
  if (!Array.isArray(tags)) throw badRequest('tags must be an array of strings');
  if (tags.length > 16) throw badRequest('At most 16 tags are allowed');

  const cleaned: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') throw badRequest('tags must be an array of strings');
    const trimmed = tag.trim();
    if (!trimmed) continue;
    if (trimmed.length > 32) throw badRequest(`Tag "${trimmed}" is too long (max 32 characters)`);
    if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
  }
  return cleaned;
}

const HEX_RE = /^[0-9a-f]+$/i;

/**
 * Validates the client wire format `{salt}:{verifier}` (single colon), both
 * hex — the shape produced by client-side PBKDF2. Never a plaintext password.
 */
export function assertValidPasswordVerifierPayload(value: unknown): string {
  if (typeof value !== 'string') throw badRequest('passwordVerifier must be a string');
  const idx = value.indexOf(':');
  if (idx < 0 || value.indexOf(':', idx + 1) !== -1) {
    throw badRequest('passwordVerifier must be in `salt:verifier` format (single colon)');
  }
  const salt = value.slice(0, idx);
  const verifier = value.slice(idx + 1);
  if (!salt || !verifier || !HEX_RE.test(salt) || !HEX_RE.test(verifier)) {
    throw badRequest('passwordVerifier salt and verifier must be non-empty hex strings');
  }
  if (salt.length > 128 || verifier.length > 256) throw badRequest('passwordVerifier is too long');
  return value;
}

export function assertValidThemeId(themeId: unknown): number | null {
  if (themeId === null || themeId === undefined) return null;
  if (typeof themeId !== 'number' || !Number.isInteger(themeId) || themeId <= 0) {
    throw badRequest('themeId must be a positive integer or null');
  }
  return themeId;
}

export function assertValidHexColor(color: unknown): string {
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color.trim())) {
    throw badRequest('backgroundColor must be a #rrggbb hex color');
  }
  return color.trim();
}

export function assertValidThemeName(name: unknown): string {
  if (typeof name !== 'string') throw badRequest('name is required');
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 64) throw badRequest('name must be 1-64 characters');
  return trimmed;
}

export function assertValidLogoUrl(logoUrl: unknown): string | null {
  if (logoUrl === undefined || logoUrl === null || logoUrl === '') return null;
  return assertValidDestination(String(logoUrl));
}

export function assertValidTokenName(name: unknown): string {
  if (typeof name !== 'string') throw badRequest('name is required');
  const trimmed = name.trim();
  // Matches what Access allows in a service token name, which arrives verbatim
  // as the `common_name` claim — this table has to key off the same string.
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/.test(trimmed)) {
    throw badRequest('Token name must be 1-64 characters of letters, digits, space, dot, hyphen or underscore');
  }
  return trimmed;
}

export function assertValidEmail(email: unknown): string {
  if (typeof email !== 'string') throw badRequest('email is required');
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) {
    throw badRequest('A valid email address is required', { email: trimmed });
  }
  return trimmed;
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

export interface ParsedCreate {
  slug: string | null;
  destination: string;
  expiresAt: number | null;
  tags: string[];
  active: boolean;
  /** Raw, unhashed client payload — hashing is async, done in the route handler. */
  passwordVerifierPayload?: string;
  themeId: number | null;
}

export function parseCreateLink(body: unknown, now: number): ParsedCreate {
  const input = asObject(body) as CreateLinkInput & Record<string, unknown>;

  if (typeof input.destination !== 'string') {
    throw badRequest('destination is required');
  }

  return {
    // A null slug means "generate one" — the route handles that so it can
    // retry on collision.
    slug: input.slug === undefined || input.slug === null || input.slug === ''
      ? null
      : assertValidSlug(String(input.slug)),
    destination: assertValidDestination(input.destination),
    expiresAt: assertValidExpiry(input.expiresAt, now),
    tags: assertValidTags(input.tags),
    active: input.active === undefined ? true : Boolean(input.active),
    passwordVerifierPayload:
      input.passwordVerifier === undefined ? undefined : assertValidPasswordVerifierPayload(input.passwordVerifier),
    themeId: assertValidThemeId(input.themeId),
  };
}

export interface ParsedUpdate {
  slug?: string;
  destination?: string;
  expiresAt?: number | null;
  tags?: string[];
  active?: boolean;
  /** Raw, unhashed client payload; `null` explicitly clears protection. */
  passwordVerifierPayload?: string | null;
  themeId?: number | null;
}

export function parseUpdateLink(body: unknown, now: number): ParsedUpdate {
  const input = asObject(body) as UpdateLinkInput & Record<string, unknown>;
  const update: ParsedUpdate = {};

  if ('slug' in input) update.slug = assertValidSlug(String(input.slug ?? ''));
  if ('destination' in input) update.destination = assertValidDestination(String(input.destination ?? ''));
  // An expiry already in the past is rejected on create, but on update it's the
  // only way to retire a link on a schedule you've already missed — so allow
  // clearing it (null) and setting a future one, nothing else.
  if ('expiresAt' in input) update.expiresAt = assertValidExpiry(input.expiresAt, now);
  if ('tags' in input) update.tags = assertValidTags(input.tags);
  if ('active' in input) update.active = Boolean(input.active);
  if ('passwordVerifier' in input) {
    update.passwordVerifierPayload =
      input.passwordVerifier === null ? null : assertValidPasswordVerifierPayload(input.passwordVerifier);
  }
  if ('themeId' in input) update.themeId = assertValidThemeId(input.themeId);

  if (Object.keys(update).length === 0) {
    throw badRequest('No updatable fields present');
  }
  return update;
}

/**
 * Random slug from an unambiguous alphabet (no 0/O/1/l/I) — these get read
 * aloud and typed by hand. 57^7 ≈ 1.9e12, so collisions are rare enough that
 * the caller's single retry loop is plenty.
 */
export function generateSlug(length = GENERATED_SLUG_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += SLUG_ALPHABET[bytes[i]! % SLUG_ALPHABET.length];
  }
  return slug;
}

export function parsePagination(query: Record<string, string | undefined>): {
  limit: number;
  offset: number;
} {
  const limit = Number.parseInt(query.limit ?? '', 10);
  const offset = Number.parseInt(query.offset ?? '', 10);
  return {
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50,
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  };
}
