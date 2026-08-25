import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

const here = path.dirname(fileURLToPath(import.meta.url));

// Real D1 inside workerd, same migrations production gets — this worker does
// non-trivial reads (link + theme lookups), worth testing against the real thing.
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
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
  },
});
