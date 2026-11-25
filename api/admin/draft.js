import { getSql } from '../_lib/db.js';
import { handle, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { loadDraft } from '../_lib/world.js';

/**
 * GET /api/admin/draft -> the editable draft world (same snapshot format as /api/world)
 * plus info about the latest published version.
 */
export const GET = handle(async (request) => {
  await requireAdmin(request);
  const sql = getSql();
  const [world, latest] = await Promise.all([
    loadDraft(sql),
    sql`SELECT id, published_at, note FROM world_versions ORDER BY id DESC LIMIT 1`,
  ]);
  const published = latest[0] ? { version: latest[0].id, publishedAt: latest[0].published_at, note: latest[0].note } : null;
  return json({ world, published }, 200, { 'Cache-Control': 'no-store' });
});
