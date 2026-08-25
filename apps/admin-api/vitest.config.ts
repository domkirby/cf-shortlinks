import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

const here = path.dirname(fileURLToPath(import.meta.url));

// Tests run against a real D1 and a real KV namespace inside workerd, with the
// same migrations production gets — so schema drift shows up here first.
const migrations = await readD1Migrations(path.join(here, '../../packages/db-schema/migrations'));

export default defineConfig({
  plugins: [
    cloudflareTest({
      // wrangler.test.jsonc is a committed, test-only config (see that file) —
      // not the gitignored, CI-rendered wrangler.jsonc — so tests run without
      // needing scripts/render-wrangler.mjs first.
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          ACCESS_TEAM_DOMAIN: 'testteam',
          ACCESS_AUD: 'test-aud',
          SHORT_DOMAIN: 'example.com',
          CF_ACCOUNT_ID: 'test-account',
          CF_ANALYTICS_API_TOKEN: 'test-token',
          // Only takes effect on a loopback hostname — tests that exercise
          // real auth just request a non-loopback host.
          DEV_BYPASS_AUTH: '1',
          DEV_ACTOR_EMAIL: 'dev@example.com',
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
  },
});
