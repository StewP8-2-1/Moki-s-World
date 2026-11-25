import { getSql } from '../_lib/db.js';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';
import { validateScene, validateObject } from '../_lib/validate.js';
import { touchDraft } from '../_lib/draft.js';

/**
 * POST /api/admin/restore  { version } -> replaces the DRAFT with a published version's snapshot.
 * Nothing goes live until the next publish.
 */
export const POST = handle(async (request) => {
  await requireAdmin(request);
  requireJson(request);
  const { version } = await readJson(request);
  if (!Number.isInteger(version)) throw new HttpError(400, 'version must be a number');
  const sql = getSql();
  const [row] = await sql`SELECT snapshot FROM world_versions WHERE id = ${version}`;
  if (!row) throw new HttpError(404, `Version ${version} not found`);

  const scenes = row.snapshot.scenes || [];
  const sceneIds = new Set(scenes.map((s) => s.id));
  const statements = [sql`DELETE FROM objects`, sql`DELETE FROM scenes`];
  let objectCount = 0;
  for (const raw of scenes) {
    const s = validateScene(raw);
    statements.push(sql`INSERT INTO scenes (id, name, mode, width, height, spawn_x, spawn_y, background, ground, sort)
      VALUES (${s.id}, ${s.name}, ${s.mode}, ${s.width}, ${s.height}, ${s.spawn.x}, ${s.spawn.y}, ${s.background}, ${s.ground}, ${s.sort})`);
    for (const rawObj of raw.objects || []) {
      const o = validateObject(rawObj, { sceneIds });
      statements.push(sql`INSERT INTO objects (id, scene_id, type, x, y, size, rotation, depth, visible, props)
        VALUES (${rawObj.id}, ${s.id}, ${o.type}, ${o.x}, ${o.y}, ${o.size}, ${o.rotation}, ${o.depth}, ${o.visible}, ${o.props})`);
      objectCount++;
    }
  }
  statements.push(touchDraft(sql));
  await sql.transaction(statements);
  return json({ ok: true, version, scenes: scenes.length, objects: objectCount });
});
