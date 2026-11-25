import { getSql } from '../_lib/db.js';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';
import { validateScene } from '../_lib/validate.js';
import { touchDraft, toScene } from '../_lib/draft.js';

/** GET /api/admin/scenes -> all scenes (draft), without objects */
export const GET = handle(async (request) => {
  await requireAdmin(request);
  const rows = await getSql()`SELECT * FROM scenes ORDER BY sort, id`;
  return json({ scenes: rows.map(toScene) }, 200, { 'Cache-Control': 'no-store' });
});

/** POST /api/admin/scenes  { id, name, mode, width, height, spawn, background, ground, sort? } */
export const POST = handle(async (request) => {
  await requireAdmin(request);
  requireJson(request);
  const body = await readJson(request);
  const sql = getSql();
  if (body.sort == null) {
    const [{ next }] = await sql`SELECT coalesce(max(sort), -1) + 1 AS next FROM scenes`;
    body.sort = next;
  }
  const s = validateScene(body);
  const [rows] = await sql.transaction([
    sql`INSERT INTO scenes (id, name, mode, width, height, spawn_x, spawn_y, background, ground, sort)
        VALUES (${s.id}, ${s.name}, ${s.mode}, ${s.width}, ${s.height}, ${s.spawn.x}, ${s.spawn.y}, ${s.background}, ${s.ground}, ${s.sort})
        ON CONFLICT (id) DO NOTHING RETURNING *`,
    touchDraft(sql),
  ]);
  if (!rows.length) throw new HttpError(409, `A scene with id "${s.id}" already exists`);
  return json({ scene: toScene(rows[0]) }, 201);
});
