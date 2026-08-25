import type { Actor } from '@domk/shared-types';

export interface Env {
  /** Source of truth. */
  DB: D1Database;
  /** Redirect cache. Every mutation writes through to this namespace. */
  LINKS: KVNamespace;

  /** Zero Trust team domain, e.g. "acme" or "acme.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN: string;
  /** AUD tag of the links.example.com Access application. */
  ACCESS_AUD: string;

  /** Host the short links live on, used to build shortUrl in responses. */
  SHORT_DOMAIN: string;

  /** Cloudflare account that owns the Analytics Engine dataset. */
  CF_ACCOUNT_ID: string;
  /** API token with Account Analytics:Read. Secret — set via `wrangler secret put`. */
  CF_ANALYTICS_API_TOKEN: string;
  /** Dataset name, default "link_clicks". */
  ANALYTICS_DATASET?: string;

  /** TTL for KV entries written on mutation, seconds. Default 86400. */
  KV_TTL_SECONDS?: string;

  /**
   * Set to "1" to bypass Access verification for local `wrangler dev`, where
   * no Access proxy sits in front of the Worker. Guarded so it can only ever
   * take effect outside production — see middleware/access-jwt.ts.
   */
  DEV_BYPASS_AUTH?: string;
  /** Identity assumed under DEV_BYPASS_AUTH. */
  DEV_ACTOR_EMAIL?: string;
}

/** Hono context variables set by the auth middleware. */
export interface Variables {
  actor: Actor;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
