# Deployment

> Status: planned (Phase 6). Until then, `main` still deploys to GitHub Pages.

## Target: Vercel
1. Import the GitHub repo into Vercel (framework preset: **Vite**).
2. Under **Storage**, add the **Neon** integration. It sets `DATABASE_URL`.
3. Under **Storage**, add **Blob**. It sets `BLOB_READ_WRITE_TOKEN`.
4. Add these environment variables:
   - `ADMIN_PASSWORD`: the editor password
   - `AUTH_SECRET`: 32+ random characters, used to sign the admin cookie (`openssl rand -hex 32`)
5. Seed once: `npx vercel env pull .env.local`, then run `npm run db:seed`.
   - `npm run db:seed -- --dry-run` validates the data and regenerates `src/data/fallbackWorld.json` without a database.
   - `npm run db:seed -- --force` wipes the draft tables and reseeds them. Earlier published versions are kept.

## Current setup (2026-11-25)
| Resource | Value |
|---|---|
| Vercel project | `stoow/moki-s-world` → https://moki-s-world.vercel.app |
| Neon database | Vercel marketplace integration, resource `mokis-world-db`, free plan, region `sin1` (Singapore). Sets `DATABASE_URL` |
| Blob store | `mokis-world-media`, public access, region `sin1`. Sets `BLOB_READ_WRITE_TOKEN` |
| `AUTH_SECRET` | Random 32-byte hex, marked sensitive, set for all environments |
| `ADMIN_PASSWORD` | Sensitive, set for all environments. Change it in the Vercel dashboard (Settings → Environment Variables) |

The database was seeded on 2026-11-25 with `npm run db:seed`, which published version 1 (3 scenes, 16 objects).

The local folder is linked with `vercel link`. `vercel env pull .env.local` refreshes the local secrets. `.env*` and `.vercel` are gitignored.

## Local development
```
npx vercel link            # once
npx vercel env pull .env.local
npx vercel dev             # game + API on http://localhost:3000
```
For the game alone, `npm run dev` works and uses the bundled fallback world.
