import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiError, WhoAmIResponse } from '@domk/shared-types';
import type { AppEnv } from './env.js';
import { accessAuth, requireOwner } from './middleware/access-jwt.js';
import links from './routes/links.js';
import stats from './routes/stats.js';
import tokens from './routes/tokens.js';
import adminsRoutes from './routes/admins.js';
import themesRoutes from './routes/themes.js';

/**
 * Admin API for links.example.com.
 *
 * Sits behind Cloudflare Access, which authenticates both humans and service
 * tokens at the edge before anything here runs. Low-QPS and authenticated, so
 * unlike the redirect worker this side optimises for correctness: mutations
 * write through to KV synchronously and report failures rather than hiding
 * them behind a fire-and-forget.
 */
const app = new Hono<AppEnv>();

app.use('*', secureHeaders());

/**
 * Unauthenticated liveness probe. Deliberately says nothing about the state of
 * D1, KV or Access — it exists to answer "is the Worker deployed", and a probe
 * that touches storage becomes an unauthenticated way to poke at it.
 */
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'admin-api' }));

// Everything past this point requires a verified Access assertion.
app.use('/api/*', accessAuth());

/** Who does the API think I am? The first thing the SPA calls on load. */
app.get('/api/whoami', (c) => {
  const body: WhoAmIResponse = { actor: c.get('actor') };
  return c.json(body);
});

app.route('/api/links', links);
app.route('/api/stats', stats);
// Auth management is owner-only; see routes/admins.ts. Both patterns are
// needed — Hono's `/x/*` does not match a bare `/x`.
app.use('/api/tokens', requireOwner());
app.use('/api/tokens/*', requireOwner());
app.use('/api/admins', requireOwner());
app.use('/api/admins/*', requireOwner());
app.use('/api/themes', requireOwner());
app.use('/api/themes/*', requireOwner());
app.route('/api/tokens', tokens);
app.route('/api/admins', adminsRoutes);
app.route('/api/themes', themesRoutes);

app.notFound((c) => {
  const body: ApiError = { error: { code: 'not_found', message: `No route for ${c.req.path}` } };
  return c.json(body, 404);
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    // apiError() attaches a pre-built ApiError response; anything else that
    // throws an HTTPException gets wrapped into the same shape here.
    const res = err.getResponse();
    if (res.headers.get('Content-Type')?.includes('application/json')) return res;
    const body: ApiError = { error: { code: 'http_error', message: err.message } };
    return c.json(body, err.status);
  }

  console.error('unhandled error', { path: c.req.path, err: String(err), stack: (err as Error)?.stack });
  const body: ApiError = {
    error: { code: 'internal_error', message: 'Something went wrong handling this request' },
  };
  return c.json(body, 500);
});

export default app;
