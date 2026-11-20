interface Env {
  DB: D1Database;
  ROOM: DurableObjectNamespace<import('./room/RoomDO').RoomDO>;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  /** HMAC key for session cookies (>= 32 chars). Local: .dev.vars; deploy: `npx wrangler secret put SESSION_SECRET`. */
  SESSION_SECRET: string;
}
