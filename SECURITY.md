# Security Policy

## Supported versions

CF Shortlinks is a self-hosted app you fork and deploy to your own Cloudflare account and
domain, not a versioned library or hosted service — there's no LTS branch or version matrix.
Only the current `main` branch is maintained. If you're running an older fork, update from
`main` before reporting an issue, if that's practical for you.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security vulnerability. Instead, use
GitHub's private reporting for this repository:

**[Report a vulnerability](https://github.com/domkirby/cf-shortlinks/security/advisories/new)**
(repo → Security tab → "Report a vulnerability")

This opens a private conversation with the maintainer that isn't visible to the public until
a fix is out, if one is needed.

This is a small, best-effort maintained project — there's no formal SLA, but reports will be
acknowledged and looked at as promptly as reasonably possible. Credit is happily given in the
fix's commit/release notes if you'd like it.

## Scope

**In scope** — vulnerabilities in this repository's code:
- JWT/Access-assertion verification (`packages/access-verify`)
- Authorization logic in `admin-api` (who can read/write which links, tokens, admins)
- Password-verifier handling in `admin-api` / `interactive-link`
- The config-render and deploy pipeline (`scripts/render-wrangler.mjs`, the GitHub workflows)

**Out of scope:**
- **Password-protected links are explicitly not a security boundary.** As documented in
  [`README.md`](./README.md#password-protected-links), this feature has no rate limiting and
  no lockouts by design — it's a convenience/privacy feature, not access control. Please don't
  report the absence of those as a vulnerability; it's a known, accepted tradeoff.
- Vulnerabilities in Cloudflare's own platform (Workers, Access, D1, KV, Analytics Engine) —
  report those to Cloudflare directly, not here.
- Misconfiguration of a specific fork's own deployment (an overly permissive Access policy, a
  leaked API token, a fork left on stale/vulnerable dependencies) — that deployment's owner is
  responsible for it per [`DEPLOYMENT.md`](./DEPLOYMENT.md), not the upstream repo.
