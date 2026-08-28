# CF Shortlinks

Self-hosted, Cloudflare-native link shortener — a replacement for short.io you deploy to your
own account and domain. Workers for compute, KV for the hot redirect path, D1 as source of
truth, Analytics Engine for click telemetry, Cloudflare Access for both human and machine auth
on the admin surface.

**Forking this?** See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full setup: create your
Cloudflare resources, set the GitHub secrets/variables, and push — CI renders the Wrangler
config and deploys for you. Nothing below needs editing to deploy your own copy.

Two trust boundaries (`<BASE_DOMAIN>` and `<ADMIN_SUBDOMAIN>` are the repo variables you set
per [`DEPLOYMENT.md`](./DEPLOYMENT.md); defaults shown):

| | Public | Admin |
|---|---|---|
| Host | `<BASE_DOMAIN>/*` | `links.<BASE_DOMAIN>/*` |
| Auth | anonymous | Cloudflare Access (humans + service tokens) |
| Shape | high-QPS, latency-critical | low-QPS, correctness-first |
| Bundle | 2.6 KB gzipped, zero framework | Hono + drizzle |

## Layout

```
apps/
  redirect-worker/    public hot path — <BASE_DOMAIN>/*
  admin-api/          authenticated CRUD — links.<BASE_DOMAIN>/api/*
  admin-frontend/     React SPA (Cloudflare Kumo), Workers static assets — links.<BASE_DOMAIN>
  interactive-link/   unauthenticated interstitial pages — <BASE_DOMAIN>/_i_/*
packages/
  shared-types/      Link, ClickEvent, JWT claim shapes
  db-schema/         drizzle schema + D1 migrations
  access-verify/     shared JOSE/JWKS verification
scripts/
  render-wrangler.mjs  builds each app's wrangler.jsonc from its .example + env — see DEPLOYMENT.md
```

`access-verify` is a package rather than two copies because signature and audience
checks are the one place where being subtly wrong twice is worse than being wrong
once.

## How a redirect resolves

```
GET <BASE_DOMAIN>/:slug
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
POST https://links.<BASE_DOMAIN>/api/links
CF-Access-Client-Id: <client-id>.access
CF-Access-Client-Secret: <client-secret>
Content-Type: application/json

{"slug": "gh", "destination": "https://github.com/your-org"}
```

Revocation has two independent levers, and retiring a token for good means pulling
both: delete it in Access (dies at the edge, never reaches the Worker), or set
`active = 0` here (dies at the app layer, no dashboard access needed).

## API

All routes are under `links.<BASE_DOMAIN>/api` and require an Access assertion, except
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
| GET/POST/PATCH/DELETE | `/api/themes` | owner only; unlock-page appearance for protected links |

Errors are uniform: `{"error": {"code", "message", "details?"}}`.

## Password-protected links

A convenience/privacy feature, not a security boundary — no rate limiting, no
lockouts, nothing "ultra secure." A link marked `passwordProtected` resolves to an
unlock page instead of its destination:

```
GET <BASE_DOMAIN>/{slug}
  └─ resolves (KV or D1) to https://<BASE_DOMAIN>/_i_/pw/{slug} instead of the
     real destination — the redirect worker has zero awareness that this is a
     "password" concept, it just resolves a different destination string.

GET <BASE_DOMAIN>/_i_/pw/{slug}          (served by apps/interactive-link)
  └─ themed unlock page, prompts for a password

POST <BASE_DOMAIN>/_i_/pw/{slug}/verify
  └─ correct password → {"destination": "<real url>"}, page JS redirects there
  └─ wrong password → 401, real destination never revealed
```

`interactive-link` never calls admin-api — it reads D1 directly, independently
re-validating the slug is still protected/active/unexpired on every request rather
than trusting that reaching `_i_/pw/*` at all implies any of that.

The server never sees a plaintext password. The browser (both the admin-frontend,
when setting a password, and the unlock page, when checking one) derives a verifier
via PBKDF2 (WebCrypto, 210,000 iterations) from the password and a random salt, and
sends `{salt}:{verifier}` (hex). The API HMAC-SHA256s the verifier once — cheap,
since the client already did the expensive part — keyed by the link's own slug, and
stores `{salt}::{hmac}`. Verifying re-does that HMAC and compares.

Unlock-page appearance (background color, optional logo) comes from a `themes` row,
managed at `/api/themes` (owner only) and assigned to a link via `themeId`.

## Deploying your own copy

Full walkthrough — creating Cloudflare resources, setting up Access, and configuring the
GitHub secrets/variables that drive CI — is in [`DEPLOYMENT.md`](./DEPLOYMENT.md). Short
version: fork, set the secrets/variables it lists, push to `main`.

## CI/CD

`.github/workflows/deploy.yml` runs on every push to `main`: render each app's
`wrangler.jsonc` from its committed `wrangler.jsonc.example` plus GitHub repo
secrets/variables (see [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full table), apply D1
migrations, deploy all three Workers, push the Analytics Engine token as a Worker secret,
then build and deploy the admin SPA (also a Worker, using static assets). No
deployment-specific value is ever committed — everything deployment-shaped lives in GitHub's
**Settings → Secrets and variables → Actions**.

`.github/workflows/ci.yml`'s `deploy-config` job runs on every PR to `main` and fails it if a
required secret or variable is missing, so a misconfigured fork finds out before merge instead
of via a broken deploy.

## Development

```sh
pnpm db:migrate:local                # seed the local D1
pnpm dev:api                         # admin-api on :8787
pnpm dev:frontend                    # SPA on :5173, proxies /api to :8787
pnpm dev:redirect                    # redirect worker
pnpm dev:interactive                 # interactive-link (password unlock pages)
pnpm test
pnpm typecheck
```

Local dev has no Access proxy in front of it, so there's no assertion to verify.
Copy `apps/admin-api/.dev.vars.example` to `.dev.vars` to assume an owner identity
instead. The bypass requires both the flag *and* a loopback hostname, so a
`DEV_BYPASS_AUTH` accidentally left in production vars still can't authenticate a
real request.

## Tests

`admin-api` and `interactive-link` run against a real D1 (and, for admin-api, a real
KV) inside workerd, with the same migrations production gets — so schema drift shows
up in tests first. The redirect worker and `access-verify` use fast unit tests with
stubbed bindings and a stubbed JWKS endpoint.

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
- **`/favicon.ico`, `/robots.txt`, `/healthz` and `_i_` are answered by a worker**
  and are therefore reserved slugs — the admin API refuses to create them, since
  such a link would save successfully and then never resolve.
- **Password protection is a destination swap, not a redirect-worker feature.** A
  protected link's cached/fallback "destination" is simply the interactive-link
  unlock URL instead of the real one — the redirect worker needs no code that knows
  what "password protected" means at all.
