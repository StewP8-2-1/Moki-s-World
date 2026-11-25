# API (Vercel Functions)

> Status: planned. Each endpoint is marked ✅ when it is implemented.

## Public
| Method | Path | Description |
|---|---|---|
| GET | `/api/world` | Latest published world snapshot. Cached at the CDN (`s-maxage=60, stale-while-revalidate`). `?draft=1` with a valid admin cookie returns the live draft instead. |

## Admin (requires the `mw_admin` httpOnly cookie)
| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/login` | `{ password }` → sets the cookie (7 days) |
| POST | `/api/admin/logout` | Clears the cookie |
| GET | `/api/admin/me` | `200` if logged in, else `401` |
| GET / POST | `/api/admin/scenes` | List scenes / create a scene |
| GET / PUT / DELETE | `/api/admin/scenes/:id` | Read / update / delete one scene |
| GET / POST | `/api/admin/objects?scene=:id` | List / create objects |
| PATCH / DELETE | `/api/admin/objects/:id` | Update / delete one object |
| POST | `/api/admin/publish` | `{ note? }` → snapshot the draft into `world_versions` |
| GET | `/api/admin/versions` | Version history |
| POST | `/api/admin/versions/:id/restore` | Copy a snapshot back into the draft tables |
| POST | `/api/admin/upload` | Vercel Blob client-upload handshake; records the file in `assets` |
| GET | `/api/admin/assets` | Media library |

Errors use JSON, `{ error: string }`, with standard status codes (400 validation, 401 auth, 404, 500).
