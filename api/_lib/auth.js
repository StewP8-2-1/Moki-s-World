/**
 * Single-password admin auth.
 * - Password checked in constant time against ADMIN_PASSWORD.
 * - Session = HS256 JWT (signed with AUTH_SECRET) in an httpOnly, SameSite=Strict cookie, 7 days.
 * - The JWT carries a fingerprint of ADMIN_PASSWORD, so changing the password logs every session out.
 * - Mutating admin requests must send JSON (requireJson) — together with SameSite=Strict this blocks CSRF.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { HttpError } from './http.js';

export const COOKIE_NAME = 'mw_admin';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const sha256 = (s) => createHash('sha256').update(String(s)).digest();

function config() {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || secret.length < 32 || !password) throw new HttpError(503, 'Admin login is not configured');
  return { key: new TextEncoder().encode(secret), password, fingerprint: sha256(`fp:${password}`).toString('hex').slice(0, 16) };
}

export function checkPassword(input) {
  const { password } = config();
  return timingSafeEqual(sha256(input ?? ''), sha256(password));
}

function cookieAttrs(request, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function sessionCookie(request) {
  const { key, fingerprint } = config();
  const token = await new SignJWT({ role: 'admin', fp: fingerprint })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(key);
  return `${COOKIE_NAME}=${token}; ${cookieAttrs(request, MAX_AGE_SECONDS)}`;
}

export function clearCookie(request) {
  return `${COOKIE_NAME}=; ${cookieAttrs(request, 0)}`;
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function isAdmin(request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) return false;
  try {
    const { key, fingerprint } = config();
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return payload.role === 'admin' && payload.fp === fingerprint;
  } catch {
    return false;
  }
}

export async function requireAdmin(request) {
  if (!(await isAdmin(request))) throw new HttpError(401, 'Not logged in');
}

export function requireJson(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw new HttpError(415, 'Expected application/json');
  }
}
