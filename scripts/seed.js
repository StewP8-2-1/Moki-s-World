/**
 * Seed the Neon DB with the legacy world and publish version 1.
 *
 *   npm run db:seed              # needs DATABASE_URL (e.g. in .env.local)
 *   npm run db:seed -- --dry-run # no DB: validates data, prints a summary
 *   npm run db:seed -- --force   # wipe existing scenes/objects first
 *
 * Always (re)writes src/data/fallbackWorld.json, which the game uses if /api/world is unreachable.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { legacyWorld } from './legacyWorld.js';
import { buildSnapshot } from '../api/lib/world.js';
import { validateScene, validateObject } from '../api/lib/validate.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const force = args.has('--force');

// Flatten to DB-shaped rows (also validates everything through the same rules the API uses).
const sceneRows = legacyWorld.scenes.map((s) => {
  const v = validateScene(s);
  return { id: v.id, name: v.name, mode: v.mode, width: v.width, height: v.height, spawn_x: v.spawn.x, spawn_y: v.spawn.y,
    background: v.background, ground: v.ground, sort: v.sort };
});
const sceneIds = new Set(sceneRows.map((s) => s.id));
const objectRows = legacyWorld.scenes.flatMap((s) =>
  s.objects.map((o) => ({ id: o.id, scene_id: s.id, ...validateObject(o, { sceneIds }) })));

const fallback = buildSnapshot(sceneRows, objectRows, { startScene: legacyWorld.startScene, version: 0 });
await mkdir(path.join(root, 'src/data'), { recursive: true });
await writeFile(path.join(root, 'src/data/fallbackWorld.json'), JSON.stringify(fallback, null, 2) + '\n');
console.log(`fallbackWorld.json: ${fallback.scenes.length} scenes, ${objectRows.length} objects`);
for (const s of fallback.scenes) console.log(`  - ${s.id} (${s.mode}, ${s.width}x${s.height}): ${s.objects.length} objects`);

if (dryRun) {
  console.log('Dry run: database not touched.');
  process.exit(0);
}

const { getSql } = await import('../api/lib/db.js');
const sql = getSql();

const schema = await readFile(path.join(root, 'db/schema.sql'), 'utf8');
for (const stmt of schema.split(/;\s*$/m).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
  await sql.query(stmt);
}
console.log('Schema applied.');

const [{ count }] = await sql`SELECT count(*)::int AS count FROM scenes`;
if (count > 0 && !force) {
  console.log(`DB already has ${count} scenes. Re-run with --force to wipe and reseed.`);
  process.exit(0);
}

const statements = [sql`DELETE FROM objects`, sql`DELETE FROM scenes`];
for (const s of sceneRows) {
  statements.push(sql`INSERT INTO scenes (id, name, mode, width, height, spawn_x, spawn_y, background, ground, sort)
    VALUES (${s.id}, ${s.name}, ${s.mode}, ${s.width}, ${s.height}, ${s.spawn_x}, ${s.spawn_y}, ${s.background}, ${s.ground}, ${s.sort})`);
}
for (const o of objectRows) {
  statements.push(sql`INSERT INTO objects (id, scene_id, type, x, y, size, rotation, depth, visible, props)
    VALUES (${o.id}, ${o.scene_id}, ${o.type}, ${o.x}, ${o.y}, ${o.size}, ${o.rotation}, ${o.depth}, ${o.visible}, ${o.props})`);
}
const { publishedAt, version, ...snapshot } = fallback;
statements.push(sql`INSERT INTO world_versions (snapshot, note) VALUES (${snapshot}, 'Initial seed from legacy world')`);
await sql.transaction(statements);
console.log('Seeded and published version 1.');
