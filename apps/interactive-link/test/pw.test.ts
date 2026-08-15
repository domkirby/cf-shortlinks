import { beforeEach, describe, expect, it } from 'vitest';
import { hmacVerifier } from '../src/lib/hmac.js';
import { call, resetTables, seedLink, seedTheme } from './helpers.js';

beforeEach(resetTables);

describe('GET /_i_/pw/:slug', () => {
  it('serves the unlock page for a protected, active, unexpired link', async () => {
    await seedLink({ slug: 'secret', passwordProtected: true, verifier: 'verifier-value' });

    const res = await call('/_i_/pw/secret');

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-slug="secret"');
    expect(html).toContain('data-salt="aabbcc"');
    // The real destination must never appear on the unlock page itself.
    expect(html).not.toContain('real-destination.example.com');
  });

  it('renders theme colors and logo when a theme is assigned', async () => {
    const themeId = await seedTheme({ name: 'Dark', backgroundColor: '#123456', logoUrl: 'https://x.example.com/logo.png' });
    await seedLink({ slug: 'secret', passwordProtected: true, verifier: 'v', themeId });

    const html = await (await call('/_i_/pw/secret')).text();

    expect(html).toContain('#123456');
    expect(html).toContain('https://x.example.com/logo.png');
  });

  it('falls back to default styling with no theme assigned, without crashing', async () => {
    await seedLink({ slug: 'secret', passwordProtected: true, verifier: 'v' });

    const res = await call('/_i_/pw/secret');
    expect(res.status).toBe(200);
  });

  it.each([
    ['an unknown slug', async () => {}],
    ['a link that is not password protected', async () => seedLink({ slug: 'secret', passwordProtected: false })],
    ['an inactive link', async () => seedLink({ slug: 'secret', passwordProtected: true, verifier: 'v', active: false })],
    [
      'an expired link',
      async () => seedLink({ slug: 'secret', passwordProtected: true, verifier: 'v', expiresAt: Date.now() - 1000 }),
    ],
  ])('404s for %s', async (_label, setup) => {
    await setup();
    expect((await call('/_i_/pw/secret')).status).toBe(404);
  });
});

describe('POST /_i_/pw/:slug/verify', () => {
  it('returns the real destination on a correct verifier', async () => {
    await seedLink({
      slug: 'secret',
      destination: 'https://real-destination.example.com',
      passwordProtected: true,
      verifier: 'correct-verifier',
    });

    const res = await call('/_i_/pw/secret/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifier: 'correct-verifier' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ destination: 'https://real-destination.example.com' });
  });

  it('rejects an incorrect verifier without revealing the destination', async () => {
    await seedLink({ slug: 'secret', passwordProtected: true, verifier: 'correct-verifier' });

    const res = await call('/_i_/pw/secret/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifier: 'wrong-verifier' }),
    });

    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).not.toContain('real-destination');
  });

  it('rejects a malformed body', async () => {
    await seedLink({ slug: 'secret', passwordProtected: true, verifier: 'v' });

    const res = await call('/_i_/pw/secret/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nope: true }),
    });

    expect(res.status).toBe(400);
  });

  it('re-validates independently of the GET route (404 for a since-deactivated link)', async () => {
    await seedLink({ slug: 'secret', passwordProtected: true, verifier: 'v', active: false });

    const res = await call('/_i_/pw/secret/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifier: 'v' }),
    });

    expect(res.status).toBe(404);
  });
});

describe('hmacVerifier', () => {
  it('is deterministic', async () => {
    expect(await hmacVerifier('slug-a', 'verifier')).toBe(await hmacVerifier('slug-a', 'verifier'));
  });

  it('differs across slugs for the same verifier', async () => {
    expect(await hmacVerifier('slug-a', 'verifier')).not.toBe(await hmacVerifier('slug-b', 'verifier'));
  });
});
