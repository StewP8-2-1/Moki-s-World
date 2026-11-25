import { getSql } from './_lib/db.js';
import { handle, json, error } from './_lib/http.js';
import { requireAdmin } from './_lib/auth.js';
import { loadDraft } from './_lib/world.js';

/**
 * GET /api/world          -> the latest published world snapshot (public, CDN-cached)
 * GET /api/world?draft=1  -> the live draft, for "Preview as player" (admin cookie required, never cached)
 */
export const GET = handle(async (request) => {
  const sql = getSql();

  if (new URL(request.url).searchParams.has('draft')) {
    await requireAdmin(request);
    const world = await loadDraft(sql);
    return json({ ...world, draft: true }, 200, { 'Cache-Control': 'private, no-store' });
  }

  const rows = await sql`SELECT id, snapshot, published_at FROM world_versions ORDER BY id DESC LIMIT 1`;
  if (rows.length === 0) return error(404, 'Nothing has been published yet');
  const { id, snapshot, published_at } = rows[0];
  return json(
    { ...snapshot, version: id, publishedAt: published_at },
    200,
    {
      // Browsers: always revalidate (stale-while-revalidate in Cache-Control would make returning
      // visitors see the previous version once after a publish).
      'Cache-Control': 'public, max-age=0, must-revalidate',
      // Vercel's CDN only: cache for 60 s and serve stale while refreshing, so publishes go live within ~1 minute.
      'Vercel-CDN-Cache-Control': 'max-age=60, stale-while-revalidate=600',
    },
  );
});
