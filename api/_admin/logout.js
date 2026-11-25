import { handle, json } from '../_lib/http.js';
import { clearCookie } from '../_lib/auth.js';

/** POST /api/admin/logout -> clears the session cookie */
export const POST = handle(async (request) =>
  json({ ok: true }, 200, { 'Set-Cookie': clearCookie(request), 'Cache-Control': 'no-store' }));
