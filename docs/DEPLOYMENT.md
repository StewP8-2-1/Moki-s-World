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

## Local development
```
npx vercel link            # once
npx vercel env pull .env.local
npx vercel dev             # game + API on http://localhost:3000
```
For the game alone, `npm run dev` works and uses the bundled fallback world.
