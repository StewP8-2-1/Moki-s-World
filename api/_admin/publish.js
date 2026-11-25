import { getSql } from '../_lib/db.js';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';
import { loadDraft } from '../_lib/world.js';

/** POST /api/admin/publish  { note? } -> snapshots the draft into a new world_versions row (goes live). */
export const POST = handle(async (request) => {
  await requireAdmin(request);
  requireJson(request);
  const { note } = await readJson(request);
  if (note != null && (typeof note !== 'string' || note.length > 200)) throw new HttpError(400, 'Note must be text (max 200 characters)');
  const sql = getSql();
  const { version, publishedAt, ...snapshot } = await loadDraft(sql);
  if (!snapshot.scenes.length) throw new HttpError(400, 'Nothing to publish');

  const [rows] = await sql.transaction([
    sql`INSERT INTO world_versions (snapshot, note) VALUES (${snapshot}, ${note?.trim() || null}) RETURNING id, published_at, note`,
    // Draft now equals the live version
    sql`UPDATE draft_state SET changed_at = now() - interval '1 millisecond' WHERE id = 1`,
  ]);
  const v = rows[0];
  return json({ published: { version: v.id, publishedAt: v.published_at, note: v.note } }, 201);
});
