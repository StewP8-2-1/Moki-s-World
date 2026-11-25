/** Shared helpers for admin write endpoints (draft tables). */
import { HttpError } from './http.js';
import { objectFromRow, sceneFromRow } from './world.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) throw new HttpError(400, 'Invalid object id');
  return id.toLowerCase();
}

/** Last path segment, e.g. /api/admin/objects/<id> -> <id> */
export function lastSegment(request) {
  return decodeURIComponent(new URL(request.url).pathname.split('/').filter(Boolean).pop() || '');
}

export async function sceneIdSet(sql) {
  const rows = await sql`SELECT id FROM scenes`;
  return new Set(rows.map((r) => r.id));
}

/** Statement that marks the draft as changed (for the "unpublished changes" indicator). */
export const touchDraft = (sql) => sql`UPDATE draft_state SET changed_at = now() WHERE id = 1`;

export const toObject = (row) => ({ ...objectFromRow(row), sceneId: row.scene_id });
export const toScene = sceneFromRow;
