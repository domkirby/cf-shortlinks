export interface Env {
  /** Cache of the `links` table, keyed by slug. Never the source of truth. */
  LINKS: KVNamespace;
  /** Source of truth. Only read on a KV miss. */
  DB: D1Database;
  /** `link_clicks` dataset. */
  ANALYTICS: AnalyticsEngineDataset;

  /**
   * Where to send unknown slugs. Deploy-time constant, deliberately not in
   * D1/KV — the fallback has to keep working when D1 is unavailable. Unset
   * means "plain 404".
   */
  DEFAULT_REDIRECT_URL?: string;

  /** TTL for self-healed KV entries, seconds. Default 86400. */
  KV_TTL_SECONDS?: string;

  /** Redirect status for resolved slugs. Default 302. */
  REDIRECT_STATUS?: string;

  /**
   * Short-link apex domain, used to build the interactive-link unlock-page
   * URL for password-protected links resolved via the D1 fallback. Mirrors
   * admin-api's var of the same name.
   */
  SHORT_DOMAIN?: string;
}
