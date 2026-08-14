import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import {
  AccessVerifyError,
  certsUrl,
  extractAccessJwt,
  identityFromPayload,
  normalizeTeamDomain,
  verifyAccessJwt,
  __resetJwksCache,
} from '../src/index.js';

const TEAM = 'acme';
const ISSUER = 'https://acme.cloudflareaccess.com';
const AUD = 'a'.repeat(64);
const KID = 'test-key-1';

let privateKey: CryptoKey;
let publicJwk: JWK;

async function setupKeys() {
  const pair = await generateKeyPair('RS256', { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
}

function mockJwksEndpoint() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

interface TokenOverrides {
  aud?: string;
  issuer?: string;
  email?: string;
  commonName?: string;
  expiresIn?: string;
  issuedAt?: number;
}

async function signToken(overrides: TokenOverrides = {}): Promise<string> {
  const jwt = new SignJWT({
    ...(overrides.email !== undefined ? { email: overrides.email } : {}),
    ...(overrides.commonName !== undefined ? { common_name: overrides.commonName } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.aud ?? AUD)
    .setSubject('subject-123')
    .setIssuedAt(overrides.issuedAt)
    .setExpirationTime(overrides.expiresIn ?? '1h');
  return jwt.sign(privateKey);
}

const config = { teamDomain: TEAM, aud: AUD };

beforeEach(async () => {
  await setupKeys();
  __resetJwksCache();
  mockJwksEndpoint();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeTeamDomain', () => {
  it('accepts a bare team name, a hostname, or a full URL', () => {
    expect(normalizeTeamDomain('acme')).toBe(ISSUER);
    expect(normalizeTeamDomain('acme.cloudflareaccess.com')).toBe(ISSUER);
    expect(normalizeTeamDomain('https://acme.cloudflareaccess.com/')).toBe(ISSUER);
  });

  it('rejects an empty team domain as a config error, not an auth failure', () => {
    expect(() => normalizeTeamDomain('  ')).toThrowError(
      expect.objectContaining({ code: 'misconfigured', status: 500 }),
    );
  });

  it('builds the certs URL', () => {
    expect(certsUrl('acme')).toBe(`${ISSUER}/cdn-cgi/access/certs`);
  });
});

describe('verifyAccessJwt', () => {
  it('accepts a well-formed human token', async () => {
    const payload = await verifyAccessJwt(await signToken({ email: 'dom@example.com' }), config);
    expect(payload.email).toBe('dom@example.com');
    expect(payload.iss).toBe(ISSUER);
  });

  it('accepts a service-token assertion carrying common_name', async () => {
    const payload = await verifyAccessJwt(await signToken({ commonName: 'ci-deploy' }), config);
    expect(payload.common_name).toBe('ci-deploy');
    expect(payload.email).toBeUndefined();
  });

  it('rejects a token minted for a different Access app', async () => {
    await expect(
      verifyAccessJwt(await signToken({ email: 'dom@example.com', aud: 'b'.repeat(64) }), config),
    ).rejects.toThrowError(expect.objectContaining({ code: 'wrong_audience' }));
  });

  it('rejects a token from another team', async () => {
    await expect(
      verifyAccessJwt(
        await signToken({ email: 'dom@example.com', issuer: 'https://evil.cloudflareaccess.com' }),
        config,
      ),
    ).rejects.toThrowError(expect.objectContaining({ code: 'wrong_issuer' }));
  });

  it('rejects an expired token', async () => {
    const token = await signToken({
      email: 'dom@example.com',
      issuedAt: Math.floor(Date.now() / 1000) - 7200,
      expiresIn: '-1h',
    });
    await expect(verifyAccessJwt(token, config)).rejects.toThrowError(
      expect.objectContaining({ code: 'expired_token' }),
    );
  });

  it('rejects a token signed by a key that is not in the JWKS', async () => {
    const foreign = await generateKeyPair('RS256', { extractable: true });
    const token = await new SignJWT({ email: 'dom@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'someone-elses-key' })
      .setIssuer(ISSUER)
      .setAudience(AUD)
      .setExpirationTime('1h')
      .sign(foreign.privateKey);

    await expect(verifyAccessJwt(token, config)).rejects.toBeInstanceOf(AccessVerifyError);
  });

  it('rejects an empty token without hitting the network', async () => {
    const fetchMock = mockJwksEndpoint();
    await expect(verifyAccessJwt('', config)).rejects.toThrowError(
      expect.objectContaining({ code: 'missing_token' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a missing AUD as a server misconfiguration', async () => {
    await expect(
      verifyAccessJwt(await signToken({ email: 'dom@example.com' }), { teamDomain: TEAM, aud: '' }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'misconfigured', status: 500 }));
  });

  it('reuses the cached JWKS across verifications', async () => {
    const fetchMock = mockJwksEndpoint();
    await verifyAccessJwt(await signToken({ email: 'a@example.com' }), config);
    await verifyAccessJwt(await signToken({ email: 'b@example.com' }), config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('identityFromPayload', () => {
  const base = { aud: AUD, iss: ISSUER, sub: 's', exp: 0, iat: 0 };

  it('lowercases and trims human emails', () => {
    expect(identityFromPayload({ ...base, email: '  Dom@Example.COM ' })).toEqual({
      kind: 'human',
      email: 'dom@example.com',
    });
  });

  it('routes common_name to the service path', () => {
    expect(identityFromPayload({ ...base, common_name: 'ci-deploy' })).toEqual({
      kind: 'service',
      commonName: 'ci-deploy',
    });
  });

  it('prefers common_name when both claims are present', () => {
    const identity = identityFromPayload({
      ...base,
      common_name: 'ci-deploy',
      email: 'non-person@example.com',
    });
    expect(identity).toEqual({ kind: 'service', commonName: 'ci-deploy' });
  });

  it('rejects an assertion with no usable identity claim', () => {
    expect(() => identityFromPayload({ ...base })).toThrowError(
      expect.objectContaining({ code: 'invalid_token', status: 403 }),
    );
  });
});

describe('extractAccessJwt', () => {
  it('prefers the Access header', () => {
    const req = new Request('https://links.domk.pro/api/links', {
      headers: { 'Cf-Access-Jwt-Assertion': 'header-token', Cookie: 'CF_Authorization=cookie-token' },
    });
    expect(extractAccessJwt(req)).toBe('header-token');
  });

  it('falls back to the CF_Authorization cookie', () => {
    const req = new Request('https://links.domk.pro/api/links', {
      headers: { Cookie: 'other=1; CF_Authorization=cookie-token; trailing=2' },
    });
    expect(extractAccessJwt(req)).toBe('cookie-token');
  });

  it('returns null when neither is present', () => {
    const req = new Request('https://links.domk.pro/api/links', {
      headers: { Cookie: 'other=1' },
    });
    expect(extractAccessJwt(req)).toBeNull();
  });
});
