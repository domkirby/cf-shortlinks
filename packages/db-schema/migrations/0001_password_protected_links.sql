-- Password-protected links.
-- Hand-written, not generated: 0000_initial.sql was hand-written too, with no
-- meta/ snapshot journal for drizzle-kit to diff against, so `generate`
-- against a schema with no history emits a full fresh-install migration
-- (CREATE TABLE without IF NOT EXISTS for every existing table) instead of
-- an incremental diff. Purely additive by hand instead: one new table, three
-- new nullable/defaulted columns on the existing `links` table.

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  background_color TEXT NOT NULL,
  logo_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE links ADD COLUMN password_protected INTEGER NOT NULL DEFAULT 0;
-- `{pbkdf_salt}::{hmac_verifier}`. Null unless password_protected = 1.
ALTER TABLE links ADD COLUMN password_verifier TEXT;
-- References themes(id), not enforced at the D1 level (no FK support here) —
-- see apps/admin-api/src/routes/themes.ts for the delete-while-in-use guard.
ALTER TABLE links ADD COLUMN theme_id INTEGER;
