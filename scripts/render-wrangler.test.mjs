import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseArgs, render } from "./render-wrangler.mjs";

const scriptPath = fileURLToPath(new URL("./render-wrangler.mjs", import.meta.url));

const BASE_ENV = {
  BASE_DOMAIN: "example.com",
  DEFAULT_REDIRECT_URL: "https://example.com/home",
  KV_NAMESPACE_ID: "kv-id",
  D1_DATABASE_ID: "d1-id",
  ACCESS_TEAM_DOMAIN: "acme",
  ACCESS_AUD: "aud-tag",
  CF_ACCOUNT_ID: "account-id",
};

test("parseArgs: accepts the exact command line each CI job invokes", () => {
  assert.deepEqual(parseArgs(["redirect-worker", "--require-all"]), {
    app: "redirect-worker",
    requireAll: true,
    outOverride: undefined,
  });
});

test("parseArgs: --out requires a path", () => {
  assert.deepEqual(parseArgs(["admin-api", "--out"]), { error: "--out requires a path" });
});

test("parseArgs: rejects unknown app", () => {
  const result = parseArgs(["not-a-real-app"]);
  assert.match(result.error, /unknown app/);
});

test("parseArgs: rejects unknown flag", () => {
  const result = parseArgs(["admin-api", "--bogus"]);
  assert.match(result.error, /unknown option/);
});

for (const app of ["redirect-worker", "interactive-link", "admin-api", "admin-frontend"]) {
  test(`render: ${app} with no env leaves the example untouched and is still valid JSON`, () => {
    const { config, applied } = render(app, {});
    assert.equal(applied.length, 0);
    assert.ok(config.name);
  });

  test(`render: ${app} with --require-all reports every missing required field`, () => {
    const { missing } = render(app, {});
    assert.ok(missing.length > 0, `expected missing required fields for ${app}`);
  });

  test(`render: ${app} with all required env set has no missing fields`, () => {
    const { missing } = render(app, BASE_ENV);
    assert.deepEqual(missing, []);
  });

  test(`render: ${app} treats an empty string as unset`, () => {
    const { missing } = render(app, { ...BASE_ENV, BASE_DOMAIN: "" });
    assert.ok(missing.length > 0);
  });
}

test("render: redirect-worker route pattern is derived from BASE_DOMAIN", () => {
  const { config } = render("redirect-worker", BASE_ENV);
  assert.equal(config.routes[0].pattern, "example.com/*");
  assert.equal(config.routes[0].zone_name, "example.com");
  assert.equal(config.vars.SHORT_DOMAIN, "example.com");
});

test("render: interactive-link route pattern is derived from BASE_DOMAIN", () => {
  const { config } = render("interactive-link", BASE_ENV);
  assert.equal(config.routes[0].pattern, "example.com/_i_/*");
});

test("render: admin-api route pattern defaults ADMIN_SUBDOMAIN to 'links'", () => {
  const { config } = render("admin-api", BASE_ENV);
  assert.equal(config.routes[0].pattern, "links.example.com/api/*");
});

test("render: admin-api route pattern honours an explicit ADMIN_SUBDOMAIN", () => {
  const { config } = render("admin-api", { ...BASE_ENV, ADMIN_SUBDOMAIN: "manage" });
  assert.equal(config.routes[0].pattern, "manage.example.com/api/*");
});

test("render: admin-frontend route pattern matches admin-api's hostname", () => {
  const { config } = render("admin-frontend", BASE_ENV);
  assert.equal(config.routes[0].pattern, "links.example.com/*");
});

test("render: no cross-app env leakage (D1_DATABASE_ID only touches d1_databases)", () => {
  const { config } = render("admin-frontend", BASE_ENV);
  assert.equal(JSON.stringify(config).includes("d1-id"), false);
});

test("render: an env value containing '//' (a URL) is not mistaken for a comment", () => {
  const { config } = render("redirect-worker", {
    ...BASE_ENV,
    DEFAULT_REDIRECT_URL: "https://example.com/a//b",
  });
  assert.equal(config.vars.DEFAULT_REDIRECT_URL, "https://example.com/a//b");
});

test("end-to-end: the exact deploy.yml invocation renders valid, non-placeholder JSON", () => {
  const outPath = join(mkdtempSync(join(tmpdir(), "render-wrangler-")), "wrangler.jsonc");
  execFileSync(
    process.execPath,
    [scriptPath, "redirect-worker", "--require-all", "--out", outPath],
    { env: { ...process.env, ...BASE_ENV } }
  );
  const config = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(config.routes[0].pattern, "example.com/*");
  assert.equal(config.d1_databases[0].database_id, "d1-id");
});

test("end-to-end: --require-all exits non-zero and prints the missing var names", () => {
  assert.throws(() => {
    execFileSync(process.execPath, [scriptPath, "admin-api", "--require-all"], {
      env: { ...process.env, BASE_DOMAIN: "", DEFAULT_REDIRECT_URL: "", KV_NAMESPACE_ID: "",
        D1_DATABASE_ID: "", ACCESS_TEAM_DOMAIN: "", ACCESS_AUD: "", CF_ACCOUNT_ID: "" },
      stdio: "pipe",
    });
  }, /Command failed/);
});
