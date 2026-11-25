import { getSql } from '../_lib/db.js';
import { handle, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { loadDraft } from '../_lib/world.js';

/**
 * GET /api/admin/draft -> { world, published, changedAt, hasUnpublishedChanges }
 * `world` is the editable draft (same snapshot format as /api/world).
 */
export const GET = handle(async (request) => {
  await requireAdmin(request);
  const sql = getSql();
  const [world, latest, state] = await Promise.all([
    loadDraft(sql),
    sql`SELECT id, published_at, note FROM world_versions ORDER BY id DESC LIMIT 1`,
    sql`SELECT changed_at FROM draft_state WHERE id = 1`,
  ]);
  const published = latest[0] ? { version: latest[0].id, publishedAt: latest[0].published_at, note: latest[0].note } : null;
  const changedAt = state[0]?.changed_at ?? null;
  const hasUnpublishedChanges = !published || (changedAt && new Date(changedAt) > new Date(published.publishedAt));
  return json({ world, published, changedAt, hasUnpublishedChanges: Boolean(hasUnpublishedChanges) }, 200, { 'Cache-Control': 'no-store' });
});
