import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { LinkResponse, ListLinksResponse } from '@domk/shared-types';
import { call, json, kvRecord, resetTables } from './helpers.js';

const DEST = 'https://example.com/target';

beforeEach(resetTables);

async function createLink(body: Record<string, unknown>): Promise<LinkResponse> {
  const res = await json('/api/links', 'POST', body);
  expect(res.status).toBe(201);
  return (await res.json()) as LinkResponse;
}

describe('POST /api/links', () => {
  it('creates a link and writes it through to KV', async () => {
    const { link, shortUrl } = await createLink({ slug: 'gh', destination: DEST, tags: ['work'] });

    expect(link).toMatchObject({ slug: 'gh', destination: DEST, active: true, tags: ['work'] });
    expect(link.ownerEmail).toBe('dev@example.com');
    expect(shortUrl).toBe('https://domk.pro/gh');
    expect(await kvRecord('gh')).toEqual({ d: DEST });
  });

  it('generates a slug when none is given', async () => {
    const { link } = await createLink({ destination: DEST });

    expect(link.slug).toMatch(/^[A-Za-z0-9]{7}$/);
    expect(await kvRecord(link.slug)).toEqual({ d: DEST });
  });

  it('stores the expiry in the KV record so the edge can enforce it', async () => {
    const expiresAt = Date.now() + 7 * 86_400_000;
    const { link } = await createLink({ slug: 'sale', destination: DEST, expiresAt });

    expect(link.expiresAt).toBe(expiresAt);
    expect(await kvRecord('sale')).toEqual({ d: DEST, e: expiresAt });
  });

  it('does not cache a link created inactive', async () => {
    const { link } = await createLink({ slug: 'draft', destination: DEST, active: false });

    expect(link.active).toBe(false);
    expect(await env.LINKS.get('draft')).toBeNull();
  });

  it('rejects a duplicate slug with a 409', async () => {
    await createLink({ slug: 'gh', destination: DEST });

    const res = await json('/api/links', 'POST', { slug: 'gh', destination: DEST });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: 'conflict' } });
  });

  it('rejects a javascript: destination', async () => {
    const res = await json('/api/links', 'POST', { slug: 'xss', destination: 'javascript:alert(1)' });

    expect(res.status).toBe(400);
    expect(await env.LINKS.get('xss')).toBeNull();
  });

  it('rejects a malformed body', async () => {
    const res = await call('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/links', () => {
  beforeEach(async () => {
    await createLink({ slug: 'alpha', destination: 'https://alpha.example.com', tags: ['go'] });
    await createLink({ slug: 'beta', destination: 'https://beta.example.com', tags: ['google'] });
    await createLink({ slug: 'gamma', destination: 'https://gamma.example.com', active: false });
  });

  it('lists newest first with a total', async () => {
    const body = (await (await call('/api/links')).json()) as ListLinksResponse;

    expect(body.total).toBe(3);
    expect(body.items.map((l) => l.slug)).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('filters by slug or destination substring', async () => {
    const body = (await (await call('/api/links?q=beta')).json()) as ListLinksResponse;
    expect(body.items.map((l) => l.slug)).toEqual(['beta']);
  });

  it('filters by active state', async () => {
    const body = (await (await call('/api/links?active=false')).json()) as ListLinksResponse;
    expect(body.items.map((l) => l.slug)).toEqual(['gamma']);
  });

  it('matches a tag exactly rather than by prefix', async () => {
    const body = (await (await call('/api/links?tag=go')).json()) as ListLinksResponse;
    expect(body.items.map((l) => l.slug)).toEqual(['alpha']);
  });

  it('paginates', async () => {
    const body = (await (await call('/api/links?limit=2&offset=2')).json()) as ListLinksResponse;
    expect(body).toMatchObject({ limit: 2, offset: 2, total: 3 });
    expect(body.items).toHaveLength(1);
  });
});

describe('PATCH /api/links/:id', () => {
  it('updates the destination and refreshes the cache', async () => {
    const { link } = await createLink({ slug: 'gh', destination: DEST });

    const res = await json(`/api/links/${link.id}`, 'PATCH', { destination: 'https://new.example.com/x' });

    expect(res.status).toBe(200);
    expect(await kvRecord('gh')).toEqual({ d: 'https://new.example.com/x' });
  });

  it('hard-deletes the cache entry on deactivation', async () => {
    const { link } = await createLink({ slug: 'gh', destination: DEST });

    await json(`/api/links/${link.id}`, 'PATCH', { active: false });

    // §8: no tombstone — a killed slug 404s at the edge immediately.
    expect(await env.LINKS.get('gh')).toBeNull();
  });

  it('re-caches on reactivation', async () => {
    const { link } = await createLink({ slug: 'gh', destination: DEST, active: false });

    await json(`/api/links/${link.id}`, 'PATCH', { active: true });

    expect(await kvRecord('gh')).toEqual({ d: DEST });
  });

  it('drops the old key on rename', async () => {
    const { link } = await createLink({ slug: 'old', destination: DEST });

    await json(`/api/links/${link.id}`, 'PATCH', { slug: 'new' });

    expect(await env.LINKS.get('old')).toBeNull();
    expect(await kvRecord('new')).toEqual({ d: DEST });
  });

  it('refuses to rename onto a taken slug', async () => {
    await createLink({ slug: 'taken', destination: DEST });
    const { link } = await createLink({ slug: 'mine', destination: DEST });

    const res = await json(`/api/links/${link.id}`, 'PATCH', { slug: 'taken' });

    expect(res.status).toBe(409);
    // The original slug must survive a rejected rename.
    expect(await kvRecord('mine')).toEqual({ d: DEST });
  });

  it('can be addressed by slug as well as id', async () => {
    await createLink({ slug: 'gh', destination: DEST });

    const res = await json('/api/links/gh', 'PATCH', { tags: ['x'] });

    expect(res.status).toBe(200);
  });

  it('rejects an empty patch', async () => {
    const { link } = await createLink({ slug: 'gh', destination: DEST });
    expect((await json(`/api/links/${link.id}`, 'PATCH', {})).status).toBe(400);
  });

  it('404s an unknown link', async () => {
    expect((await json('/api/links/9999', 'PATCH', { active: false })).status).toBe(404);
  });
});

describe('DELETE /api/links/:id', () => {
  it('removes the row and the cache entry', async () => {
    const { link } = await createLink({ slug: 'gh', destination: DEST });

    const res = await call(`/api/links/${link.id}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(await env.LINKS.get('gh')).toBeNull();
    expect((await call(`/api/links/${link.id}`)).status).toBe(404);
  });

  it('404s an unknown link', async () => {
    expect((await call('/api/links/9999', { method: 'DELETE' })).status).toBe(404);
  });
});
