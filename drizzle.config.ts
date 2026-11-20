import type { Config } from 'drizzle-kit';

// `driver: 'd1-http'` is only needed for push/studio against remote D1 and requires
// dbCredentials; generation works from the schema alone.
export default {
  schema: './worker/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
} satisfies Config;
