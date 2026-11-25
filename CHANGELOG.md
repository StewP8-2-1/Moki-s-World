# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added
- Keyboard, gamepad and touch players can now use paintings, promos and links without a mouse. Walk up to one and a prompt naming it appears, pinned to the top-left of the screen ("E · View — Renaissance", "A · Open — Follow on Facebook!", "ACT · View — …"). Press E, Enter or Space (top-down), gamepad A (top-down) or X, or the on-screen **ACT** button, which appears only when something is in range. Pressing interact again on an open promo follows its button, and on a painting it closes the dialogue. The CTA shows the key to press.
- If the browser blocks a link opened from a gamepad, the link appears in the dialogue with a button to click or tap instead.
- Clicking or tapping the painting that is already open closes its dialogue. Hover previews are mouse-only, so a tap on a touch screen no longer flashes a preview.
- Gamepad support: left stick (with a deadzone) or d-pad to move, A to jump in galleries, B to close the dialogue.
- Esc closes the dialogue.

### Fixed
- The dialogue box's call-to-action button could be clicked only near its original position. Once the camera scrolled, its hit area drifted away from where it was drawn (Phaser containers don't pass their scroll factor to their children).
- Every portal trip added two more input pointers to the game (`addPointer(2)` ran in each scene restart). The pointer count is now set once in the game config.
- The dialogue box was badly framed. It was wider than the screen (the border was clipped on both sides), had a fixed height so long text overflowed under the button, and covered the touch D-pad. It is now inset evenly, sized to its content (up to 45% of the screen, with "…" for longer text), and sits between the touch buttons when they are shown.
- After clicking a painting, the camera stayed on it when you walked away. The controller still believed it was following the player, so it never restarted the follow. The camera now has a single owner (`CameraDirector`) and walking always brings it back.
- A locked dialogue stayed open while the player walked away. Moving now closes it.
- Moving diagonally in the hub was about 41% faster than moving straight.
- Any click on empty space while zoomed in detached the camera from the player. Panning now starts only after an 8 px drag, and a pinch is never treated as a tap.
- `DialogueUI` options set to `0` were silently replaced by their defaults (`||` instead of `??`).
- Clicking the dialogue box itself closed it. It now only closes with ✕ (a new 44 px button) or a tap on empty space.
- Clicking a painting now frames it in the visible part of the screen above the dialogue box, instead of using a fixed 70 px offset. Hover previews switch to the top of the screen when the object would be hidden under the box.

### Removed
- The unused `#ui-layer` HTML overlay in `index.html` and its CSS.

### Changed
- The dialogue box, touch buttons and ☰ menu moved into a new screen-space `HudScene` that runs above `WorldScene`. Zooming the world no longer needs counter-zoom maths on the UI, and taps on HUD buttons never reach the world.
- The CTA ("Learn more") is now a real button with hover and pressed states, a 44 px touch target, and a "Tap to open" fallback when the browser blocks the popup.
- Touch buttons are multitouch-safe and are released when the tab loses focus.
- Keyboard, gamepad and touch input are merged into one `InputState` (`moveX`/`moveY`, `jump`, `interactPressed`, `cancelPressed`), so every input type drives the player the same way in both world modes.
- Touch controls default to on only for touch devices. Until you pick a setting in the ☰ menu, they hide after keyboard or gamepad use and come back after a touch. The menu choice is remembered across visits. The ☰ menu closes when you tap outside it.
- v1.0.0 is live in production at https://moki-s-world.vercel.app. PR #1 was merged and production was verified as a public visitor (19/19 browser checks).
- GitHub Pages was switched off for the repo, so the old `github.io` address is retired.

### Security
- Revoked the Vercel *Protection Bypass for Automation* secret created for testing previews. Preview deployments stay behind Vercel Authentication.

## [1.0.0] — 2026-11-25 — Vercel + Neon rework, visual editor

### Phase checklist
- [x] Phase 0: Development process and documentation scaffold
- [x] Phase 1: Backend foundation (schema, `/api/world`, seed). Live Neon DB seeded, version 1 published.
- [x] Phase 2: Data-driven game (object registry, WorldScene)
- [x] Phase 3: Admin shell (login, read-only scene view)
- [x] Phase 4: Visual editing (drag, inspector, palette, undo)
- [x] Phase 5: Media uploads and publishing (Blob, versions)
- [x] Phase 6: Deploy to Vercel. Preview verified; production goes live when this branch is merged to `main`.

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
- Visual editing in the admin editor:
  - `src/admin/store.js`: optimistic document store with ordered, debounced autosave and undo/redo. Typing, drags and nudges coalesce into one step, and undoing a delete restores the same id.
  - Add-to-scene palette: click to add at the view centre, or drag onto the map.
  - Moving objects by drag, with a 10 px snap toggle.
  - A corner handle for resizing.
  - A draggable player start.
  - An editable inspector with Duplicate and Delete. It checks values client-side (incomplete URLs, required fields and number ranges show inline hints instead of failing saves).
  - Scene settings: name, type, size, player start, background and ground.
  - A New scene dialog that adds a return portal automatically. Delete scene asks for confirmation.
  - Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Delete, Ctrl+D, arrow-key nudge, F and Esc.
  - A save status indicator, an "Unpublished changes" pill and toasts.
  - Changed image URLs load on demand.
- `public/placeholder.png`: the default image for new objects.
- `vercel.json` sets the Vite framework, clean URLs, the admin API rewrite, security headers (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`), `noindex` and `no-store` on `/admin`, and immutable caching of `/assets/*`.
- Publishing and versions:
  - `POST /api/admin/publish` (with an optional note), `GET /api/admin/versions` and `POST /api/admin/restore`. Restore copies a version into the draft; nothing goes live until you publish.
  - In the editor: a **Publish** dialog with a summary and note (the button is disabled when there's nothing new), a **History** dialog with per-version Restore, and a status pill that links to the live site.
- Draft preview:
  - `GET /api/world?draft=1` (admin only, `no-store`).
  - **Preview ▶** opens the game on the draft, with an orange "preview" banner.
  - Without a session, the game falls back to the published world.
- Image uploads:
  - `POST /api/admin/upload` issues Vercel Blob client-upload tokens. Only images (PNG/JPEG/WebP/GIF) up to 10 MB are allowed, with safe `uploads/` paths and a random suffix.
  - `GET`/`POST /api/admin/assets` is the media library. It only accepts Blob URLs.
  - `src/admin/media.js` is the image picker: drop-zone/browse upload with progress, "Your uploads" and "Already in your world" grids, and double-click to choose. It downscales images over 2560 px in the browser, and the Blob client is lazy-loaded (the admin bundle stays at 38 KB).
  - The "Choose image…" button appears on every image field, including the scene background image.
- `scripts/viteDevApi.js`: a Vite dev middleware that runs the `/api` functions locally. It follows Vercel's filesystem routing, including `[param].js`, so `npm run dev` is full-stack.

### Changed
- The admin API runs as a single Vercel Function.
  - `api/admin.js` routes `/api/admin/*` through the `vercel.json` rewrite (`?__path=`).
  - The handlers moved to `api/_admin/`, and `[id]` handlers receive router params.
  - Deployed functions: 14 → 2.
- `scripts/viteDevApi.js` applies the `vercel.json` rewrites locally and never routes `_` folders, so dev routing matches production.
- The editor URL is now `/admin`, via clean URLs.
- The game is now fully data-driven, and `main.js` registers only `BootScene` and `WorldScene`. Relative asset paths resolve against the Vite base URL.
- `constants.js` keeps only the canvas size; world sizes now come from the data.
- Object registry defaults now use `placeholder.png` and valid example URLs, so new objects pass validation immediately.
- `api/lib` was renamed to `api/_lib`, so Vercel doesn't deploy the helpers as public functions.
- `vite.config.js`:
  - It builds `index.html` and `admin.html` as a multi-page app.
  - `base` is `/`, except under GitHub Actions, which keeps the GitHub Pages deploy working until Phase 6.
  - It loads `.env.local` for the dev API.

### Removed
- The GitHub Pages workflow (`.github/workflows/deploy.yml`) and the `/Moki-s-World/` base path. The site now deploys only to Vercel.
- `HubScene.js`, `GalleryScene.js` and `ArtworkScene.js`, along with `ReqworkData.js` and `ArtworkData.js`. Their content now lives in the DB and in `src/data/fallbackWorld.json`.

### Fixed
- Preview deployments failed at "Deploying outputs" after Phase 5. The 14 functions exceeded the Hobby plan limit of 12 per deployment. Admin endpoints are now one router function.
- Returning visitors briefly saw the previous world after a publish. Browsers honoured `stale-while-revalidate` in `/api/world`'s `Cache-Control`. CDN caching now goes in `Vercel-CDN-Cache-Control`, and browsers always revalidate.
- Duplicate `anims.create` warnings on every scene start.
- The gallery scenes depended on the hub having loaded the portal texture first.

### Security
- Removed the GitHub personal access token that was embedded in the local git remote URL. Pushes now go through Git Credential Manager.

## [0.1.0] — before the rework
- Hub scene with social links and portals, plus a "Requested Art" gallery and an "Artwork Showcase" gallery.
- Dialogue box, 200% zoom with pan, mobile D-pad.
- Hosted on GitHub Pages.
