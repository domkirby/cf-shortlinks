import { beforeEach, describe, expect, it } from 'vitest';
import type { Theme } from '@domk/shared-types';
import { call, json, resetTables } from './helpers.js';

beforeEach(resetTables);

async function createTheme(body: Record<string, unknown>): Promise<Theme> {
  const res = await json('/api/themes', 'POST', body);
  expect(res.status).toBe(201);
  return (await res.json()) as Theme;
}

describe('POST /api/themes', () => {
  it('creates a theme', async () => {
    const theme = await createTheme({ name: 'Default', backgroundColor: '#0f172a', logoUrl: null });

    expect(theme).toMatchObject({ name: 'Default', backgroundColor: '#0f172a', logoUrl: null });
    expect(theme.id).toEqual(expect.any(Number));
  });

  it('rejects a non-hex backgroundColor', async () => {
    const res = await json('/api/themes', 'POST', { name: 'Bad', backgroundColor: 'blue' });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate name with a 409', async () => {
    await createTheme({ name: 'Default', backgroundColor: '#0f172a' });

    const res = await json('/api/themes', 'POST', { name: 'Default', backgroundColor: '#ffffff' });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/themes', () => {
  it('lists themes', async () => {
    await createTheme({ name: 'A', backgroundColor: '#111111' });
    await createTheme({ name: 'B', backgroundColor: '#222222' });

    const body = (await (await call('/api/themes')).json()) as { items: Theme[] };
    expect(body.items.map((t) => t.name).sort()).toEqual(['A', 'B']);
  });
});

describe('PATCH /api/themes/:id', () => {
  it('updates fields present in the body', async () => {
    const theme = await createTheme({ name: 'A', backgroundColor: '#111111' });

    const res = await json(`/api/themes/${theme.id}`, 'PATCH', { backgroundColor: '#222222' });
    expect(res.status).toBe(200);
    expect((await res.json()) as Theme).toMatchObject({ name: 'A', backgroundColor: '#222222' });
  });

  it('404s an unknown theme', async () => {
    expect((await json('/api/themes/9999', 'PATCH', { name: 'X' })).status).toBe(404);
  });

  it('rejects an empty patch', async () => {
    const theme = await createTheme({ name: 'A', backgroundColor: '#111111' });
    expect((await json(`/api/themes/${theme.id}`, 'PATCH', {})).status).toBe(400);
  });
});

describe('DELETE /api/themes/:id', () => {
  it('deletes an unused theme', async () => {
    const theme = await createTheme({ name: 'A', backgroundColor: '#111111' });

    const res = await call(`/api/themes/${theme.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  });

  it('refuses to delete a theme still assigned to a link', async () => {
    const theme = await createTheme({ name: 'A', backgroundColor: '#111111' });
    await json('/api/links', 'POST', {
      slug: 'gh',
      destination: 'https://example.com',
      themeId: theme.id,
    });

    const res = await call(`/api/themes/${theme.id}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
  });

  it('404s an unknown theme', async () => {
    expect((await call('/api/themes/9999', { method: 'DELETE' })).status).toBe(404);
  });
});
