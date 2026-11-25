# Deployment

> Status: ✅ deployed on Vercel. Pushes to `main` go to production. Every other branch gets a preview URL. GitHub Pages is retired.

## How deploys work
- **Production:** merge or push to `main`, and Vercel builds and deploys https://moki-s-world.vercel.app.
- **Previews:** every push to another branch gets its own URL (`moki-s-world-<hash>-stoow.vercel.app`). Preview deployments share the same Neon database and Blob store as production, so **edits made in a preview's editor change the real draft**.
- **Content changes don't need a deploy.** The editor writes to Neon, and **Publish** makes them live within about a minute.

## `vercel.json`
| Setting | Why |
|---|---|
| `framework: vite`, `outputDirectory: dist` | A static Vite multi-page build (`index.html` + `admin.html`) |
| `cleanUrls: true` | The editor is served at `/admin`; `/admin.html` redirects there |
| Rewrite `/api/admin/:path*` → `/api/admin?__path=:path*` | All admin endpoints run in **one** function (`api/admin.js`). The Hobby plan allows at most **12 functions per deployment**, and the project uses 2 |
| Headers on everything | `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `X-Frame-Options: DENY` (no clickjacking of the editor) |
| `/admin` | `X-Robots-Tag: noindex` and `Cache-Control: no-store` |
| `/assets/*` | Hashed build files are cached for a year (`immutable`) |

`/api/world` sets its own caching headers: browsers always revalidate, and the Vercel CDN caches for 60 s. See `docs/API.md`.

## Setting up from scratch
1. Import the GitHub repo into Vercel. It detects the Vite preset, and `vercel.json` covers the rest.
2. Under **Storage**, add the **Neon** integration, which sets `DATABASE_URL`. Then add **Blob**, which sets `BLOB_READ_WRITE_TOKEN`.
3. Add these environment variables:
   - `ADMIN_PASSWORD`: the editor password
   - `AUTH_SECRET`: 32+ random characters, used to sign the admin cookie (`openssl rand -hex 32`)
4. Pull the env vars and seed once:
   ```
   npx vercel link
   npx vercel env pull .env.local
   npm run db:seed
   ```
   - `npm run db:seed -- --dry-run` validates the data and regenerates `src/data/fallbackWorld.json` without a database.
   - `npm run db:seed -- --force` wipes the draft tables and reseeds them. Published versions are kept.
   - `npm run db:migrate` applies schema changes (`db/schema.sql` is idempotent).

## Current setup (2026-11-25)
| Resource | Value |
|---|---|
| Vercel project | `stoow/moki-s-world` → https://moki-s-world.vercel.app, Git-connected to `StewP8-2-1/Moki-s-World`, production branch `main` |
| Neon database | Vercel marketplace integration, resource `mokis-world-db`, free plan, region `sin1` (Singapore). Sets `DATABASE_URL` |
| Blob store | `mokis-world-media`, public access, region `sin1`. Sets `BLOB_READ_WRITE_TOKEN` |
| `AUTH_SECRET` | Random 32-byte hex, marked sensitive, set for all environments |
| `ADMIN_PASSWORD` | Sensitive, set for all environments. Change it in the Vercel dashboard (Settings → Environment Variables), then redeploy. All sessions are signed out |

The database was seeded on 2026-11-25 with `npm run db:seed`, which published version 1 (3 scenes, 16 objects).

## Retiring GitHub Pages
The Pages workflow (`.github/workflows/deploy.yml`) was removed in Phase 6. After merging, the old Pages site stays online with its last build until Pages is switched off in the GitHub repo (**Settings → Pages → Source: None**). Do that once the Vercel site is confirmed working, and point any links at https://moki-s-world.vercel.app.

## Local development
```
npm run dev            # game + API + editor on http://localhost:5173 (uses .env.local)
npx vercel dev         # optional: the same through the real Vercel runtime
```
