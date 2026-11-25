/**
 * Single Vercel Function for every /api/admin/* endpoint.
 *
 * vercel.json rewrites /api/admin/<path> -> /api/admin?__path=<path>, and this router dispatches to the
 * handler modules in api/_admin/ (the "_" prefix keeps Vercel from deploying them as separate functions).
 * One function instead of 13 keeps us within the Hobby plan's 12-functions-per-deployment limit
 * and means fewer cold starts.
 */
import { error } from './_lib/http.js';
import * as login from './_admin/login.js';
import * as logout from './_admin/logout.js';
import * as me from './_admin/me.js';
import * as draft from './_admin/draft.js';
import * as objects from './_admin/objects.js';
import * as objectById from './_admin/objectById.js';
import * as scenes from './_admin/scenes.js';
import * as sceneById from './_admin/sceneById.js';
import * as publish from './_admin/publish.js';
import * as versions from './_admin/versions.js';
import * as restore from './_admin/restore.js';
import * as upload from './_admin/upload.js';
import * as assets from './_admin/assets.js';

const ROUTES = [
  ['login', login],
  ['logout', logout],
  ['me', me],
  ['draft', draft],
  ['objects', objects],
  ['objects/:id', objectById],
  ['scenes', scenes],
  ['scenes/:id', sceneById],
  ['publish', publish],
  ['versions', versions],
  ['restore', restore],
  ['upload', upload],
  ['assets', assets],
];

/** The admin sub-path: from the rewrite's __path query, or from the URL path when called directly. */
export function adminPath(request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('__path');
  const raw = fromQuery ?? url.pathname.replace(/^\/api\/admin\/?/, '');
  return raw.split('/').filter(Boolean).map(decodeURIComponent);
}

export function match(segments) {
  for (const [pattern, mod] of ROUTES) {
    const parts = pattern.split('/');
    if (parts.length !== segments.length) continue;
    const params = {};
    if (parts.every((p, i) => (p.startsWith(':') ? ((params[p.slice(1)] = segments[i]), true) : p === segments[i]))) {
      return { mod, params };
    }
  }
  return null;
}

function dispatch(method) {
  return async (request) => {
    const found = match(adminPath(request));
    if (!found) return error(404, 'Not found');
    const handler = found.mod[method];
    if (!handler) return error(405, 'Method not allowed');
    return handler(request, found.params);
  };
}

export const GET = dispatch('GET');
export const POST = dispatch('POST');
export const PUT = dispatch('PUT');
export const PATCH = dispatch('PATCH');
export const DELETE = dispatch('DELETE');
