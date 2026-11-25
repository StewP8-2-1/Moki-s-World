# Database (Neon Postgres)

> Status: planned. `db/schema.sql` lands in Phase 1 and is the source of truth.

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
