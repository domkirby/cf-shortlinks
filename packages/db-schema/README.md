# D1 migrations

Applied with wrangler, which tracks what has run in a `d1_migrations` table:

```sh
pnpm --filter @domk/db-schema migrate:local    # local dev D1
pnpm --filter @domk/db-schema migrate:remote   # production
```

`0000_initial.sql` is hand-written so the first migration matches the
architecture doc exactly. Subsequent schema changes should come from
`pnpm --filter @domk/db-schema generate` (drizzle-kit diffs `src/schema.ts`
against the migration history and emits the next file).

## Bootstrapping the first admin

The admin API authorizes against the `admins` table, and there is no
self-service signup — so the first row goes in by hand:

```sh
wrangler d1 execute domk-links --remote --config ../../apps/admin-api/wrangler.toml \
  --command "INSERT INTO admins (email, role, created_at) VALUES ('you@example.com', 'owner', unixepoch() * 1000)"
```

Everything after that can go through `POST /api/admins` from the SPA.

## Registering a service token

Create the token in the Zero Trust dashboard first (that's what makes Access
accept it at the edge), then mirror its **name** here so the Worker will honour
it:

```sh
wrangler d1 execute domk-links --remote --config ../../apps/admin-api/wrangler.toml \
  --command "INSERT INTO service_tokens (name, active, created_at) VALUES ('ci-deploy', 1, unixepoch() * 1000)"
```

Or `POST /api/tokens` with `{"name": "ci-deploy"}` once you have an admin
session. Revoke with either lever: delete it in Access (dies at the edge) or
`active = 0` here (dies at the app layer).
