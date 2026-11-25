import { getSql } from './_lib/db.js';
import { handle, json, error } from './_lib/http.js';

/**
 * GET /api/world — the latest published world snapshot (public, CDN-cached).
 * Draft preview (?draft=1 with admin cookie) is added in Phase 5.
 */
export const GET = handle(async () => {
  const sql = getSql();
  const rows = await sql`SELECT id, snapshot, published_at FROM world_versions ORDER BY id DESC LIMIT 1`;
  if (rows.length === 0) return error(404, 'Nothing has been published yet');
  const { id, snapshot, published_at } = rows[0];
  return json(
    { ...snapshot, version: id, publishedAt: published_at },
    200,
    { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=600' },
  );
});
