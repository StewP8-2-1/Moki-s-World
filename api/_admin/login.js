import { handle, json, readJson, HttpError } from '../_lib/http.js';
import { checkPassword, sessionCookie, requireJson } from '../_lib/auth.js';

/** POST /api/admin/login  { password } -> sets the session cookie */
export const POST = handle(async (request) => {
  requireJson(request);
  const { password } = await readJson(request);
  if (typeof password !== 'string' || !checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    throw new HttpError(401, 'Wrong password');
  }
  return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(request), 'Cache-Control': 'no-store' });
});
