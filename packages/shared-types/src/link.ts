/** A link row as stored in D1 (the source of truth). */
export interface Link {
  id: number;
  slug: string;
  destination: string;
  /** Email of the human who created it, or `service:<token-name>` for API-created links. */
  ownerEmail: string;
  active: boolean;
  /** Epoch ms, or null for "never expires". */
  expiresAt: number | null;
  tags: string[];
  passwordProtected: boolean;
  /** Unlock-page theme to use when password protected. Null means the default look. */
  themeId: number | null;
  createdAt: number;
  updatedAt: number;
  // No password field here, ever — the stored verifier is write-only and
  // never round-trips back through the API. See CreateLinkInput/UpdateLinkInput.
}

/**
 * The shape stored in KV under the slug key.
 *
 * Deliberately terse — this is read on every redirect, so field names are
 * single letters to keep the cached value small. KV is a cache of D1, never
 * the source of truth.
 */
export interface KvLinkRecord {
  /** destination URL */
  d: string;
  /** expiry, epoch ms — null/absent means no expiry */
  e?: number | null;
}

export interface CreateLinkInput {
  /** Omit to have the API generate a random slug. */
  slug?: string;
  destination: string;
  expiresAt?: number | null;
  tags?: string[];
  active?: boolean;
  /**
   * `{pbkdf_salt}:{pbkdf_verifier}` (single colon, both hex) as produced by
   * client-side PBKDF2 (see the frontend's `pbkdf2.ts`) — never a plaintext
   * password. Presence implies the link becomes password protected; omit to
   * leave it unprotected. The server re-hashes this once (HMAC-SHA256, keyed
   * by slug) before storing it — it is never round-tripped back out.
   */
  passwordVerifier?: string;
  themeId?: number | null;
}

export interface UpdateLinkInput {
  slug?: string;
  destination?: string;
  expiresAt?: number | null;
  tags?: string[];
  active?: boolean;
  /**
   * Same wire format as {@link CreateLinkInput.passwordVerifier}. Omit to
   * leave the existing password untouched; set to `null` to remove password
   * protection entirely.
   */
  passwordVerifier?: string | null;
  themeId?: number | null;
}

export interface ListLinksQuery {
  /** Substring match against slug or destination. */
  q?: string;
  tag?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}
