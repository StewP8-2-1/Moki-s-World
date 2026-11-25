import { getSql } from '../_lib/db.js';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';
import { validateObject } from '../_lib/validate.js';
import { assertUuid, lastSegment, sceneIdSet, touchDraft, toObject } from '../_lib/draft.js';

/**
 * PATCH /api/admin/objects/:id  — partial update. Fields are merged over the stored object
 * (props are merged key-by-key) and the result is fully re-validated.
 */
export const PATCH = handle(async (request, params = {}) => {
  await requireAdmin(request);
  requireJson(request);
  const id = assertUuid(params.id ?? lastSegment(request));
  const patch = await readJson(request);
  const sql = getSql();

  const [existing] = await sql`SELECT * FROM objects WHERE id = ${id}`;
  if (!existing) throw new HttpError(404, 'Object not found');
  const current = toObject(existing);
  const merged = { ...current, ...patch, type: current.type, props: { ...current.props, ...(patch.props || {}) } };
  const o = validateObject(merged, { sceneIds: await sceneIdSet(sql) });

  const [rows] = await sql.transaction([
    sql`UPDATE objects SET x = ${o.x}, y = ${o.y}, size = ${o.size}, rotation = ${o.rotation}, depth = ${o.depth},
          visible = ${o.visible}, props = ${o.props}, updated_at = now()
        WHERE id = ${id} RETURNING *`,
    touchDraft(sql),
  ]);
  return json({ object: toObject(rows[0]) });
});

/** DELETE /api/admin/objects/:id */
export const DELETE = handle(async (request, params = {}) => {
  await requireAdmin(request);
  const id = assertUuid(params.id ?? lastSegment(request));
  const sql = getSql();
  const [rows] = await sql.transaction([
    sql`DELETE FROM objects WHERE id = ${id} RETURNING id`,
    touchDraft(sql),
  ]);
  if (!rows.length) throw new HttpError(404, 'Object not found');
  return json({ ok: true });
});
