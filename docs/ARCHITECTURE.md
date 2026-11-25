# Architecture

> Status: Phases 1–5 are implemented: the API, the DB, the data-driven game, admin auth, the visual editor, uploads and publishing. Deployment to Vercel is Phase 6.

## Editor (`src/admin/`)
| File | Role |
|---|---|
| `admin.html` | The page shell: login, top bar, side panels and the canvas host |
| `store.js` | **Document store.** Holds the draft and applies edits locally first. It persists them through per-entity ordered queues, with object PATCHes debounced by 350 ms. It also keeps undo/redo history, where edits to the same field within 1.2 s coalesce into one step, and emits events |
| `main.js` | UI state (`sceneId`, `selectedId`), panels (palette, layers, scene settings, inspector), the new-scene dialog, toasts, keyboard shortcuts and palette drag-and-drop |
| `EditorScene.js` | Renders one scene with `createObjectView` plus overlays: grid, bounds, ground, a draggable player start, and the selection with its resize handle. It moves and resizes objects by dragging (measured from pointer-down, with snap), loads changed images on demand, and listens to store events so undo/redo and inspector edits show up on the map |
| `inspector.js` | `buildForm()`/`syncForm()`: auto-saving forms generated from field specs, with client-side checks so half-typed values aren't sent. Also `renderInspector()` and `objectName()` |
| `media.js` | Media picker dialog (lists uploads plus images already in the world) and `uploadImage()`. It downscales images over 2560 px in the browser, uploads straight to Vercel Blob with a token from `/api/admin/upload` (the Blob client is lazy-loaded), then records the result through `/api/admin/assets` |
| `api.js` | Fetch wrapper for `/api/admin/*` |
| `admin.css` | Styles, with light/dark and narrow-screen layouts |

Data flow: every edit, whether a canvas drag, an inspector field, a keyboard shortcut or undo, calls a **store** method. The store updates the in-memory draft, emits `object:update`/`create`/`delete`/`scene:update`, and queues the API call. Both the canvas and the DOM panels re-render from those events, so they can't drift apart. Switching scenes restarts `EditorScene`; its store subscriptions are removed on `shutdown`, and textures stay cached.

## Adding a new object type
1. `src/world/objectTypes.js`: add `label`, `icon`, `defaults`, `fields` and `create`.
2. `api/_lib/validate.js`: add a matching `PROP_SPECS` entry.
3. Optionally, add a runtime interaction in `src/world/behaviors.js`.
4. `db/schema.sql`: add the type to the `objects.type` CHECK constraint.

## Debugging
- In dev builds, `window.__game` exposes the Phaser game instance. For example, `__game.scene.getScene('World').travelTo('artwork')`.
- The console logs `[world] using bundled fallback (...)` when `/api/world` can't be reached. This is expected under plain `npm run dev`.

## Overview
```
Vite multi-page app (static)          Vercel Functions (/api)              Neon Postgres
  index.html  -> game (WorldScene)  --GET /api/world----------------->  world_versions (published snapshot)
  admin.html  -> editor (Phaser +   --/api/admin/* (cookie auth)----->  scenes, objects (draft)
                 DOM panels)        --/api/admin/upload -------------> Vercel Blob (images)
```

### Draft and published data
- The admin edits the **draft** tables, `scenes` and `objects`.
- **Publish** writes the whole draft into a new `world_versions` row as one JSON snapshot.
- The public game only reads the latest snapshot. It is a single cached request, so unpublished edits never leak, and any version can be restored.
- If the API is unreachable, the game falls back to `src/data/fallbackWorld.json`, which is bundled at build time.

### Shared object registry
`src/world/objectTypes.js` defines each object type (`painting`, `link`, `portal`, `promo`, `text`, `decor`, `npc`). Each type has:
- `defaults`: default props for new objects
- `fields`: the inspector form schema
- `create(scene, obj)`: builds the Phaser GameObject

The game and the editor both call `create()`, so what you see in the editor is what players see. Interactions that only happen in the game, such as the dialogue box, camera pan, opening links and portal travel, are attached in `src/world/behaviors.js`.

### Scenes
- `BootScene` loads the world JSON and every image it references, creates the animations, and then starts `WorldScene`.
- `WorldScene({ sceneId })` builds one scene from the data. Its `mode` picks the controller from `src/GameControllers.js`:
  - `topdown` → `TopDownController`
  - `platformer` → `PlatformerController`
- `WorldScene` launches `HudScene` on top of itself, and launches it again on every scene change. The HUD holds the screen-space UI: the dialogue box (`src/DialogueUI.js`), the touch buttons and the ☰ menu. Its camera never scrolls or zooms, and Phaser's `globalTopOnly` input means a tap on a HUD button never reaches the world. World code talks to the HUD through `WorldScene.showDialogue(data, { placement })`, `hideDialogue()` and `closeDialogue()`.
- `DialogueUI` sizes itself to its content (up to 45% of the screen height), sits at the bottom or the top (`placement`), keeps clear of the touch buttons through `setSafeArea()`, and reports `getCoverage()` so the camera can frame the object in the part of the screen that is still visible.

### Input and camera
`src/GameControllers.js` has three parts. `WorldScene.update()` drives them once per frame:
- `InputState` merges the keyboard, the first connected gamepad and the HUD's touch buttons into actions: `moveX`/`moveY` (−1..1), `jump`, `interactPressed` and `cancelPressed`. It also tracks the last input `source` and emits `'source'` when it changes. The HUD uses that to show or hide the touch controls.
- `CameraDirector` is the **only** code that may call `startFollow`, `stopFollow` or `pan` on the main camera. It has three modes: `follow` (tracking the player), `focus` (panned to an object; see `focusOn(x, y, coverage)`) and `free` (the player dragged the view). It also handles wheel and pinch zoom (1–2×), drag-to-pan after an 8 px threshold when zoomed in, and an `onTap` callback for taps on empty space.
- `TopDownController` / `PlatformerController` only turn `InputState` into velocity and animation.

Any movement input closes a locked dialogue and returns the camera to `follow`.

**Object interaction.** Behaviours in `src/world/behaviors.js` register each painting, promo and link with `scene.addInteractable({ target, verb, name, activate })`. Every frame, `WorldScene.updateInteractFocus()` picks the interactable whose bounds are nearest the player's body, within 100 px, and sets `interactPrompt` (e.g. "E · View — Renaissance"). `HudScene.update()` draws that prompt fixed at the top-left of the screen and shows the contextual ACT button. `interact()` activates that object; if a dialogue is already open, it follows the CTA when there is one and otherwise closes the dialogue. Clicking or tapping an object runs the same `activate` path, so every input type behaves the same. Portals stay overlap-based.

| Action | Keyboard | Gamepad | Touch / mouse |
|---|---|---|---|
| Move | WASD / arrows | Left stick / d-pad | On-screen buttons |
| Jump (galleries) | Space, W, ↑ | A | JUMP |
| Interact (view / open / CTA) | E, Enter, Space (top-down) | X, or A (top-down) | ACT (when in range), or click / tap the object |
| Close dialogue | Esc | B | ✕, or tap empty space |
| Zoom | — | — | Mouse wheel / pinch |
| Pan when zoomed | — | — | Drag |

## File map
| Path | Role |
|---|---|
| `src/main.js` | Phaser game config |
| `src/GameControllers.js` | `InputState` (keyboard/gamepad/touch), `CameraDirector`, movement controllers |
| `src/DialogueUI.js` | Dialogue box (rendered in the HUD) |
| `src/world/` | Object registry, behaviours, world loader |
| `src/scenes/` | Boot, World and HUD scenes |
| `src/admin/` | Admin editor |
| `src/ui/NpcChat.js` | NPC chat panel (DOM overlay, reads the `/api/npc` NDJSON stream) |
| `api/world.js`, `api/admin.js`, `api/npc.js` | The only three Vercel Functions. `admin.js` routes every `/api/admin/*` request; `npc.js` is the public NPC chat |
| `api/_lib/npc/` | NPC agent (Vercel AI SDK), scraper, search, SSRF-safe fetch, rate limits, knowledge store. Shared with the studio CLI |
| `api/_admin/`, `api/_lib/` | Admin handlers and shared helpers (not deployed as functions) |
| `vercel.json` | Framework, clean URLs (`/admin`), the admin rewrite and security/caching headers |
| `db/schema.sql` | Database schema |
| `scripts/seed.js` | Seeds the DB from the legacy hardcoded world |

## Publishing model
```
editor edits ──► scenes/objects (draft) ──Publish──► world_versions (snapshot N) ──► GET /api/world (CDN, ~60 s)
                         ▲                                     │
                         └────────── Restore (any version) ────┘
Preview ▶  ──► GET /api/world?draft=1 (admin cookie, no-store) ──► game with orange "preview" banner
```
