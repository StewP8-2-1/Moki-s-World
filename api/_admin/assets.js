import { getSql } from '../_lib/db.js';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';

const isBlobUrl = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
};

/** GET /api/admin/assets -> uploaded images (media library), newest first */
export const GET = handle(async (request) => {
  await requireAdmin(request);
  const rows = await getSql()`SELECT id, url, name, width, height, created_at FROM assets ORDER BY created_at DESC LIMIT 500`;
  return json({ assets: rows.map((r) => ({ ...r, createdAt: r.created_at, created_at: undefined })) }, 200, { 'Cache-Control': 'no-store' });
});

/** POST /api/admin/assets  { url, name, width?, height? } -> records a finished Blob upload */
export const POST = handle(async (request) => {
  await requireAdmin(request);
  requireJson(request);
  const { url, name, width, height } = await readJson(request);
  if (!isBlobUrl(url)) throw new HttpError(400, 'Only Vercel Blob URLs can be added to the media library');
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new HttpError(400, 'Name is required');
  const dim = (v) => (Number.isInteger(v) && v > 0 && v < 100000 ? v : null);
  const [row] = await getSql()`
    INSERT INTO assets (url, name, width, height) VALUES (${url}, ${name.trim()}, ${dim(width)}, ${dim(height)})
    ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, url, name, width, height, created_at`;
  return json({ asset: { ...row, createdAt: row.created_at, created_at: undefined } }, 201);
});
