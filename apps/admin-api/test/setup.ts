import { applyD1Migrations, env } from 'cloudflare:test';

// Same migration files wrangler applies in CI and production.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
