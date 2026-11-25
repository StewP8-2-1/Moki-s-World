# Database (Neon Postgres)

> Status: ✅ the schema is implemented in `db/schema.sql`, which is the source of truth and safe to re-run. The snapshot builder is `api/_lib/world.js`.

## Tables
### `scenes` (draft)
| column | type | notes |
|---|---|---|
| `id` | text PK | slug: `hub`, `requested`, `artwork` |
| `name` | text | display name |
| `mode` | text | `topdown` \| `platformer` |
| `width`, `height` | int | world size in px |
| `spawn_x`, `spawn_y` | int | player spawn |
| `background` | jsonb | `{ color, imageUrl?, parallax? }` |
| `ground` | jsonb, nullable | `{ y, color }` (platformer only) |
| `sort` | int | order in the editor |
| `updated_at` | timestamptz | |

### `objects` (draft)
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `scene_id` | text FK → scenes | cascade delete |
| `type` | text | see below |
| `x`, `y` | real | centre position |
| `size` | real | length of the longest side in px |
| `rotation` | real | degrees |
| `depth` | int | draw order |
| `visible` | bool | |
| `props` | jsonb | type-specific |
| `updated_at` | timestamptz | |

### `world_versions`
`id serial`, `snapshot jsonb`, `published_at timestamptz`, `note text`. The game reads the row with the highest `id`.

### `draft_state`
This table holds a single row (`id = 1`) with `changed_at`. Every admin write bumps it. The draft has unpublished changes when `changed_at` is later than the latest `world_versions.published_at`.

### Migrations
`db/schema.sql` is idempotent. Run `npm run db:migrate` (`scripts/migrate.js`) after changing it; `npm run db:seed` also applies it first.

### `assets`
`id`, `url`, `name`, `width`, `height`, `created_at`. This is the media library for uploaded images.

## Object `props` by type
| type | props |
|---|---|
| `painting` | `imageUrl, title, description, panOnClick` |
| `link` | `imageUrl, url, label, openInNewTab` |
| `portal` | `imageUrl, targetScene, label` |
| `promo` | `imageUrl, title, body, ctaLabel, ctaUrl, startsAt?, endsAt?` |
| `text` | `text, fontSize, color` |
| `decor` | `imageUrl` |

## Snapshot format
The same format is used by `world_versions.snapshot`, `GET /api/world` and `src/data/fallbackWorld.json`:
```json
{
  "format": 1,
  "version": 3,
  "publishedAt": "2026-11-25T10:00:00Z",
  "startScene": "hub",
  "scenes": [{
    "id": "hub", "name": "Moki's Hub", "mode": "topdown",
    "width": 900, "height": 900, "spawn": { "x": 400, "y": 300 },
    "background": { "color": "#ffffff" }, "ground": null, "sort": 0,
    "objects": [{ "id": "…", "type": "link", "x": 400, "y": 180, "size": 100,
                  "rotation": 0, "depth": -1, "visible": true, "props": { } }]
  }]
}
```
Objects are sorted by `depth`. `size` is the length of the image's longest side in world pixels. Image URLs are absolute (Blob) or relative to the site root (legacy files in `public/`).
