import { describe, expect, it } from 'vitest';
import worker, { extractSlug } from '../src/index.js';
import { createHarness, get, readClick } from './helpers.js';

const HOUR = 3_600_000;

describe('redirect worker', () => {
  it('serves a KV hit as a 302 without touching D1', async () => {
    const h = createHarness({ kv: { gh: JSON.stringify({ d: 'https://github.com/domkirby' }) } });

    const res = await worker.fetch(get('/gh'), h.env, h.ctx);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://github.com/domkirby');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(h.d1First).not.toHaveBeenCalled();
  });

  it('accepts a bare destination string in KV', async () => {
    const h = createHarness({ kv: { gh: 'https://example.com/plain' } });

    const res = await worker.fetch(get('/gh'), h.env, h.ctx);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example.com/plain');
  });

  it('falls back to D1 on a KV miss and self-heals the cache', async () => {
    const h = createHarness({
      rows: { docs: { destination: 'https://docs.example.com', expires_at: null, active: 1 } },
    });

    const res = await worker.fetch(get('/docs'), h.env, h.ctx);
    await h.settle();

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://docs.example.com');
    expect(h.kvPut).toHaveBeenCalledOnce();
    expect(h.kvPut.mock.calls[0]?.[0]).toBe('docs');
    expect(JSON.parse(h.kvPut.mock.calls[0]?.[1] as string)).toEqual({
      d: 'https://docs.example.com',
    });
    expect(h.kvPut.mock.calls[0]?.[2]).toEqual({ expirationTtl: 86_400 });
  });

  it('never caches past a link expiry', async () => {
    const expiresAt = Date.now() + 2 * HOUR;
    const h = createHarness({
      rows: { sale: { destination: 'https://example.com/sale', expires_at: expiresAt, active: 1 } },
    });

    await worker.fetch(get('/sale'), h.env, h.ctx);
    await h.settle();

    const ttl = (h.kvPut.mock.calls[0]?.[2] as { expirationTtl: number }).expirationTtl;
    expect(ttl).toBeGreaterThan(7100);
    expect(ttl).toBeLessThanOrEqual(7200);
  });

  it('treats an expired KV entry as a miss and re-checks D1', async () => {
    const h = createHarness({
      kv: { old: JSON.stringify({ d: 'https://stale.example.com', e: Date.now() - HOUR }) },
      rows: { old: { destination: 'https://fresh.example.com', expires_at: null, active: 1 } },
    });

    const res = await worker.fetch(get('/old'), h.env, h.ctx);

    expect(h.d1First).toHaveBeenCalledOnce();
    expect(res.headers.get('Location')).toBe('https://fresh.example.com');
  });

  it('does not resurrect a deactivated link from D1', async () => {
    const h = createHarness({
      rows: { dead: { destination: 'https://example.com/dead', expires_at: null, active: 0 } },
    });

    const res = await worker.fetch(get('/dead'), h.env, h.ctx);
    await h.settle();

    expect(res.status).toBe(404);
    expect(h.kvPut).not.toHaveBeenCalled();
  });

  it('404s an unknown slug when no fallback is configured', async () => {
    const h = createHarness();

    const res = await worker.fetch(get('/nope'), h.env, h.ctx);
    await h.settle();

    expect(res.status).toBe(404);
    expect(readClick(h.writeDataPoint).outcome).toBe('miss');
  });

  it('serves DEFAULT_REDIRECT_URL for an unknown slug when configured', async () => {
    const h = createHarness({ vars: { DEFAULT_REDIRECT_URL: 'https://domk.pro/not-found' } });

    const res = await worker.fetch(get('/nope'), h.env, h.ctx);
    await h.settle();

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://domk.pro/not-found');
    expect(readClick(h.writeDataPoint).outcome).toBe('fallback');
  });

  it('still serves the fallback when D1 is down', async () => {
    const h = createHarness({
      d1Throws: true,
      vars: { DEFAULT_REDIRECT_URL: 'https://domk.pro/not-found' },
    });

    const res = await worker.fetch(get('/anything'), h.env, h.ctx);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://domk.pro/not-found');
  });

  it('honours a configured permanent redirect status for real links only', async () => {
    const h = createHarness({
      kv: { gh: JSON.stringify({ d: 'https://github.com' }) },
      vars: { REDIRECT_STATUS: '308', DEFAULT_REDIRECT_URL: 'https://domk.pro/not-found' },
    });

    expect((await worker.fetch(get('/gh'), h.env, h.ctx)).status).toBe(308);
    // The fallback stays a 302 — a permanent redirect for a slug that may yet
    // be created would be cached by browsers forever.
    expect((await worker.fetch(get('/unknown'), h.env, h.ctx)).status).toBe(302);
  });

  it('rejects non-GET methods', async () => {
    const h = createHarness();
    const req = new Request('https://domk.pro/gh', { method: 'POST' }) as unknown as Request;

    const res = await worker.fetch(req, h.env, h.ctx);

    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, HEAD');
  });

  it('answers well-known paths without any storage access', async () => {
    const h = createHarness();

    expect((await worker.fetch(get('/favicon.ico'), h.env, h.ctx)).status).toBe(204);
    expect((await worker.fetch(get('/robots.txt'), h.env, h.ctx)).status).toBe(200);
    expect((await worker.fetch(get('/healthz'), h.env, h.ctx)).status).toBe(200);
    expect(h.env.LINKS.get).not.toHaveBeenCalled();
    expect(h.writeDataPoint).not.toHaveBeenCalled();
  });

  it('handles the bare root without spending a KV read', async () => {
    const h = createHarness({ vars: { DEFAULT_REDIRECT_URL: 'https://domk.pro/home' } });

    const res = await worker.fetch(get('/'), h.env, h.ctx);
    await h.settle();

    expect(res.headers.get('Location')).toBe('https://domk.pro/home');
    expect(h.env.LINKS.get).not.toHaveBeenCalled();
  });

  it('records click context on a hit', async () => {
    const h = createHarness({ kv: { gh: JSON.stringify({ d: 'https://github.com' }) } });

    await worker.fetch(
      get('/gh', {
        Referer: 'https://news.ycombinator.com/item?id=1',
        'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      }),
      h.env,
      h.ctx,
    );
    await h.settle();

    const click = readClick(h.writeDataPoint);
    expect(click).toMatchObject({
      slug: 'gh',
      referrer: 'https://news.ycombinator.com',
      country: 'XX',
      uaFamily: 'chrome',
      outcome: 'hit',
      index: 'gh',
    });
    expect(click.timestamp).toBeGreaterThan(0);
  });
});

describe('extractSlug', () => {
  it.each([
    ['/gh', 'gh'],
    ['/gh/', 'gh'],
    ['//gh', 'gh'],
    ['/My-Link_1', 'My-Link_1'],
    ['/caf%C3%A9', 'café'],
    ['/', ''],
    ['', ''],
    ['/a/b', ''],
  ])('%s -> %s', (pathname, expected) => {
    expect(extractSlug(pathname)).toBe(expected);
  });
});
