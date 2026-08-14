/** How a redirect request was resolved. Written to the `link_clicks` dataset. */
export type ClickOutcome = 'hit' | 'fallback' | 'miss';

/**
 * One row in the `link_clicks` Analytics Engine dataset.
 *
 * Field order here is the contract with the SQL API — blob1..blob5 and
 * double1..double2 map positionally onto `writeDataPoint`.
 */
export interface ClickEvent {
  /** blob1 */
  slug: string;
  /** blob2 — referrer, truncated */
  referrer: string;
  /** blob3 — request.cf.country */
  country: string;
  /** blob4 — user-agent family */
  uaFamily: string;
  /** blob5 — hit | fallback | miss */
  outcome: ClickOutcome;
  /** double1 — epoch ms */
  timestamp: number;
}

export interface StatsPoint {
  /** ISO date or hour bucket, depending on the query granularity. */
  bucket: string;
  clicks: number;
}

export interface StatsBreakdownRow {
  key: string;
  clicks: number;
}

export interface LinkStats {
  slug: string | null;
  since: number;
  until: number;
  totalClicks: number;
  series: StatsPoint[];
  byCountry: StatsBreakdownRow[];
  byReferrer: StatsBreakdownRow[];
}

export type StatsGranularity = 'hour' | 'day';
