import { getSql } from '../_lib/db.js';
import { handle, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';

/** GET /api/admin/versions -> published versions, newest first (with scene/object counts). */
export const GET = handle(async (request) => {
  await requireAdmin(request);
  const rows = await getSql()`
    SELECT id, published_at, note,
           jsonb_array_length(snapshot->'scenes') AS scenes,
           (SELECT coalesce(sum(jsonb_array_length(s->'objects')), 0)::int FROM jsonb_array_elements(snapshot->'scenes') s) AS objects
    FROM world_versions ORDER BY id DESC LIMIT 100`;
  const versions = rows.map((r) => ({ version: r.id, publishedAt: r.published_at, note: r.note, scenes: r.scenes, objects: r.objects }));
  return json({ versions }, 200, { 'Cache-Control': 'no-store' });
});
