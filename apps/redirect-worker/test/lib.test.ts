import { describe, expect, it } from 'vitest';
import { encodeKvRecord, isExpired, kvTtlSeconds, parseKvRecord } from '../src/lib/kv-lookup.js';
import { referrerOrigin, uaFamily } from '../src/lib/analytics.js';
import type { Env } from '../src/env.js';

const env = (vars: Partial<Env> = {}) => vars as Env;

describe('parseKvRecord', () => {
  it('parses the JSON record the admin API writes', () => {
    expect(parseKvRecord('{"d":"https://example.com","e":123}')).toEqual({
      destination: 'https://example.com',
      expiresAt: 123,
    });
  });

  it('accepts a hand-seeded bare URL', () => {
    expect(parseKvRecord('  https://example.com  ')).toEqual({
      destination: 'https://example.com',
      expiresAt: null,
    });
  });

  it.each([
    ['missing key', null],
    ['empty value', '   '],
    ['malformed JSON', '{"d":'],
    ['no destination', '{"e":123}'],
    ['empty destination', '{"d":""}'],
    ['a bare word', 'null'],
    ['a relative path', '/somewhere'],
  ])('returns null so %s falls through to D1', (_label, raw) => {
    expect(parseKvRecord(raw)).toBeNull();
  });

  it('refuses a non-http scheme from either shape', () => {
    // Last gate before the value becomes a Location header.
    expect(parseKvRecord('javascript:alert(1)')).toBeNull();
    expect(parseKvRecord('{"d":"javascript:alert(1)"}')).toBeNull();
  });
});

describe('isExpired', () => {
  const now = 1_000_000;

  it('never expires a null expiry', () => {
    expect(isExpired({ destination: 'x', expiresAt: null }, now)).toBe(false);
  });

  it('expires on the boundary', () => {
    expect(isExpired({ destination: 'x', expiresAt: now }, now)).toBe(true);
    expect(isExpired({ destination: 'x', expiresAt: now + 1 }, now)).toBe(false);
  });
});

describe('kvTtlSeconds', () => {
  const now = 1_000_000;

  it('uses the configured default when a link never expires', () => {
    expect(kvTtlSeconds(env({ KV_TTL_SECONDS: '600' }), { destination: 'x', expiresAt: null }, now)).toBe(600);
  });

  it('falls back to 24h when the var is missing or junk', () => {
    expect(kvTtlSeconds(env(), { destination: 'x', expiresAt: null }, now)).toBe(86_400);
    expect(kvTtlSeconds(env({ KV_TTL_SECONDS: 'soon' }), { destination: 'x', expiresAt: null }, now)).toBe(86_400);
  });

  it('clamps to the link expiry', () => {
    expect(kvTtlSeconds(env(), { destination: 'x', expiresAt: now + 300_000 }, now)).toBe(300);
  });

  it('skips the write when less than KV’s 60s minimum remains', () => {
    expect(kvTtlSeconds(env(), { destination: 'x', expiresAt: now + 30_000 }, now)).toBeUndefined();
    expect(kvTtlSeconds(env(), { destination: 'x', expiresAt: now - 1 }, now)).toBeUndefined();
  });
});

describe('encodeKvRecord', () => {
  it('omits the expiry key entirely when there is none', () => {
    expect(encodeKvRecord({ destination: 'https://example.com', expiresAt: null })).toBe(
      '{"d":"https://example.com"}',
    );
  });
});

describe('uaFamily', () => {
  it.each([
    ['Mozilla/5.0 Chrome/131.0 Safari/537.36', 'chrome'],
    ['Mozilla/5.0 Chrome/131.0 Safari/537.36 Edg/131.0', 'edge'],
    ['Mozilla/5.0 Firefox/134.0', 'firefox'],
    ['Mozilla/5.0 (iPhone) Version/18.0 Safari/605.1', 'safari'],
    ['curl/8.7.1', 'tool'],
    ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'bot'],
    ['', 'unknown'],
  ])('%s -> %s', (ua, expected) => {
    expect(uaFamily(ua || null)).toBe(expected);
  });
});

describe('referrerOrigin', () => {
  it('keeps only the origin', () => {
    expect(referrerOrigin('https://news.ycombinator.com/item?id=42#c')).toBe(
      'https://news.ycombinator.com',
    );
  });

  it('labels a missing referrer', () => {
    expect(referrerOrigin(null)).toBe('direct');
  });

  it('passes through something that is not a URL', () => {
    expect(referrerOrigin('android-app')).toBe('android-app');
  });
});
