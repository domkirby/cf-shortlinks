-- Initial schema for CF Shortlinks.
-- D1 is the source of truth; KV is a cache of the `links` table.

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  destination TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER,
  tags TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_owner ON links (owner_email);
CREATE INDEX IF NOT EXISTS idx_links_active ON links (active);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at);

CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_tokens (
  name TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL
);
