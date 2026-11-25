/**
 * Builds the world snapshot JSON consumed by the game (see docs/DATABASE.md, "Snapshot format").
 * Pure functions only — shared by /api/world, publish, and scripts/seed.js.
 */

export const SNAPSHOT_FORMAT = 1;

/** DB row (snake_case) -> snapshot scene (without objects). */
export function sceneFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    mode: r.mode,
    width: r.width,
    height: r.height,
    spawn: { x: r.spawn_x, y: r.spawn_y },
    background: r.background ?? { color: '#ffffff' },
    ground: r.ground ?? null,
    sort: r.sort ?? 0,
  };
}

export function objectFromRow(r) {
  return {
    id: r.id,
    type: r.type,
    x: Number(r.x),
    y: Number(r.y),
    size: Number(r.size),
    rotation: Number(r.rotation ?? 0),
    depth: r.depth ?? 0,
    visible: r.visible ?? true,
    props: r.props ?? {},
  };
}

export function buildSnapshot(sceneRows, objectRows, { startScene = 'hub', version = null, publishedAt = null } = {}) {
  const scenes = sceneRows
    .map(sceneFromRow)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id))
    .map((s) => ({ ...s, objects: [] }));
  const byId = new Map(scenes.map((s) => [s.id, s]));
  for (const row of objectRows) {
    const scene = byId.get(row.scene_id);
    if (scene) scene.objects.push(objectFromRow(row));
  }
  for (const s of scenes) s.objects.sort((a, b) => a.depth - b.depth);
  const start = byId.has(startScene) ? startScene : scenes[0]?.id ?? null;
  return { format: SNAPSHOT_FORMAT, version, publishedAt, startScene: start, scenes };
}

/** Load the current draft from the DB and assemble a snapshot. */
export async function loadDraft(sql) {
  const [sceneRows, objectRows] = await Promise.all([
    sql`SELECT * FROM scenes`,
    sql`SELECT * FROM objects`,
  ]);
  return buildSnapshot(sceneRows, objectRows);
}
