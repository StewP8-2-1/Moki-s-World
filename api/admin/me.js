import { handle, json, error } from '../_lib/http.js';
import { isAdmin } from '../_lib/auth.js';

/** GET /api/admin/me -> 200 { admin: true } when logged in, else 401 */
export const GET = handle(async (request) =>
  (await isAdmin(request))
    ? json({ admin: true }, 200, { 'Cache-Control': 'no-store' })
    : error(401, 'Not logged in'));
