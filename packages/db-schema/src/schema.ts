import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Reusable unlock-page appearance for password-protected links. The first
 * relational table in this schema — themes are meant to be defined once and
 * assigned to many links, unlike tags, which stay inlined per-link because
 * they've never needed that kind of reuse.
 */
export const themes = sqliteTable('themes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  backgroundColor: text('background_color').notNull(),
  /** Optional; shown above the password prompt when set. */
  logoUrl: text('logo_url'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Links — the source of truth. KV mirrors this for the redirect hot path, but
 * anything not written here does not exist.
 */
export const links = sqliteTable(
  'links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    destination: text('destination').notNull(),
    /** Verified Access identity of the creator: an email, or `service:<name>`. */
    ownerEmail: text('owner_email').notNull(),
    active: integer('active').notNull().default(1),
    /** Epoch ms; null means no expiry. */
    expiresAt: integer('expires_at'),
    /** JSON array of strings. Kept as text — no join table until tags earn one. */
    tags: text('tags'),
    passwordProtected: integer('password_protected').notNull().default(0),
    /**
     * `{pbkdf_salt}::{hmac_verifier}` (double colon). Write-only from the
     * API's perspective — never returned to clients. See
     * apps/admin-api/src/lib/password.ts for how this is derived.
     */
    passwordVerifier: text('password_verifier'),
    /** Not enforced at the D1 level (no FK support here) — see routes/themes.ts. */
    themeId: integer('theme_id').references(() => themes.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_links_owner').on(table.ownerEmail),
    index('idx_links_active').on(table.active),
    index('idx_links_created_at').on(table.createdAt),
  ],
);

/**
 * Humans allowed into the admin API. The Access JWT proves *identity*; this
 * table decides *authorization*.
 */
export const admins = sqliteTable('admins', {
  email: text('email').primaryKey(),
  role: text('role', { enum: ['owner', 'editor'] })
    .notNull()
    .default('editor'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`0`),
});

/**
 * Access service tokens we recognise, keyed by the token's name (which arrives
 * as the `common_name` claim). Single-role by design: active or not.
 *
 * This exists so revocation doesn't require a trip to the Zero Trust dashboard
 * — flipping `active` kills the token at the app layer immediately.
 */
export const serviceTokens = sqliteTable('service_tokens', {
  name: text('name').primaryKey(),
  active: integer('active').notNull().default(1),
  /** Free-form note: what this token is for, who asked for it. */
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});

export type LinkRow = typeof links.$inferSelect;
export type NewLinkRow = typeof links.$inferInsert;
export type AdminRow = typeof admins.$inferSelect;
export type ServiceTokenRow = typeof serviceTokens.$inferSelect;
export type ThemeRow = typeof themes.$inferSelect;
export type NewThemeRow = typeof themes.$inferInsert;
