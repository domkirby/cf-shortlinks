# domk.pro — Cloudflare-native link shortener

Self-hosted replacement for short.io. Workers for compute, KV for the hot redirect
path, D1 as source of truth, Analytics Engine for click telemetry, Cloudflare Access
for both human and machine auth on the admin surface.

Two trust boundaries:

| | Public | Admin |
|---|---|---|
| Host | `domk.pro/*` | `links.domk.pro/*` |
| Auth | anonymous | Cloudflare Access (humans + service tokens) |
| Shape | high-QPS, latency-critical | low-QPS, correctness-first |
| Bundle | 2.6 KB gzipped, zero framework | Hono + drizzle |

## Layout

```
apps/
  redirect-worker/   public hot path — domk.pro/*
  admin-api/         authenticated CRUD — links.domk.pro/api/*
  admin-frontend/    Vue 3 SPA on Pages — links.domk.pro
packages/
  shared-types/      Link, ClickEvent, JWT claim shapes
  db-schema/         drizzle schema + D1 migrations
  access-verify/     shared JOSE/JWKS verification
```

`access-verify` is a package rather than two copies because signature and audience
checks are the one place where being subtly wrong twice is worse than being wrong
once.

## How a redirect resolves

```
GET domk.pro/:slug
  └─ KV.get(slug) ── hit ──▶ 302  (+ Analytics Engine write via waitUntil)
       │
       └─ miss ──▶ D1 SELECT ── found ──▶ 302 + KV.put self-heal
                       │
                       └─ not found ──▶ DEFAULT_REDIRECT_URL set? 302 : 404
```

KV is a cache, never the source of truth. Misses should only come from propagation
lag or an entry that fell out; the D1 fallback self-heals them. The click write is
fire-and-forget and can never block or fail the 302.

`DEFAULT_REDIRECT_URL` is a Worker env var rather than a row in the database
specifically so the fallback still works when D1 is unavailable. Misses are logged
either way (with `blob5` distinguishing `fallback` from `miss`), so the Stats view
can show which dead links are getting hit often enough to be worth creating.

## Click analytics

Dataset `link_clicks`, written positionally:

| field | contents |
|---|---|
| blob1 | slug |
| blob2 | referrer origin |
| blob3 | country (`request.cf.country`) |
| blob4 | user-agent family |
| blob5 | outcome — `hit` \| `fallback` \| `miss` |
| double1 | timestamp (epoch ms) |
| index1 | slug |

Read back through the Analytics Engine SQL API from `/api/stats/*`. No click ever
touches D1, which keeps the links table small and free of write contention on
popular links. Queries use `sum(_sample_interval)` rather than `count()` — AE
samples under load, and `count()` would under-report exactly the links that got
popular enough to matter.

## Auth

Both credential types terminate at the same Access application with two policies,
and both arrive as a JWT in `Cf-Access-Jwt-Assertion`. Verification is identical
(same JWKS, same `aud`); the flows diverge only on claim shape.

**Humans** carry `email`. Access proves identity, the `admins` table decides
authorization and role (`owner` | `editor`). Someone who passes the Access policy
but isn't in `admins` gets a 403, not a 401.

**Service tokens** carry `common_name` — the token's name in Zero Trust — and no
email. Registered in the `service_tokens` table; single-role by design (active or
not). A token Access accepts but that isn't registered here is rejected, so adding a
token to the Access app doesn't silently grant it write access to every link.

```
POST https://links.domk.pro/api/links
CF-Access-Client-Id: <client-id>.access
CF-Access-Client-Secret: <client-secret>
Content-Type: application/json

{"slug": "gh", "destination": "https://github.com/domkirby"}
```

Revocation has two independent levers, and retiring a token for good means pulling
both: delete it in Access (dies at the edge, never reaches the Worker), or set
`active = 0` here (dies at the app layer, no dashboard access needed).

## API

All routes are under `links.domk.pro/api` and require an Access assertion, except
`GET /api/health`.

| Method | Route | Notes |
|---|---|---|
| GET | `/api/health` | unauthenticated liveness probe |
| GET | `/api/whoami` | resolved actor |
| GET | `/api/links` | `?q=&tag=&active=&limit=&offset=` |
| POST | `/api/links` | omit `slug` to generate one |
| GET | `/api/links/:idOrSlug` | |
| PATCH | `/api/links/:idOrSlug` | partial; write-through handles the cache |
| DELETE | `/api/links/:idOrSlug` | hard delete, both stores |
| GET | `/api/stats/overview` | `?days=1..90` |
| GET | `/api/stats/links/:slug` | `?days=1..90` |
| GET/POST/PATCH/DELETE | `/api/tokens` | owner only |
| GET/POST/PATCH/DELETE | `/api/admins` | owner only |

Errors are uniform: `{"error": {"code", "message", "details?"}}`.

## First-time setup

```sh
pnpm install

# Create the resources, then paste the ids into both wrangler.toml files.
pnpm exec wrangler d1 create domk-links
pnpm exec wrangler kv namespace create LINKS

pnpm db:migrate:remote
```

Then in `apps/admin-api/wrangler.toml` set `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (the
AUD tag of the `links.domk.pro` Access application) and `CF_ACCOUNT_ID`, and:

```sh
cd apps/admin-api
pnpm exec wrangler secret put CF_ANALYTICS_API_TOKEN   # needs Account Analytics:Read
```

Optionally set `DEFAULT_REDIRECT_URL` in `apps/redirect-worker/wrangler.toml`; leave
it empty for plain 404s on unknown slugs.

Bootstrap the first admin by hand — there is no self-service signup, and the API
authorizes against a table that starts empty:

```sh
pnpm exec wrangler d1 execute domk-links --remote \
  --command "INSERT INTO admins (email, role, created_at) VALUES ('you@example.com', 'owner', unixepoch() * 1000)"
```

Deploy:

```sh
pnpm --filter @domk/redirect-worker run deploy
pnpm --filter @domk/admin-api run deploy
pnpm --filter @domk/admin-frontend run deploy
```

Gate the Pages project with Access too. There's nothing sensitive in the bundle, but
it keeps the trust boundary in one place: everything on `links.domk.pro` is behind
Access.

## CI/CD

`.github/workflows/deploy.yml` runs the same steps on every push to `main`: apply D1
migrations, then deploy both Workers, then build and deploy the Pages project. It
authenticates with two repo secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A **custom** API token (not the global API key) |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID shown in the Cloudflare dashboard sidebar, or `wrangler whoami` |

The token needs enough scope to run migrations and deploy both product types the
workflow touches — D1, Workers, and Pages — plus the zone permission Workers needs to
attach the custom routes declared in `wrangler.toml`. Create it under **My Profile →
API Tokens → Create Token → Custom token** with:

| Scope | Permission |
|---|---|
| Account | `D1:Edit` |
| Account | `Workers Scripts:Edit` |
| Account | `Cloudflare Pages:Edit` |
| Zone (`domk.pro`) | `Workers Routes:Edit` |

The Cloudflare-managed "Edit Cloudflare Workers" template covers the Workers and
routes permissions but not `D1:Edit` or `Cloudflare Pages:Edit` — those two have to be
added by hand, or use a fully custom token as above. This token is distinct from the
`CF_ANALYTICS_API_TOKEN` runtime secret set on `admin-api` (`Account Analytics:Read`,
used by the deployed Worker to query click stats, not by CI to deploy).

## Development

```sh
pnpm db:migrate:local                # seed the local D1
pnpm dev:api                         # admin-api on :8787
pnpm dev:frontend                    # SPA on :5173, proxies /api to :8787
pnpm dev:redirect                    # redirect worker
pnpm test                            # 167 tests
pnpm typecheck
```

Local dev has no Access proxy in front of it, so there's no assertion to verify.
Copy `apps/admin-api/.dev.vars.example` to `.dev.vars` to assume an owner identity
instead. The bypass requires both the flag *and* a loopback hostname, so a
`DEV_BYPASS_AUTH` accidentally left in production vars still can't authenticate a
real request.

## Tests

`admin-api` runs against a real D1 and a real KV inside workerd, with the same
migrations production gets — so schema drift shows up in tests first. The redirect
worker and `access-verify` use fast unit tests with stubbed bindings and a stubbed
JWKS endpoint.

## Decisions worth knowing

- **KV deletion is a hard delete, not a tombstone.** Deactivating, expiring or
  renaming a link removes the old key, so a killed slug 404s at the edge immediately
  rather than waiting on tombstone logic in the redirect worker.
- **Write-through failures are asymmetric.** A failed KV *put* is logged and
  swallowed — the D1 fallback self-heals it on the next request. A failed KV
  *delete* is raised as a 503, because it leaves a killed slug live at the edge.
- **Service tokens are single-role.** No read-only `reporter` tier until a real
  read-only integration shows up.
- **The redirect worker imports no framework.** Every dependency avoided on that
  path is milliseconds saved globally.
- **`/favicon.ico`, `/robots.txt` and `/healthz` are answered by the worker** and
  are therefore reserved slugs — the admin API refuses to create them, since such a
  link would save successfully and then never resolve.
