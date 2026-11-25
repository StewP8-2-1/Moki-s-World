import { getSql } from '../_lib/db.js';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';
import { validateObject } from '../_lib/validate.js';
import { assertUuid, sceneIdSet, touchDraft, toObject } from '../_lib/draft.js';

/** GET /api/admin/objects?scene=<id> -> objects in a scene (draft) */
export const GET = handle(async (request) => {
  await requireAdmin(request);
  const sceneId = new URL(request.url).searchParams.get('scene');
  if (!sceneId) throw new HttpError(400, 'scene query parameter is required');
  const rows = await getSql()`SELECT * FROM objects WHERE scene_id = ${sceneId} ORDER BY depth, id`;
  return json({ objects: rows.map(toObject) }, 200, { 'Cache-Control': 'no-store' });
});

/**
 * POST /api/admin/objects  { id?, sceneId, type, x, y, size, rotation, depth, visible, props }
 * The client may supply the uuid (lets undo/redo re-create an object with the same id).
 */
export const POST = handle(async (request) => {
  await requireAdmin(request);
  requireJson(request);
  const body = await readJson(request);
  const sql = getSql();
  const sceneIds = await sceneIdSet(sql);
  if (!sceneIds.has(body.sceneId)) throw new HttpError(400, `Scene "${body.sceneId}" does not exist`);
  const o = validateObject(body, { sceneIds });
  const id = body.id ? assertUuid(body.id) : crypto.randomUUID();

  const [rows] = await sql.transaction([
    sql`INSERT INTO objects (id, scene_id, type, x, y, size, rotation, depth, visible, props)
        VALUES (${id}, ${body.sceneId}, ${o.type}, ${o.x}, ${o.y}, ${o.size}, ${o.rotation}, ${o.depth}, ${o.visible}, ${o.props})
        ON CONFLICT (id) DO NOTHING
        RETURNING *`,
    touchDraft(sql),
  ]);
  if (!rows.length) throw new HttpError(409, 'An object with this id already exists');
  return json({ object: toObject(rows[0]) }, 201);
});
