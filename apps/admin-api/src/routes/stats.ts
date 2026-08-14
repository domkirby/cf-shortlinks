import { Hono } from 'hono';
import type { LinkStats, StatsBreakdownRow, StatsPoint } from '@domk/shared-types';
import type { AppEnv } from '../env.js';
import {
  CLICK_COUNT,
  assertValidDays,
  dataset,
  querySql,
  sqlString,
} from '../lib/analytics-sql.js';

const app = new Hono<AppEnv>();

interface BucketRow {
  bucket: string;
  clicks: number | string;
}
interface KeyRow {
  key: string;
  clicks: number | string;
}

const num = (value: number | string): number =>
  typeof value === 'number' ? value : Number.parseFloat(value) || 0;

const toSeries = (rows: BucketRow[]): StatsPoint[] =>
  rows.map((r) => ({ bucket: r.bucket, clicks: num(r.clicks) }));

const toBreakdown = (rows: KeyRow[]): StatsBreakdownRow[] =>
  rows.map((r) => ({ key: r.key || 'unknown', clicks: num(r.clicks) }));

/**
 * Column map for the `link_clicks` dataset — the positional blob/double
 * layout the redirect worker writes. Named here so the SQL below reads like
 * the schema table in the architecture doc.
 */
const COL = {
  slug: 'blob1',
  referrer: 'blob2',
  country: 'blob3',
  uaFamily: 'blob4',
  outcome: 'blob5',
} as const;

function window(days: number): string {
  return `timestamp >= NOW() - INTERVAL '${days}' DAY`;
}

/** Hourly buckets for a short window, daily beyond that. */
function bucketExpr(days: number): string {
  return days <= 2
    ? "toStartOfInterval(timestamp, INTERVAL '1' HOUR)"
    : "toStartOfInterval(timestamp, INTERVAL '1' DAY)";
}

/**
 * GET /api/stats/overview?days=7
 *
 * Instance-wide: clicks over time, the busiest links, and the misses. The
 * misses are the point of logging them — they show which dead slugs are being
 * hit often enough to be worth creating.
 */
app.get('/overview', async (c) => {
  const days = assertValidDays(c.req.query('days'));
  const ds = dataset(c.env);
  const since = Date.now() - days * 86_400_000;

  const [series, topLinks, countries, misses] = await Promise.all([
    querySql<BucketRow>(
      c.env,
      `SELECT ${bucketExpr(days)} AS bucket, ${CLICK_COUNT} AS clicks
       FROM ${ds}
       WHERE ${window(days)} AND ${COL.outcome} = 'hit'
       GROUP BY bucket ORDER BY bucket`,
    ),
    querySql<KeyRow>(
      c.env,
      `SELECT ${COL.slug} AS key, ${CLICK_COUNT} AS clicks
       FROM ${ds}
       WHERE ${window(days)} AND ${COL.outcome} = 'hit'
       GROUP BY key ORDER BY clicks DESC LIMIT 20`,
    ),
    querySql<KeyRow>(
      c.env,
      `SELECT ${COL.country} AS key, ${CLICK_COUNT} AS clicks
       FROM ${ds}
       WHERE ${window(days)} AND ${COL.outcome} = 'hit'
       GROUP BY key ORDER BY clicks DESC LIMIT 20`,
    ),
    querySql<KeyRow>(
      c.env,
      `SELECT ${COL.slug} AS key, ${CLICK_COUNT} AS clicks
       FROM ${ds}
       WHERE ${window(days)} AND ${COL.outcome} != 'hit'
       GROUP BY key ORDER BY clicks DESC LIMIT 20`,
    ),
  ]);

  return c.json({
    since,
    until: Date.now(),
    days,
    totalClicks: toSeries(series).reduce((sum, point) => sum + point.clicks, 0),
    series: toSeries(series),
    topLinks: toBreakdown(topLinks),
    byCountry: toBreakdown(countries),
    topMisses: toBreakdown(misses),
  });
});

/** GET /api/stats/links/:slug?days=7 — per-link detail. */
app.get('/links/:slug', async (c) => {
  const slug = c.req.param('slug');
  const days = assertValidDays(c.req.query('days'));
  const ds = dataset(c.env);
  const since = Date.now() - days * 86_400_000;
  const scope = `${window(days)} AND ${COL.outcome} = 'hit' AND ${COL.slug} = ${sqlString(slug)}`;

  const [series, countries, referrers] = await Promise.all([
    querySql<BucketRow>(
      c.env,
      `SELECT ${bucketExpr(days)} AS bucket, ${CLICK_COUNT} AS clicks
       FROM ${ds} WHERE ${scope} GROUP BY bucket ORDER BY bucket`,
    ),
    querySql<KeyRow>(
      c.env,
      `SELECT ${COL.country} AS key, ${CLICK_COUNT} AS clicks
       FROM ${ds} WHERE ${scope} GROUP BY key ORDER BY clicks DESC LIMIT 20`,
    ),
    querySql<KeyRow>(
      c.env,
      `SELECT ${COL.referrer} AS key, ${CLICK_COUNT} AS clicks
       FROM ${ds} WHERE ${scope} GROUP BY key ORDER BY clicks DESC LIMIT 20`,
    ),
  ]);

  const body: LinkStats = {
    slug,
    since,
    until: Date.now(),
    totalClicks: toSeries(series).reduce((sum, point) => sum + point.clicks, 0),
    series: toSeries(series),
    byCountry: toBreakdown(countries),
    byReferrer: toBreakdown(referrers),
  };
  return c.json(body);
});

export default app;
