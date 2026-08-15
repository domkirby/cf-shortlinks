import { Hono } from 'hono';
import type { AppEnv } from './env.js';
import pw from './routes/pw.js';

/**
 * Owns the `_i_` namespace (domk.pro/_i_/*) — reserved for interactive
 * features that need a page in between the short link and its destination.
 * Password protection is the first one; see routes/pw.ts.
 *
 * Deliberately never calls admin-api — it can't get past Cloudflare Access
 * anyway — so it reads D1 directly. Public, unauthenticated by design.
 */
const app = new Hono<AppEnv>();

app.route('/_i_/pw', pw);

app.notFound((c) => c.text('Not Found', 404));

export default app;
