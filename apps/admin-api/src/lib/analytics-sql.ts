import type { Env } from '../env.js';
import { badRequest, upstreamError } from './errors.js';

const SQL_API = 'https://api.cloudflare.com/client/v4/accounts';

/**
 * The Analytics Engine SQL API takes a raw SQL string — there are no bound
 * parameters — so every interpolated value goes through here.
 *
 * Slugs are already constrained by `assertValidSlug`, but stats routes also
 * accept arbitrary query strings, and "the validator upstream makes this safe"
 * is exactly the assumption that stops being true a refactor later.
 */
export function sqlString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Whole days of history to query. Bounded — AE retains 90 days. */
export function assertValidDays(raw: string | undefined, fallback = 7): number {
  if (raw === undefined || raw === '') return fallback;
  const days = Number.parseInt(raw, 10);
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    throw badRequest('days must be an integer between 1 and 90');
  }
  return days;
}

export function dataset(env: Env): string {
  const name = env.ANALYTICS_DATASET || 'link_clicks';
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw upstreamError('ANALYTICS_DATASET is not a valid dataset name');
  }
  return name;
}

interface SqlApiResponse<T> {
  data?: T[];
  rows?: number;
  meta?: unknown;
  errors?: { message: string }[];
  success?: boolean;
}

/**
 * Run a query against the Analytics Engine SQL API.
 *
 * Clicks never touch D1 — this is the only read path for them, which is what
 * keeps the links table small and free of write contention on popular links.
 */
export async function querySql<T>(env: Env, sql: string): Promise<T[]> {
  if (!env.CF_ACCOUNT_ID || !env.CF_ANALYTICS_API_TOKEN) {
    throw upstreamError(
      'Analytics is not configured: set CF_ACCOUNT_ID and the CF_ANALYTICS_API_TOKEN secret',
    );
  }

  let response: Response;
  try {
    response = await fetch(`${SQL_API}/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_ANALYTICS_API_TOKEN}`,
        'Content-Type': 'text/plain',
      },
      body: sql,
    });
  } catch (err) {
    throw upstreamError(`Could not reach the Analytics Engine SQL API: ${String(err)}`);
  }

  const text = await response.text();
  if (!response.ok) {
    // The API echoes the offending SQL in its errors; keep it out of the
    // client-facing message and put it in the log instead.
    console.error('analytics sql failed', { status: response.status, body: text, sql });
    throw upstreamError(`Analytics query failed (HTTP ${response.status})`);
  }

  let parsed: SqlApiResponse<T>;
  try {
    parsed = JSON.parse(text) as SqlApiResponse<T>;
  } catch {
    throw upstreamError('Analytics Engine returned a response that was not JSON');
  }

  if (parsed.errors?.length) {
    console.error('analytics sql error', { errors: parsed.errors, sql });
    throw upstreamError(parsed.errors[0]?.message ?? 'Analytics query failed');
  }

  return parsed.data ?? [];
}

/**
 * `sum(_sample_interval)` rather than `count()`: Analytics Engine samples
 * under load and `_sample_interval` is the weight that turns a sampled row
 * back into the number of real events it stands for. `count()` would silently
 * under-report exactly the links that got popular enough to matter.
 */
export const CLICK_COUNT = 'sum(_sample_interval)';
