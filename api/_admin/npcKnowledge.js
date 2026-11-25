import { getSql } from '../_lib/db.js';
import { handle, json, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';
import { loadKnowledge, refreshKnowledge, isUuid } from '../_lib/npc/store.js';

/** GET /api/admin/npc-knowledge/:id -> the NPC's stored reference pages (content trimmed to a preview). */
export const GET = handle(async (request, params) => {
  await requireAdmin(request);
  if (!isUuid(params?.id)) throw new HttpError(400, 'Invalid object id');
  const rows = await loadKnowledge(getSql(), params.id);
  return json({
    knowledge: rows.map((r) => ({ url: r.url, title: r.title, chars: r.content.length, preview: r.content.slice(0, 300), fetchedAt: r.fetched_at })),
  }, 200, { 'Cache-Control': 'no-store' });
});

/**
 * POST /api/admin/npc-knowledge/:id -> re-scrape the NPC's reference URLs (from the *draft* object)
 * and replace its knowledge pack. URLs no longer listed are removed.
 */
export const POST = handle(async (request, params) => {
  await requireAdmin(request);
  requireJson(request);
  if (!isUuid(params?.id)) throw new HttpError(400, 'Invalid object id');
  const sql = getSql();
  const rows = await sql`SELECT type, props FROM objects WHERE id = ${params.id}`;
  if (!rows.length) throw new HttpError(404, 'Object not found');
  if (rows[0].type !== 'npc') throw new HttpError(400, 'Object is not an NPC');
  const results = await refreshKnowledge(sql, params.id, rows[0].props?.referenceUrls);
  return json({ results });
});
