import type { Config } from 'drizzle-kit';

/**
 * `drizzle-kit generate` writes SQL into ./migrations, which is the same
 * directory `wrangler d1 migrations apply` reads from — so generated schema
 * changes and hand-written data migrations live side by side.
 */
export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
} satisfies Config;
