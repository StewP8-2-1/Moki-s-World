import { getSql } from '../_lib/db.js';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';
import { validateScene } from '../_lib/validate.js';
import { lastSegment, touchDraft, toScene } from '../_lib/draft.js';

const START_SCENE = 'hub';

/** PUT /api/admin/scenes/:id — update settings (the id itself is immutable). Partial bodies are merged. */
export const PUT = handle(async (request, params = {}) => {
  await requireAdmin(request);
  requireJson(request);
  const id = params.id ?? lastSegment(request);
  const patch = await readJson(request);
  const sql = getSql();
  const [existing] = await sql`SELECT * FROM scenes WHERE id = ${id}`;
  if (!existing) throw new HttpError(404, 'Scene not found');
  const current = toScene(existing);
  const s = validateScene({ ...current, ...patch, id });

  const [rows] = await sql.transaction([
    sql`UPDATE scenes SET name = ${s.name}, mode = ${s.mode}, width = ${s.width}, height = ${s.height},
          spawn_x = ${s.spawn.x}, spawn_y = ${s.spawn.y}, background = ${s.background}, ground = ${s.ground},
          sort = ${s.sort}, updated_at = now()
        WHERE id = ${id} RETURNING *`,
    touchDraft(sql),
  ]);
  return json({ scene: toScene(rows[0]) });
});

/** DELETE /api/admin/scenes/:id — refused for the start scene or while portals lead to it. */
export const DELETE = handle(async (request, params = {}) => {
  await requireAdmin(request);
  const id = params.id ?? lastSegment(request);
  if (id === START_SCENE) throw new HttpError(400, 'The hub is the start scene and cannot be deleted');
  const sql = getSql();
  const portals = await sql`
    SELECT o.scene_id, s.name FROM objects o JOIN scenes s ON s.id = o.scene_id
    WHERE o.type = 'portal' AND o.props->>'targetScene' = ${id} AND o.scene_id <> ${id}`;
  if (portals.length) {
    const where = [...new Set(portals.map((p) => p.name))].join(', ');
    throw new HttpError(400, `Remove the portals leading here first (in: ${where})`);
  }
  const [rows] = await sql.transaction([
    sql`DELETE FROM scenes WHERE id = ${id} RETURNING id`,
    touchDraft(sql),
  ]);
  if (!rows.length) throw new HttpError(404, 'Scene not found');
  return json({ ok: true });
});
