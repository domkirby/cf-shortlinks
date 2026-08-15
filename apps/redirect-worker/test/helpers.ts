import { vi } from 'vitest';
import type { Env } from '../src/env.js';

export interface D1Row {
  destination: string;
  expires_at: number | null;
  active: number;
  password_protected?: number;
}

export interface TestHarness {
  env: Env;
  ctx: ExecutionContext;
  kv: Map<string, string>;
  kvPut: ReturnType<typeof vi.fn>;
  d1First: ReturnType<typeof vi.fn>;
  writeDataPoint: ReturnType<typeof vi.fn>;
  /** Resolves everything handed to ctx.waitUntil. */
  settle: () => Promise<void>;
}

export interface HarnessOptions {
  kv?: Record<string, string>;
  rows?: Record<string, D1Row>;
  vars?: Partial<Pick<Env, 'DEFAULT_REDIRECT_URL' | 'KV_TTL_SECONDS' | 'REDIRECT_STATUS' | 'SHORT_DOMAIN'>>;
  d1Throws?: boolean;
}

export function createHarness(options: HarnessOptions = {}): TestHarness {
  const kv = new Map(Object.entries(options.kv ?? {}));
  const rows = options.rows ?? {};
  const pending: Promise<unknown>[] = [];

  const kvPut = vi.fn(async (key: string, value: string) => {
    kv.set(key, value);
  });

  const d1First = vi.fn(async (slug: string): Promise<D1Row | null> => {
    if (options.d1Throws) throw new Error('D1_ERROR: connection reset');
    return rows[slug] ?? null;
  });

  const writeDataPoint = vi.fn();

  const env = {
    LINKS: {
      get: vi.fn(async (key: string) => kv.get(key) ?? null),
      put: kvPut,
      delete: vi.fn(async (key: string) => {
        kv.delete(key);
      }),
    },
    DB: {
      prepare: (_sql: string) => ({
        bind: (slug: string) => ({
          first: async <T>() => (await d1First(slug)) as T | null,
        }),
      }),
    },
    ANALYTICS: { writeDataPoint },
    SHORT_DOMAIN: 'domk.pro',
    ...options.vars,
  } as unknown as Env;

  const ctx = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  return {
    env,
    ctx,
    kv,
    kvPut,
    d1First,
    writeDataPoint,
    settle: async () => {
      await Promise.all(pending);
    },
  };
}

export function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://domk.pro${path}`, { headers }) as unknown as Request;
}

/** The blobs array as written to Analytics Engine, named. */
export function readClick(writeDataPoint: ReturnType<typeof vi.fn>, call = 0) {
  const point = writeDataPoint.mock.calls[call]?.[0] as
    | { blobs: string[]; doubles: number[]; indexes: string[] }
    | undefined;
  if (!point) throw new Error(`no analytics write at index ${call}`);
  return {
    slug: point.blobs[0],
    referrer: point.blobs[1],
    country: point.blobs[2],
    uaFamily: point.blobs[3],
    outcome: point.blobs[4],
    timestamp: point.doubles[0],
    index: point.indexes[0],
  };
}
