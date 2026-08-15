export interface Env {
  /** Source of truth. Read directly — this worker never calls admin-api. */
  DB: D1Database;
}

export type AppEnv = { Bindings: Env };
