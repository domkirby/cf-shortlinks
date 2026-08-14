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
  createdAt: number;
  updatedAt: number;
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
}

export interface UpdateLinkInput {
  slug?: string;
  destination?: string;
  expiresAt?: number | null;
  tags?: string[];
  active?: boolean;
}

export interface ListLinksQuery {
  /** Substring match against slug or destination. */
  q?: string;
  tag?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}
