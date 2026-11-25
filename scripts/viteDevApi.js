/**
 * Vite dev-server plugin that runs the Vercel functions in /api locally, so `npm run dev`
 * is full-stack without `vercel dev`. Dev only — production uses real Vercel Functions.
 *
 * Routing mirrors Vercel's filesystem routing:
 *   /api/world                -> api/world.js
 *   /api/admin/objects/abc    -> api/admin/objects/[id].js   (dynamic segment)
 * Handlers are Web-standard: `export const GET = (request: Request) => Response`.
 * Env vars come from .env.local (loaded in vite.config.js).
 */
import fs from 'node:fs';
import path from 'node:path';

function resolveRoute(root, pathname) {
  const segs = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
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

async function toRequest(req) {
  const url = `http://${req.headers.host}${req.url}`;
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
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (!pathname.startsWith('/api/') && pathname !== '/api') return next();
        const file = resolveRoute(server.config.root, pathname);
        if (!file || file.includes(`${path.sep}_`)) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({ error: 'Not found' }));
        }
        try {
          const mod = await server.ssrLoadModule(file);
          const handler = mod[req.method] || (req.method === 'HEAD' && mod.GET);
          if (!handler) {
            res.statusCode = 405;
            return res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
          const response = await handler(await toRequest(req));
          res.statusCode = response.status;
          response.headers.forEach((v, k) => {
            if (k !== 'set-cookie') res.setHeader(k, v);
          });
          const cookies = response.headers.getSetCookie?.() ?? [];
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error('[dev-api]', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err.message || err) }));
        }
      });
    },
  };
}
