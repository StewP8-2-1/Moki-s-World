# Architecture

> Status: Phases 1–2 are implemented: the API, the DB and the data-driven game. The admin editor (Phases 3–5) is still planned.

## Adding a new object type
1. `src/world/objectTypes.js`: add `label`, `icon`, `defaults`, `fields` and `create`.
2. `api/lib/validate.js`: add a matching `PROP_SPECS` entry.
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
`src/world/objectTypes.js` defines each object type (`painting`, `link`, `portal`, `promo`, `text`, `decor`). Each type has:
- `defaults`: default props for new objects
- `fields`: the inspector form schema
- `create(scene, obj)`: builds the Phaser GameObject

The game and the editor both call `create()`, so what you see in the editor is what players see. Interactions that only happen in the game, such as the dialogue box, camera pan, opening links and portal travel, are attached in `src/world/behaviors.js`.

### Scenes
- `BootScene` loads the world JSON and every image it references, creates the animations, and then starts `WorldScene`.
- `WorldScene({ sceneId })` builds one scene from the data. Its `mode` picks the controller from `src/GameControllers.js`:
  - `topdown` → `TopDownController`
  - `platformer` → `PlatformerController`

## File map
| Path | Role |
|---|---|
| `src/main.js` | Phaser game config |
| `src/GameControllers.js` | Player controllers, zoom/pan, D-pad, menu |
| `src/DialogueUI.js` | Bottom dialogue box |
| `src/world/` | Object registry, behaviours, world loader |
| `src/scenes/` | Boot + World scenes |
| `src/admin/` | Admin editor |
| `api/` | Serverless endpoints (`api/lib/` helpers) |
| `db/schema.sql` | Database schema |
| `scripts/seed.js` | Seeds the DB from the legacy hardcoded world |
