# Deployment

This repo deploys itself: pushing to `main` runs `.github/workflows/deploy.yml`, which
renders each app's Wrangler config from a committed template plus your GitHub repository
secrets/variables, then pushes all four apps to Cloudflare with `wrangler`. No
deployment-specific value is ever committed — a fork configures itself entirely through
**Settings → Secrets and variables → Actions**.

```
apps/<app>/wrangler.jsonc.example  (committed, placeholders)
        │
        │  scripts/render-wrangler.mjs <app> --require-all
        │  (reads GitHub repo secrets/variables as env)
        ▼
apps/<app>/wrangler.jsonc          (gitignored, real values, deploy-time only)
        │
        ▼
   wrangler deploy / wrangler d1 migrations apply
```

The four apps:

| App | Route | What it is |
|---|---|---|
| `redirect-worker` | `<BASE_DOMAIN>/*` | Public redirect hot path |
| `interactive-link` | `<BASE_DOMAIN>/_i_/*` | Unauthenticated password-unlock pages |
| `admin-api` | `<ADMIN_SUBDOMAIN>.<BASE_DOMAIN>/api/*` | Authenticated CRUD (Hono) |
| `admin-frontend` | `<ADMIN_SUBDOMAIN>.<BASE_DOMAIN>/*` | React admin SPA, Cloudflare Kumo (Workers static assets) |

`admin-api` and `admin-frontend` live on the same hostname. That's intentional and safe:
Cloudflare Workers route matching is by **specificity**, not deploy order, so `.../api/*`
always wins over `.../*` on that host regardless of which Worker deployed first or most
recently.

## 1. Fork and create your Cloudflare resources

You need a Cloudflare account with a zone (domain) already added, plus:

```sh
# Requires `wrangler login` once, locally.
pnpm install
pnpm exec wrangler d1 create shortlinks-db
pnpm exec wrangler kv namespace create LINKS
```

Note the `database_id` and the KV `id` from each command's output — you'll paste them into
repo variables below.

## 2. Set up Cloudflare Access (Zero Trust)

The admin surface (`admin-api` + `admin-frontend`) is gated by Cloudflare Access, not by
application code. In the Zero Trust dashboard:

1. Create a **self-hosted Access application** scoped to
   `<ADMIN_SUBDOMAIN>.<BASE_DOMAIN>/*` (e.g. `links.example.com/*`), with a policy allowing
   the humans you want as admins.
2. Optionally add a second policy for **service tokens** (used for CI/automation calling the
   API directly) — create the token here, then register its name via the admin SPA's
   Service tokens page after first deploy.
3. Note your **team domain** (shown as `<team>.cloudflareaccess.com`, just the `<team>` part)
   and the application's **AUD tag** (Overview tab of the application) — these become
   `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` below.

## 3. Create a Cloudflare API token for CI

**My Profile → API Tokens → Create Token → Custom token**, with:

| Scope | Permission |
|---|---|
| Account | `D1:Edit` |
| Account | `Workers Scripts:Edit` |
| Zone (your domain) | `Workers Routes:Edit` |

The Cloudflare-managed "Edit Cloudflare Workers" template covers most of this but not
`D1:Edit` — add it by hand, or build the token fully custom as above.

This is distinct from `CF_ANALYTICS_API_TOKEN` below (a separate, narrower token the
*deployed Worker* uses at runtime, not CI).

## 4. Create an Analytics Engine read token

`admin-api` queries click stats through the Analytics Engine SQL API at runtime.
**My Profile → API Tokens → Create Token → Custom token**, scope: Account →
`Account Analytics:Read`. This becomes the `CF_ANALYTICS_API_TOKEN` secret — CI pushes it
into the Worker via `wrangler secret put` on every deploy, it is never written into
`wrangler.jsonc`.

## 5. Set GitHub repository secrets and variables

**Settings → Secrets and variables → Actions**, on the fork.

### Secrets

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | The custom token from step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID (dashboard sidebar, or `wrangler whoami`) |
| `CF_ANALYTICS_API_TOKEN` | The token from step 4 |

### Variables — required

| Name | Example | Used for |
|---|---|---|
| `BASE_DOMAIN` | `example.com` | The zone all four apps deploy under |
| `DEFAULT_REDIRECT_URL` | `https://example.com` | Fallback for unknown slugs (redirect-worker) |
| `ACCESS_TEAM_DOMAIN` | `acme` | Zero Trust team name (step 2) |
| `ACCESS_AUD` | `2f7389...` | Access application AUD tag (step 2) |
| `CF_ACCOUNT_ID` | `0e758d...` | Same value as the `CLOUDFLARE_ACCOUNT_ID` secret — needed as a plain runtime var too, since Worker code reads it via `env`, not from Actions secrets |
| `D1_DATABASE_ID` | (from step 1) | Shared D1 database |
| `KV_NAMESPACE_ID` | (from step 1) | Shared KV namespace |

### Variables — optional (sane defaults if unset)

| Name | Default | Used for |
|---|---|---|
| `ADMIN_SUBDOMAIN` | `links` | Admin hostname = `<this>.<BASE_DOMAIN>` |
| `ANALYTICS_DATASET` | `shortlinks_clicks` | Analytics Engine dataset name |
| `D1_DATABASE_NAME` | `shortlinks-db` | Cosmetic — must match what you named it in step 1 if you deviate |
| `KV_TTL_SECONDS` | `86400` | Cache TTL for the redirect worker's KV reads |
| `REDIRECT_STATUS` | `302` | HTTP status the redirect worker responds with |
| `CF_WORKER_NAME_REDIRECT` | `shortlinks-redirect` | Worker name → `*.workers.dev` subdomain |
| `CF_WORKER_NAME_ADMIN_API` | `shortlinks-admin-api` | ″ |
| `CF_WORKER_NAME_INTERACTIVE_LINK` | `shortlinks-interactive-link` | ″ |
| `CF_WORKER_NAME_ADMIN_FRONTEND` | `shortlinks-admin` | ″ |

Change the `CF_WORKER_NAME_*` variables only if the default name is already taken in your
account — they don't affect routing, only the `*.workers.dev` fallback hostname.

## 6. Open a PR (or push to a branch first)

`.github/workflows/ci.yml`'s `deploy-config` job runs on every PR targeting `main` (skipped
on PRs from other forks, since they don't have your secrets) and fails the PR — listing every
problem in one pass — if a required secret or variable above is missing. It then renders all
four `wrangler.jsonc` files against your live values as a second, authoritative check. Fix
what it reports before merging.

## 7. First deploy

Push to `main` (or run the `Deploy` workflow manually). It:

1. Renders all four `wrangler.jsonc` files.
2. Applies D1 migrations (`pnpm db:migrate:remote`).
3. Deploys `interactive-link`, then `redirect-worker`, then `admin-api`.
4. Pushes `CF_ANALYTICS_API_TOKEN` as a Worker secret on `admin-api`.
5. Builds `admin-frontend` (Vite bakes `VITE_SHORT_DOMAIN`/`VITE_ADMIN_DOMAIN` from
   `BASE_DOMAIN`/`ADMIN_SUBDOMAIN` into the bundle) and deploys it.

**Bootstrap the first admin by hand** — there's no self-service signup, and `admin-api`
authorizes against a table that starts empty:

```sh
wrangler d1 execute DB --remote --config apps/admin-api/wrangler.jsonc \
  --command "INSERT INTO admins (email, role, created_at) VALUES ('you@example.com', 'owner', unixepoch() * 1000)"
```

(`apps/admin-api/wrangler.jsonc` only exists after the deploy workflow has rendered it at
least once — run `node scripts/render-wrangler.mjs admin-api --require-all` locally first if
you need to do this before a deploy has run, e.g. with the same env vars as your GitHub repo
variables.)

Everything after that goes through `POST /api/admins` from the SPA.

## Verification checklist

- [ ] `https://<BASE_DOMAIN>/anything` returns your `DEFAULT_REDIRECT_URL` (or 404 if unset)
- [ ] `https://<ADMIN_SUBDOMAIN>.<BASE_DOMAIN>` prompts an Access login and, once authorized,
      loads the admin SPA
- [ ] Creating a link in the SPA and visiting its short URL redirects correctly
- [ ] The Stats view shows data after a few clicks (confirms the Analytics Engine token works)

## Local development

Each app needs its own local `wrangler.jsonc` — copy the example and fill in real (or dummy,
for `wrangler dev --local`) ids by hand; this file is gitignored and never touched by CI:

```sh
cp apps/admin-api/wrangler.jsonc.example apps/admin-api/wrangler.jsonc
# ...repeat for the other three apps, or run the renderer against a local .env-style
# export of the same variables from the table above.
```

For the frontend, copy `apps/admin-frontend/.env.example` to `.env` and fill in
`VITE_SHORT_DOMAIN`/`VITE_ADMIN_DOMAIN`.

```sh
pnpm db:migrate:local                # seed the local D1
pnpm dev:api                         # admin-api on :8787
pnpm dev:frontend                    # SPA on :5173, proxies /api to :8787
pnpm dev:redirect                    # redirect worker
pnpm dev:interactive                 # interactive-link (password unlock pages)
```

Copy `apps/admin-api/.dev.vars.example` to `.dev.vars` to assume an owner identity without a
real Access session (loopback-only, see the file's comments).

## Gotchas

- **Don't also connect Cloudflare's Git-integration "Workers Builds"** alongside this GitHub
  Actions pipeline for any of the four apps — pick one, running both will fight over the same
  deployments.
- `admin-frontend` deploys as a Workers static-assets project, not Cloudflare Pages. Its SPA
  fallback is handled by `not_found_handling: "single-page-application"` in
  `wrangler.jsonc.example` — there is deliberately no `_redirects` file.
- Tests for `admin-api` and `interactive-link` use a separate, committed
  `wrangler.test.jsonc` (not the example, not the CI-rendered file) purely so
  `@cloudflare/vitest-pool-workers` can discover binding shapes without needing a render step
  first. Its placeholder ids are never used for anything real.
