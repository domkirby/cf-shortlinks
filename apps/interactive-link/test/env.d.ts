import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import type { Env as InteractiveLinkEnv } from '../src/env.js';

/**
 * Teach `cloudflare:test` about this Worker's bindings, plus the migration
 * list handed in from vitest.config.ts.
 */
declare global {
  namespace Cloudflare {
    interface Env extends InteractiveLinkEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
