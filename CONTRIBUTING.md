# Contributing

Thanks for looking at CF Shortlinks. This doc is for people changing the code in this repo.
Two adjacent things it isn't:

- Deploying your own copy (no code changes) → [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- Reporting a security vulnerability → [`SECURITY.md`](./SECURITY.md) (please don't open a
  public issue for that)

## Quick start

```sh
git clone https://github.com/domkirby/cf-shortlinks.git
cd cf-shortlinks
pnpm install
```

Requires Node `>=20` and pnpm `10.33.0` (pinned via the `packageManager` field — `corepack
enable` will pick it up automatically).

Project layout (apps + packages) is documented in [`README.md`](./README.md#layout) — no
need to duplicate it here.

## Local development

```sh
pnpm db:migrate:local                # seed the local D1
pnpm dev:api                         # admin-api on :8787
pnpm dev:frontend                    # admin SPA on :5173, proxies /api to :8787
pnpm dev:redirect                    # redirect worker
pnpm dev:interactive                 # interactive-link (password unlock pages)
```

There's no Cloudflare Access proxy in front of a local dev server, so there's no session to
authenticate. Copy `apps/admin-api/.dev.vars.example` to `.dev.vars` to assume an owner
identity instead (`DEV_BYPASS_AUTH`) — it only takes effect on a loopback hostname, so it
can't accidentally authenticate a real request even if left set somewhere it shouldn't be.

## Before opening a PR

```sh
pnpm typecheck
pnpm test
```

Both must pass. `admin-api` and `interactive-link`'s test suites boot a real D1 database and
(for admin-api) a real KV namespace inside `workerd` via `@cloudflare/vitest-pool-workers`, so
the first run is slower than a typical unit-test suite — that's intentional, it catches schema
drift that a mocked D1 wouldn't.

There's no linter or formatter configured in this repo yet — match the style of the
surrounding code.

## What CI checks

Every PR against `main` runs `.github/workflows/ci.yml`:

- `pnpm typecheck`, `pnpm test`, and a production build of `admin-frontend`
- `node --test scripts/render-wrangler.test.mjs` (guards the Wrangler-config render pipeline)
- A `deploy-config` job that verifies the deployment secrets/variables are set — this one only
  runs on PRs from branches in this repository (it needs repo secrets), so it's expected to be
  skipped on PRs from forks. Don't worry about it failing on your fork's PR.

## Commit messages

No enforced convention — clear and descriptive is enough. `git log` is a reasonable guide to
the existing style if you want one.

## License

By contributing, you agree your changes are licensed under this repo's [MIT license](./LICENSE).
