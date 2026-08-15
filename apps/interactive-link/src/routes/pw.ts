import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import { loadProtectedLink } from '../lib/link-lookup.js';
import { hmacVerifier } from '../lib/hmac.js';
import { renderUnlockPage } from '../lib/page.js';

const app = new Hono<AppEnv>();

/** GET /_i_/pw/:slug — the unlock page. */
app.get('/:slug', async (c) => {
  const now = Date.now();
  const link = await loadProtectedLink(c.env, c.req.param('slug'), now);
  if (!link) return c.text('Not Found', 404);

  const salt = link.passwordVerifier.split('::')[0] ?? '';
  return c.html(renderUnlockPage({ slug: link.slug, salt, theme: link.theme }));
});

/**
 * POST /_i_/pw/:slug/verify — checks the client-derived verifier and, on
 * success, hands back the real destination for the page's own JS to redirect
 * to. Re-validates from D1 independently of the GET above; nothing here
 * trusts that reaching this route at all implies the slug is still valid.
 */
app.post('/:slug/verify', async (c) => {
  const now = Date.now();
  const link = await loadProtectedLink(c.env, c.req.param('slug'), now);
  if (!link) return c.json({ error: 'not_found' }, 404);

  const body = (await c.req.json().catch(() => null)) as { verifier?: unknown } | null;
  if (!body || typeof body.verifier !== 'string' || !body.verifier) {
    return c.json({ error: 'bad_request' }, 400);
  }

  const storedHmac = link.passwordVerifier.split('::')[1];
  const candidateHmac = await hmacVerifier(link.slug, body.verifier);

  // Plain string compare is acceptable here — this is a convenience/privacy
  // feature, not a security boundary, and a timing side-channel on an
  // HMAC-SHA256 output of a link-scoped, low-value secret isn't worth
  // constant-time-compare complexity.
  if (!storedHmac || candidateHmac !== storedHmac) {
    return c.json({ error: 'incorrect_password' }, 401);
  }

  return c.json({ destination: link.destination });
});

export default app;
