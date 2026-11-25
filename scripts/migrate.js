/**
 * Apply db/schema.sql (idempotent) to the database in DATABASE_URL.
 *   npm run db:migrate
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function applySchema(sql) {
  const schema = await readFile(path.join(root, 'db/schema.sql'), 'utf8');
  const statements = schema
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const stmt of statements) await sql.query(stmt);
  return statements.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { getSql } = await import('../api/_lib/db.js');
  const n = await applySchema(getSql());
  console.log(`Schema applied (${n} statements).`);
}
