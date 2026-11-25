import { neon } from '@neondatabase/serverless';

let sql;

/** Lazily create the Neon HTTP client. Throws a clear error if DATABASE_URL is missing. */
export function getSql() {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    const err = new Error('DATABASE_URL is not configured');
    err.status = 503;
    throw err;
  }
  sql = neon(url);
  return sql;
}
