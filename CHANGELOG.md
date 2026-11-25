# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased] — Vercel + Neon rework

### Phase checklist
- [x] Phase 0: Development process and documentation scaffold
- [x] Phase 1: Backend foundation (schema, `/api/world`, seed). Live Neon DB seeded, version 1 published.
- [x] Phase 2: Data-driven game (object registry, WorldScene)
- [x] Phase 3: Admin shell (login, read-only scene view)
- [ ] Phase 4: Visual editing (drag, inspector, palette, undo)
- [ ] Phase 5: Media uploads and publishing (Blob, versions)
- [ ] Phase 6: Deploy to Vercel

### Added
- `CLAUDE.md` agent guide with the commands, architecture map and the per-commit documentation workflow.
- `CHANGELOG.md` (this file).
- `docs/` pages: `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `ADMIN_GUIDE.md` and `DEPLOYMENT.md`.
- Neon schema in `db/schema.sql` with four tables: `scenes`, `objects`, `world_versions` and `assets`.
- `api/_lib/db.js` (lazy Neon client), `api/_lib/http.js` (JSON and error helpers) and `api/_lib/world.js` (snapshot builder).
- Dependencies: `@neondatabase/serverless`, `@vercel/blob` and `jose`.
- `api/_lib/validate.js`: validation for scenes and objects, shared by the API and the seed.
  - It rejects non-http(s) link URLs and portals to missing scenes.
  - It strips any props a type doesn't define.
- `GET /api/world` returns the latest published snapshot, cached at the CDN.
- `scripts/legacyWorld.js` holds the original hardcoded world as data, with stable object IDs.
- `scripts/seed.js` (`npm run db:seed`) applies the schema, seeds the world and publishes version 1.
  - Flags: `--dry-run` and `--force`.
  - It always regenerates `src/data/fallbackWorld.json`.
- `npm run dev:full` runs `vercel dev`, the full stack locally.
- Infrastructure (not in code): the repo is linked to the Vercel project `moki-s-world`.
  - The Neon database `mokis-world-db` is in `sin1` on the free plan. It was added through the Vercel marketplace, which sets `DATABASE_URL` and the `PG*`/`POSTGRES_*` variables.
  - The Blob store `mokis-world-media` is in `sin1`.
  - `ADMIN_PASSWORD` is set on Vercel as a sensitive variable.
  - `AUTH_SECRET` is set on Vercel.
  - The setup is recorded in `docs/DEPLOYMENT.md`.

- The shared object registry in `src/world/objectTypes.js` covers painting, link, portal, promo, text and decor. For each type it holds defaults, inspector fields, `create()` and `layout()`.
- `src/world/behaviors.js` holds the game-only interactions:
  - painting/promo dialogue, with pan-on-click
  - links open safely, and only http(s) URLs are followed
  - portals use physics overlap
- `src/world/loadWorld.js` fetches `/api/world` with a 5 s timeout. If that fails it falls back to the bundled world. It also supports `?draft=1` and time-boxed promos (`isActive`).
- `BootScene` loads the sprites, the world data and every referenced image, and creates the walk animations once.
- `WorldScene` is one generic scene built from data. Its `mode` picks a controller (topdown or platformer). Portal travel fades out and back in.
- `DialogueUI` has an optional call-to-action button for promos.
- Admin auth in `api/_lib/auth.js`:
  - single-password login with a constant-time check
  - an HS256 JWT session cookie (`HttpOnly`, `SameSite=Strict`, 7 days) that carries a password fingerprint, so changing the password logs everyone out
  - `requireAdmin` and `requireJson` guards
- Admin endpoints: `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/me` and `GET /api/admin/draft` (returns the draft world plus the latest published version).
- The admin editor shell at `/admin.html` (`src/admin/`):
  - Login screen.
  - Top bar with a scene picker, zoom controls and the live-version status.
  - Scene info panel and an objects (layers) list.
  - A Phaser map canvas that renders the draft with the shared object registry. It adds a grid, scene bounds, the ground and a player-start marker, and supports wheel zoom toward the cursor, drag-to-pan and fit (F).
  - Click-to-select, synced between the map and the list.
  - A read-only inspector generated from each type's field schema.
  - Remembers the last scene, and adapts to narrow screens.
- Admin write API:
  - `GET`/`POST /api/admin/scenes` and `PUT`/`DELETE /api/admin/scenes/:id`. The hub can't be deleted, and neither can a scene that portals still lead to.
  - `GET`/`POST /api/admin/objects` and `PATCH`/`DELETE /api/admin/objects/:id`. The client can supply object ids, and patches are merged and re-validated.
- New `draft_state` table, plus `hasUnpublishedChanges` in `/api/admin/draft`.
- `npm run db:migrate` (`scripts/migrate.js`) applies the schema. The seed reuses it.
- `scripts/viteDevApi.js`: a Vite dev middleware that runs the `/api` functions locally. It follows Vercel's filesystem routing, including `[param].js`, so `npm run dev` is full-stack.

### Changed
- The game is now fully data-driven, and `main.js` registers only `BootScene` and `WorldScene`. Relative asset paths resolve against the Vite base URL.
- `constants.js` keeps only the canvas size; world sizes now come from the data.
- `api/lib` was renamed to `api/_lib`, so Vercel doesn't deploy the helpers as public functions.
- `vite.config.js`:
  - It builds `index.html` and `admin.html` as a multi-page app.
  - `base` is `/`, except under GitHub Actions, which keeps the GitHub Pages deploy working until Phase 6.
  - It loads `.env.local` for the dev API.

### Removed
- `HubScene.js`, `GalleryScene.js` and `ArtworkScene.js`, along with `ReqworkData.js` and `ArtworkData.js`. Their content now lives in the DB and in `src/data/fallbackWorld.json`.

### Fixed
- Duplicate `anims.create` warnings on every scene start.
- The gallery scenes depended on the hub having loaded the portal texture first.

### Security
- Removed the GitHub personal access token that was embedded in the local git remote URL. Pushes now go through Git Credential Manager.

## [0.1.0] — before the rework
- Hub scene with social links and portals, plus a "Requested Art" gallery and an "Artwork Showcase" gallery.
- Dialogue box, 200% zoom with pan, mobile D-pad.
- Hosted on GitHub Pages.
