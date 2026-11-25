import { handleUpload } from '@vercel/blob/client';
import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { requireAdmin, requireJson } from '../_lib/auth.js';

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/admin/upload — Vercel Blob client-upload handshake.
 * The browser asks for a short-lived token here (admin only), then uploads the file directly to Blob,
 * so large images never pass through the function (no 4.5 MB body limit).
 * The editor records the finished upload via POST /api/admin/assets.
 */
export const POST = handle(async (request) => {
  await requireAdmin(request);
  requireJson(request);
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'Image uploads are not configured');
  const body = await readJson(request);
  if (body?.type !== 'blob.generate-client-token') throw new HttpError(400, 'Unsupported upload request');

  const result = await handleUpload({
    body,
    request,
    onBeforeGenerateToken: async (pathname) => {
      if (!/^uploads\/[\w.\- ()]{1,120}$/.test(pathname)) throw new HttpError(400, 'Invalid file name');
      return { allowedContentTypes: IMAGE_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
    },
  });
  return json(result);
});
