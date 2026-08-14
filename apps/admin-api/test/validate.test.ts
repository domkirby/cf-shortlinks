import { describe, expect, it } from 'vitest';
import {
  assertValidDestination,
  assertValidEmail,
  assertValidExpiry,
  assertValidSlug,
  assertValidTags,
  assertValidTokenName,
  generateSlug,
  parseCreateLink,
  parsePagination,
  parseUpdateLink,
} from '../src/lib/validate.js';
import { sqlString, assertValidDays } from '../src/lib/analytics-sql.js';

const NOW = 1_700_000_000_000;

describe('assertValidSlug', () => {
  it.each(['gh', 'a', 'My-Link_1', 'a'.repeat(64)])('accepts %s', (slug) => {
    expect(assertValidSlug(slug)).toBe(slug);
  });

  it.each([
    ['empty', ''],
    ['leading hyphen', '-nope'],
    ['a slash', 'a/b'],
    ['a space', 'two words'],
    ['too long', 'a'.repeat(65)],
    ['non-ascii', 'café'],
  ])('rejects %s', (_label, slug) => {
    expect(() => assertValidSlug(slug)).toThrow();
  });

  it.each(['favicon.ico', 'robots.txt', 'healthz', 'API'])(
    'rejects the reserved path %s, which the worker answers itself',
    (slug) => {
      expect(() => assertValidSlug(slug)).toThrow();
    },
  );
});

describe('assertValidDestination', () => {
  it('normalises a valid URL', () => {
    expect(assertValidDestination(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['file:', 'file:///etc/passwd'],
  ])('rejects the %s scheme', (_label, destination) => {
    expect(() => assertValidDestination(destination)).toThrow(/http or https/);
  });

  it('rejects a relative URL', () => {
    expect(() => assertValidDestination('/somewhere')).toThrow(/absolute URL/);
  });

  it('rejects an over-long URL', () => {
    expect(() => assertValidDestination(`https://example.com/${'x'.repeat(2100)}`)).toThrow(/too long/);
  });
});

describe('assertValidExpiry', () => {
  it('treats null and undefined as no expiry', () => {
    expect(assertValidExpiry(null, NOW)).toBeNull();
    expect(assertValidExpiry(undefined, NOW)).toBeNull();
  });

  it('accepts a future timestamp', () => {
    expect(assertValidExpiry(NOW + 1000, NOW)).toBe(NOW + 1000);
  });

  it.each([
    ['the past', NOW - 1],
    ['now', NOW],
  ])('rejects %s', (_label, value) => {
    expect(() => assertValidExpiry(value, NOW)).toThrow(/future/);
  });

  it('rejects a non-number', () => {
    expect(() => assertValidExpiry('tomorrow', NOW)).toThrow();
  });
});

describe('assertValidTags', () => {
  it('trims, drops blanks and de-duplicates', () => {
    expect(assertValidTags([' a ', 'a', '', 'b'])).toEqual(['a', 'b']);
  });

  it('defaults to an empty list', () => {
    expect(assertValidTags(undefined)).toEqual([]);
  });

  it.each([
    ['a non-array', 'a,b'],
    ['non-string members', [1, 2]],
    ['too many tags', Array.from({ length: 17 }, (_, i) => `t${i}`)],
    ['an over-long tag', ['x'.repeat(33)]],
  ])('rejects %s', (_label, tags) => {
    expect(() => assertValidTags(tags)).toThrow();
  });
});

describe('parseCreateLink', () => {
  it('defaults slug to null, active to true and tags to empty', () => {
    expect(parseCreateLink({ destination: 'https://example.com' }, NOW)).toEqual({
      slug: null,
      destination: 'https://example.com/',
      expiresAt: null,
      tags: [],
      active: true,
    });
  });

  it('treats an empty slug as "generate one"', () => {
    expect(parseCreateLink({ slug: '', destination: 'https://example.com' }, NOW).slug).toBeNull();
  });

  it('requires a destination', () => {
    expect(() => parseCreateLink({ slug: 'gh' }, NOW)).toThrow(/destination is required/);
  });

  it('rejects a non-object body', () => {
    expect(() => parseCreateLink(null, NOW)).toThrow(/JSON object/);
    expect(() => parseCreateLink([], NOW)).toThrow(/JSON object/);
  });
});

describe('parseUpdateLink', () => {
  it('only includes the keys actually present', () => {
    expect(parseUpdateLink({ active: false }, NOW)).toEqual({ active: false });
  });

  it('distinguishes clearing an expiry from not mentioning it', () => {
    expect(parseUpdateLink({ expiresAt: null }, NOW)).toEqual({ expiresAt: null });
    expect(parseUpdateLink({ destination: 'https://example.com' }, NOW).expiresAt).toBeUndefined();
  });

  it('rejects an empty patch rather than silently doing nothing', () => {
    expect(() => parseUpdateLink({}, NOW)).toThrow(/No updatable fields/);
  });
});

describe('generateSlug', () => {
  it('produces a valid slug of the requested length', () => {
    for (let i = 0; i < 50; i++) {
      const slug = generateSlug();
      expect(slug).toHaveLength(7);
      expect(() => assertValidSlug(slug)).not.toThrow();
    }
  });

  it('avoids visually ambiguous characters', () => {
    const sample = Array.from({ length: 200 }, () => generateSlug()).join('');
    expect(sample).not.toMatch(/[0O1lI]/);
  });

  it('does not repeat itself across many draws', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateSlug()));
    expect(seen.size).toBe(500);
  });
});

describe('parsePagination', () => {
  it('defaults to 50/0', () => {
    expect(parsePagination({})).toEqual({ limit: 50, offset: 0 });
  });

  it('clamps the limit and floors a negative offset', () => {
    expect(parsePagination({ limit: '9999', offset: '-5' })).toEqual({ limit: 200, offset: 0 });
    expect(parsePagination({ limit: '0' })).toEqual({ limit: 1, offset: 0 });
  });

  it('ignores junk', () => {
    expect(parsePagination({ limit: 'lots' })).toEqual({ limit: 50, offset: 0 });
  });
});

describe('assertValidTokenName', () => {
  it('accepts the shape Access allows', () => {
    expect(assertValidTokenName(' ci-deploy.v2 ')).toBe('ci-deploy.v2');
  });

  it.each(['', 'has/slash', "quote'name", 'x'.repeat(65)])('rejects %s', (name) => {
    expect(() => assertValidTokenName(name)).toThrow();
  });
});

describe('assertValidEmail', () => {
  it('lowercases', () => {
    expect(assertValidEmail(' Dom@Example.com ')).toBe('dom@example.com');
  });

  it.each(['nope', 'a@b', '@example.com', 'a b@example.com'])('rejects %s', (email) => {
    expect(() => assertValidEmail(email)).toThrow();
  });
});

describe('sqlString', () => {
  it('escapes quotes and backslashes', () => {
    expect(sqlString("o'brien")).toBe("'o\\'brien'");
    expect(sqlString('back\\slash')).toBe("'back\\\\slash'");
  });

  it('neutralises an injection attempt in a slug', () => {
    // The SQL API takes a raw string with no bound parameters, so this escape
    // is the only thing between a slug and the query.
    expect(sqlString("x' OR 1=1 --")).toBe("'x\\' OR 1=1 --'");
  });
});

describe('assertValidDays', () => {
  it('defaults and parses', () => {
    expect(assertValidDays(undefined)).toBe(7);
    expect(assertValidDays('30')).toBe(30);
  });

  it.each(['0', '91', '-1', 'week'])('rejects %s', (raw) => {
    expect(() => assertValidDays(raw)).toThrow();
  });
});
