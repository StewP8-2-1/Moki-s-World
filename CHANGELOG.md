# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased] — Vercel + Neon rework

### Phase checklist
- [x] Phase 0: Development process and documentation scaffold
- [ ] Phase 1: Backend foundation (schema, `/api/world`, seed)
- [ ] Phase 2: Data-driven game (object registry, WorldScene)
- [ ] Phase 3: Admin shell (login, read-only scene view)
- [ ] Phase 4: Visual editing (drag, inspector, palette, undo)
- [ ] Phase 5: Media uploads and publishing (Blob, versions)
- [ ] Phase 6: Deploy to Vercel

### Added
- `CLAUDE.md` agent guide with the commands, architecture map and the per-commit documentation workflow.
- `CHANGELOG.md` (this file).
- `docs/` pages: `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `ADMIN_GUIDE.md` and `DEPLOYMENT.md`.
- Neon schema in `db/schema.sql` with four tables: `scenes`, `objects`, `world_versions` and `assets`.
- `api/lib/db.js` (lazy Neon client), `api/lib/http.js` (JSON and error helpers) and `api/lib/world.js` (snapshot builder).
- Dependencies: `@neondatabase/serverless`, `@vercel/blob` and `jose`.
- `api/lib/validate.js`: validation for scenes and objects, shared by the API and the seed.
  - It rejects non-http(s) link URLs and portals to missing scenes.
  - It strips any props a type doesn't define.
- `GET /api/world` returns the latest published snapshot, cached at the CDN.
- `scripts/legacyWorld.js` holds the original hardcoded world as data, with stable object IDs.
- `scripts/seed.js` (`npm run db:seed`) applies the schema, seeds the world and publishes version 1.
  - Flags: `--dry-run` and `--force`.
  - It always regenerates `src/data/fallbackWorld.json`.
- `npm run dev:full` runs `vercel dev`, the full stack locally.
- Infrastructure (not in code): the repo is linked to the Vercel project `moki-s-world`.
  - The Blob store `mokis-world-media` is in `sin1`.
  - `AUTH_SECRET` is set on Vercel.
  - The setup is recorded in `docs/DEPLOYMENT.md`.

### Security
- Removed the GitHub personal access token that was embedded in the local git remote URL. Pushes now go through Git Credential Manager.

## [0.1.0] — before the rework
- Hub scene with social links and portals, plus a "Requested Art" gallery and an "Artwork Showcase" gallery.
- Dialogue box, 200% zoom with pan, mobile D-pad.
- Hosted on GitHub Pages.
