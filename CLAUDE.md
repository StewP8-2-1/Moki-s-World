# Moki's World — agent guide

Moki's World is a Phaser 4 + Vite browser world: a top-down hub that leads into side-scrolling art galleries. It is moving to **Vercel** (static site + serverless `/api`), **Neon Postgres** (world data) and **Vercel Blob** (uploaded images). It also gets a visual admin editor at `/admin.html`.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (game only; API calls fall back to bundled JSON) |
| `npx vercel dev` | Full stack locally (Vite + `/api` functions); needs `.env.local` |
| `npm run build` | Production build. **It must pass before every commit** |
| `npm run db:seed` | Create the schema and seed the world from the legacy data (`-- --dry-run` prints the SQL/JSON only) |

Env vars (see `docs/DEPLOYMENT.md`): `DATABASE_URL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`. Never commit `.env*` files.

## Architecture (target)
- `src/world/`: the **shared object registry** (`objectTypes.js`). The game and the editor both render objects through it. Runtime-only interactions go in `behaviors.js`.
- `src/scenes/BootScene.js` + `WorldScene.js`: one generic data-driven scene. Do not hardcode world content in scenes.
- `src/admin/`: the editor (Phaser `EditorScene` plus DOM panels).
- `api/`: Vercel functions. `api/lib/` holds db, auth and validation helpers.
- `db/schema.sql`: the source of truth for the schema.
- Full details are in `docs/ARCHITECTURE.md`, `docs/DATABASE.md` and `docs/API.md`.

## Conventions
- Plain ESM JavaScript, with no TypeScript and no UI framework (the admin uses vanilla DOM).
- New object types go in the registry: defaults, inspector fields, `create()`, and optionally a behaviour. Add validation in `api/lib/validate.js` too.
- Public URLs in data must be `http(s)` or relative paths.

## Development workflow (required)
Work happens in phases on branch `rework/vercel-neon`; the draft PR holds the phase checklist. For **every commit**:
1. Make one small, self-contained step. The build stays green and the game keeps working.
2. Verify it: `npm run build` plus a step-specific check (curl the API, load the game, run the seed in dry-run mode).
3. Document it in the same commit:
   - add a `CHANGELOG.md` entry under `[Unreleased]` (Added/Changed/Removed/Fixed)
   - update the affected `docs/*.md` page
4. Write a Conventional Commit message, e.g. `feat(api): …`, `refactor(game): …`, `docs: …`, `chore: …`. The body has three sections, **What**, **Why** and **Verified**, and ends with the Co-Authored-By trailer.
5. Push after each commit.
