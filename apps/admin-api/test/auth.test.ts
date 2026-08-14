import { beforeEach, describe, expect, it } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import app from '../src/index.js';
import { getDb } from '../src/lib/db.js';
import { resolveHumanActor } from '../src/middleware/access-jwt.js';
import { resolveServiceActor } from '../src/middleware/access-service.js';
import { call, json, resetTables, seedAdmin, seedServiceToken } from './helpers.js';

beforeEach(resetTables);

/** A request to the real hostname, where the dev bypass does not apply. */
async function callProd(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request(`https://links.domk.pro${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('Access enforcement', () => {
  it('rejects an unauthenticated request to a real hostname', async () => {
    const res = await callProd('/api/links');

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'missing_access_jwt' } });
  });

  it('ignores DEV_BYPASS_AUTH off loopback', async () => {
    // The flag is set in this test env; the hostname guard is what stops it
    // authenticating a production request.
    expect(env.DEV_BYPASS_AUTH).toBe('1');
    expect((await callProd('/api/whoami')).status).toBe(401);
  });

  it('rejects a garbage assertion rather than trusting its claims', async () => {
    const forged = `${btoa('{"alg":"none"}')}.${btoa('{"email":"attacker@example.com"}')}.`;
    const res = await callProd('/api/links', { headers: { 'Cf-Access-Jwt-Assertion': forged } });

    expect(res.status).toBe(401);
  });

  it('leaves the health probe open', async () => {
    const res = await callProd('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok' });
  });
});

describe('resolveHumanActor', () => {
  it('reads the role from the admins table', async () => {
    await seedAdmin('owner@example.com', 'owner');
    await seedAdmin('editor@example.com', 'editor');
    const db = getDb(env);

    expect(await resolveHumanActor(db, 'owner@example.com')).toEqual({
      type: 'human',
      email: 'owner@example.com',
      role: 'owner',
    });
    expect((await resolveHumanActor(db, 'editor@example.com')).role).toBe('editor');
  });

  it('403s someone who passed Access but is not an admin', async () => {
    // Authenticated fine — just not authorized. The JWT proves identity, this
    // table decides permission.
    await expect(resolveHumanActor(getDb(env), 'stranger@example.com')).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('resolveServiceActor', () => {
  it('accepts a registered, active token', async () => {
    await seedServiceToken('ci-deploy');

    expect(await resolveServiceActor(getDb(env), 'ci-deploy')).toEqual({
      type: 'service',
      name: 'ci-deploy',
    });
  });

  it('rejects a token Access accepts but this API does not know', async () => {
    await expect(resolveServiceActor(getDb(env), 'rogue')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('rejects a token revoked at the app layer', async () => {
    await seedServiceToken('retired', false);

    await expect(resolveServiceActor(getDb(env), 'retired')).rejects.toMatchObject({ status: 403 });
  });
});

describe('whoami', () => {
  it('reports the resolved actor', async () => {
    const res = await call('/api/whoami');

    expect(await res.json()).toEqual({
      actor: { type: 'human', email: 'dev@example.com', role: 'owner' },
    });
  });
});

describe('owner-gated routes', () => {
  it('lets an owner manage service tokens', async () => {
    const res = await json('/api/tokens', 'POST', { name: 'ci-deploy' });

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ name: 'ci-deploy', active: true });
  });

  it('round-trips revocation through the API', async () => {
    await json('/api/tokens', 'POST', { name: 'ci-deploy' });

    const patched = await json('/api/tokens/ci-deploy', 'PATCH', { active: false });
    expect(await patched.json()).toMatchObject({ active: false });

    // The app-layer lever: the credential still passes Access, but this API
    // now refuses it.
    await expect(resolveServiceActor(getDb(env), 'ci-deploy')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('404s a PATCH for an unregistered token', async () => {
    expect((await json('/api/tokens/nope', 'PATCH', { active: false })).status).toBe(404);
  });

  it('refuses to let an admin delete their own account', async () => {
    await seedAdmin('dev@example.com', 'owner');

    const res = await call('/api/admins/dev@example.com', { method: 'DELETE' });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: 'self_modification' } });
  });

  it('adds and lists admins', async () => {
    expect((await json('/api/admins', 'POST', { email: 'new@example.com' })).status).toBe(201);

    const body = (await (await call('/api/admins')).json()) as { items: { email: string; role: string }[] };
    expect(body.items).toEqual([{ email: 'new@example.com', role: 'editor', createdAt: expect.any(Number) }]);
  });
});

describe('routing', () => {
  it('404s an unknown route in the standard error shape', async () => {
    const res = await call('/api/nope');

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
  });
});
