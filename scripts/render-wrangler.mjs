#!/usr/bin/env node
/**
 * Render apps/<app>/wrangler.jsonc from apps/<app>/wrangler.jsonc.example plus
 * environment variables. Used by .github/workflows/deploy.yml; safe to run
 * locally too.
 *
 *   node scripts/render-wrangler.mjs redirect-worker
 *   node scripts/render-wrangler.mjs admin-api
 *   node scripts/render-wrangler.mjs interactive-link
 *   node scripts/render-wrangler.mjs admin-frontend
 *
 * Flags:
 *   --require-all   fail if a field marked required below has no value set
 *   --out <path>    write somewhere other than apps/<app>/wrangler.jsonc
 *
 * Deliberately dumb: parse the example as JSONC, assign a fixed list of keys
 * from a fixed list of environment variables (or a small template built from
 * a couple of them, for the route patterns every app shares one BASE_DOMAIN
 * for), write JSON back out. There is no general templating language — every
 * field this can touch is listed in FIELDS below, and anything not listed
 * there is copied through from the example untouched.
 *
 * An env var that is unset or empty leaves the example's value in place, so a
 * forker only has to configure the values they actually want to change.
 * Fields marked `required: true` must be non-empty when --require-all is
 * passed (CI does), which is what turns a forgotten GitHub secret into a loud
 * failure instead of a deploy that silently points at the template's
 * placeholder.
 *
 * See DEPLOYMENT.md for the full table of variables/secrets this expects.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every field CI is allowed to set, per app.
 *
 *   env      — plain field: copy this environment variable's value verbatim
 *   template — derived field: a (vars) => string function combining a couple
 *              of env vars (e.g. the route pattern built from BASE_DOMAIN).
 *              Only applied once every name in `deps` resolves to a non-empty
 *              string (falling back to the template's own default, such as
 *              ADMIN_SUBDOMAIN defaulting to "links").
 *   deps     — template only: env var names the template reads.
 *   path     — location in the config object (array indices are numbers).
 *   required — must be non-empty under --require-all. For a template field,
 *              this checks that BASE_DOMAIN specifically is set (the one dep
 *              with no built-in default).
 */
const FIELDS = {
  "redirect-worker": [
    { env: "CF_WORKER_NAME_REDIRECT", path: ["name"] },
    {
      template: (v) => `${v.BASE_DOMAIN}/*`,
      deps: ["BASE_DOMAIN"],
      path: ["routes", 0, "pattern"],
      required: true,
    },
    { env: "BASE_DOMAIN", path: ["routes", 0, "zone_name"], required: true },
    { env: "BASE_DOMAIN", path: ["vars", "SHORT_DOMAIN"], required: true },
    { env: "DEFAULT_REDIRECT_URL", path: ["vars", "DEFAULT_REDIRECT_URL"], required: true },
    { env: "KV_TTL_SECONDS", path: ["vars", "KV_TTL_SECONDS"] },
    { env: "REDIRECT_STATUS", path: ["vars", "REDIRECT_STATUS"] },
    { env: "KV_NAMESPACE_ID", path: ["kv_namespaces", 0, "id"], required: true },
    { env: "D1_DATABASE_NAME", path: ["d1_databases", 0, "database_name"] },
    { env: "D1_DATABASE_ID", path: ["d1_databases", 0, "database_id"], required: true },
    { env: "ANALYTICS_DATASET", path: ["analytics_engine_datasets", 0, "dataset"] },
  ],
  "interactive-link": [
    { env: "CF_WORKER_NAME_INTERACTIVE_LINK", path: ["name"] },
    {
      template: (v) => `${v.BASE_DOMAIN}/_i_/*`,
      deps: ["BASE_DOMAIN"],
      path: ["routes", 0, "pattern"],
      required: true,
    },
    { env: "BASE_DOMAIN", path: ["routes", 0, "zone_name"], required: true },
    { env: "D1_DATABASE_NAME", path: ["d1_databases", 0, "database_name"] },
    { env: "D1_DATABASE_ID", path: ["d1_databases", 0, "database_id"], required: true },
  ],
  "admin-api": [
    { env: "CF_WORKER_NAME_ADMIN_API", path: ["name"] },
    {
      template: (v) => `${v.ADMIN_SUBDOMAIN || "links"}.${v.BASE_DOMAIN}/api/*`,
      deps: ["BASE_DOMAIN"],
      path: ["routes", 0, "pattern"],
      required: true,
    },
    { env: "BASE_DOMAIN", path: ["routes", 0, "zone_name"], required: true },
    { env: "ACCESS_TEAM_DOMAIN", path: ["vars", "ACCESS_TEAM_DOMAIN"], required: true },
    { env: "ACCESS_AUD", path: ["vars", "ACCESS_AUD"], required: true },
    { env: "BASE_DOMAIN", path: ["vars", "SHORT_DOMAIN"], required: true },
    { env: "CF_ACCOUNT_ID", path: ["vars", "CF_ACCOUNT_ID"], required: true },
    { env: "ANALYTICS_DATASET", path: ["vars", "ANALYTICS_DATASET"] },
    { env: "KV_TTL_SECONDS", path: ["vars", "KV_TTL_SECONDS"] },
    { env: "D1_DATABASE_NAME", path: ["d1_databases", 0, "database_name"] },
    { env: "D1_DATABASE_ID", path: ["d1_databases", 0, "database_id"], required: true },
    { env: "KV_NAMESPACE_ID", path: ["kv_namespaces", 0, "id"], required: true },
  ],
  "admin-frontend": [
    { env: "CF_WORKER_NAME_ADMIN_FRONTEND", path: ["name"] },
    {
      template: (v) => `${v.ADMIN_SUBDOMAIN || "links"}.${v.BASE_DOMAIN}/*`,
      deps: ["BASE_DOMAIN"],
      path: ["routes", 0, "pattern"],
      required: true,
    },
    { env: "BASE_DOMAIN", path: ["routes", 0, "zone_name"], required: true },
  ],
};

/**
 * Strip `//` and block comments from JSONC, character by character, respecting
 * string literals and escapes. Comment bytes are replaced with spaces so that
 * byte offsets in any JSON.parse error still line up with the source file.
 */
function stripJsonComments(text) {
  const out = [...text];
  let inString = false;
  let escaped = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      while (i < stop) {
        if (text[i] !== "\n") out[i] = " ";
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join("");
}

function setPath(root, path, value) {
  let node = root;
  for (const key of path.slice(0, -1)) {
    node = node[key];
    if (node === undefined || node === null) {
      throw new Error(`example config has no "${path.join(".")}" to set`);
    }
  }
  node[path.at(-1)] = value;
}

/**
 * Parse the command line into { app, requireAll, outOverride }, or { error }.
 */
export function parseArgs(argv) {
  let app;
  let requireAll = false;
  let outOverride;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--require-all") {
      requireAll = true;
    } else if (arg === "--out") {
      outOverride = argv[++i];
      if (outOverride === undefined) return { error: "--out requires a path" };
    } else if (arg.startsWith("--")) {
      return { error: `unknown option ${arg}` };
    } else if (app !== undefined) {
      return { error: `unexpected argument ${arg}` };
    } else {
      app = arg;
    }
  }

  if (!Object.hasOwn(FIELDS, app ?? "")) {
    return { error: `unknown app ${app ?? "(none given)"}` };
  }
  return { app, requireAll, outOverride };
}

/** Render one app's config against a given env map. Exported for tests. */
export function render(app, env) {
  const examplePath = join(repoRoot, "apps", app, "wrangler.jsonc.example");
  const config = JSON.parse(stripJsonComments(readFileSync(examplePath, "utf8")));

  const missing = [];
  const applied = [];

  for (const field of FIELDS[app]) {
    if (field.template) {
      const depsPresent = field.deps.every((name) => (env[name] ?? "") !== "");
      if (!depsPresent) {
        if (field.required) missing.push(field.deps.join(", "));
        continue;
      }
      setPath(config, field.path, field.template(env));
      applied.push(`${field.deps.join("+")} -> ${field.path.join(".")}`);
      continue;
    }

    const value = env[field.env];
    if (value === undefined || value === "") {
      if (field.required) missing.push(field.env);
      continue;
    }
    setPath(config, field.path, value);
    applied.push(`${field.env} -> ${field.path.join(".")}`);
  }

  return { config, missing, applied };
}

function main(argv) {
  const { app, requireAll, outOverride, error } = parseArgs(argv);

  if (error) {
    console.error(
      `render-wrangler: ${error}\n` +
        `usage: node scripts/render-wrangler.mjs <${Object.keys(FIELDS).join("|")}> [--require-all] [--out <path>]`
    );
    process.exit(2);
  }

  const outPath = outOverride ?? join(repoRoot, "apps", app, "wrangler.jsonc");
  const { config, missing, applied } = render(app, process.env);

  if (requireAll && missing.length > 0) {
    console.error(
      `render-wrangler: missing required environment variable(s) for "${app}": ${missing.join(", ")}\n` +
        "See DEPLOYMENT.md for the GitHub secrets/variables this workflow expects."
    );
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(config, null, 2) + "\n");

  // Every field here is non-secret config (names, hostnames, a D1/KV id), but
  // log the mapping rather than the values — it is what you actually want
  // when debugging a deploy, and it keeps this honest if a secret is ever
  // added to FIELDS by mistake.
  console.log(`render-wrangler: wrote ${outPath}`);
  for (const line of applied) console.log(`  ${line}`);
}

// Only run when executed directly, so the tests can import parseArgs/render.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
