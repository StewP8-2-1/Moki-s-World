/**
 * Vite dev-server plugin that runs the Vercel functions in /api locally, so `npm run dev`
 * is full-stack without `vercel dev`. Dev only — production uses real Vercel Functions.
 *
 * Mirrors production routing:
 *   1. `rewrites` from vercel.json (`:param` and `:param*` placeholders), e.g.
 *      /api/admin/objects/abc -> /api/admin?__path=objects/abc
 *   2. Vercel filesystem routing: /api/world -> api/world.js, dynamic `[param].js` segments.
 *   Files/folders starting with "_" are never routed (same as Vercel).
 * Handlers are Web-standard: `export const GET = (request: Request) => Response`.
 * Env vars come from .env.local (loaded in vite.config.js).
 */
import fs from 'node:fs';
import path from 'node:path';

function loadRewrites(root) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    return (cfg.rewrites || []).map(({ source, destination }) => {
      const names = [];
      const re = source.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\/:(\w+)(\*)?/g, (_, name, star) => {
        names.push(name);
        return star ? '(?:/(.*))?' : '/([^/]+)';
      });
      return { re: new RegExp(`^${re}$`), names, destination };
    });
  } catch {
    return [];
  }
}

/** Apply the first matching rewrite to "pathname?query". Returns the rewritten URL path + query. */
function applyRewrites(rewrites, pathname, search) {
  for (const r of rewrites) {
    const m = pathname.match(r.re);
    if (!m) continue;
    let dest = r.destination;
    r.names.forEach((name, i) => { dest = dest.replace(new RegExp(`:${name}\\*?`, 'g'), m[i + 1] ?? ''); });
    const [destPath, destQuery = ''] = dest.split('?');
    const params = new URLSearchParams(search);
    for (const [k, v] of new URLSearchParams(destQuery)) params.set(k, v);
    const qs = params.toString();
    return `${destPath}${qs ? `?${qs}` : ''}`;
  }
  return null;
}

function resolveRoute(root, pathname) {
  const segs = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (segs.some((s) => s.startsWith('_'))) return null;
  const exact = path.join(root, 'api', ...segs) + '.js';
  if (fs.existsSync(exact)) return exact;
  const index = path.join(root, 'api', ...segs, 'index.js');
  if (fs.existsSync(index)) return index;
  if (segs.length) {
    const dir = path.join(root, 'api', ...segs.slice(0, -1));
    const dyn = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => /^\[[^\]]+\]\.js$/.test(f));
    if (dyn) return path.join(dir, dyn);
  }
  return null;
}

async function toRequest(req, url) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
}

export function devApi() {
  return {
    name: 'mokis-dev-api',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      server.middlewares.use(async (req, res, next) => {
        const [pathname, search = ''] = (req.url || '').split('?');
        if (!pathname.startsWith('/api/') && pathname !== '/api') return next();
        const rewritten = applyRewrites(loadRewrites(root), pathname, search) || req.url;
        const file = resolveRoute(root, rewritten.split('?')[0]);
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (!file) return send(404, { error: 'Not found' });
        try {
          const mod = await server.ssrLoadModule(file);
          const handler = mod[req.method] || (req.method === 'HEAD' && mod.GET);
          if (!handler) return send(405, { error: 'Method not allowed' });
          const response = await handler(await toRequest(req, `http://${req.headers.host}${rewritten}`));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => { if (k !== 'set-cookie') res.setHeader(k, v); });
          const cookies = response.headers.getSetCookie?.() ?? [];
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error('[dev-api]', err);
          send(500, { error: String(err.message || err) });
        }
      });
    },
  };
}
