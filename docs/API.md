# API (Vercel Functions)

> Status: ✅ marks implemented endpoints. Everything else is planned for Phases 4–5.

Handlers live in `api/` and use Web-standard signatures (`export const GET = (request) => Response`). Helpers live in `api/_lib/`, which Vercel does not deploy as functions. Locally, `npm run dev` serves these same files through `scripts/viteDevApi.js`.

## Public
| Method | Path | Description |
|---|---|---|
| GET | `/api/world` ✅ | Latest published world snapshot (format in `docs/DATABASE.md`). Cached at the CDN (`s-maxage=60, stale-while-revalidate=600`). Returns `404` if nothing is published and `503` if the DB isn't configured. _Phase 5:_ `?draft=1` with a valid admin cookie will return the live draft instead. |

## Admin auth
There is a single password (`ADMIN_PASSWORD`).

**Login and session**
- `POST /api/admin/login` checks the password in constant time; a wrong password is slowed by 600 ms.
- On success it sets the `mw_admin` cookie: an HS256 JWT signed with `AUTH_SECRET`, sent `HttpOnly; SameSite=Strict; Path=/; Max-Age=604800`, plus `Secure` on https.

**Invalidation**
- The JWT contains a fingerprint of the password, so changing `ADMIN_PASSWORD` logs out every session.

**Request rules**
- Every admin endpoint except login and logout returns `401` without a valid session.
- Mutating requests must send `Content-Type: application/json`, otherwise they get `415`. Together with `SameSite=Strict`, this is the CSRF protection.

## Admin endpoints
| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/login` ✅ | `{ password }` → `200 { ok: true }` and sets the cookie, or `401 Wrong password` |
| POST | `/api/admin/logout` ✅ | Clears the cookie |
| GET | `/api/admin/me` ✅ | `200 { admin: true }` if logged in, else `401` |
| GET | `/api/admin/draft` ✅ | `{ world, published }`: `world` is the editable draft in snapshot format; `published` is `{ version, publishedAt, note }` or `null` |
| GET / POST | `/api/admin/scenes` | List scenes / create a scene |
| GET / PUT / DELETE | `/api/admin/scenes/:id` | Read / update / delete one scene |
| GET / POST | `/api/admin/objects?scene=:id` | List / create objects |
| PATCH / DELETE | `/api/admin/objects/:id` | Update / delete one object |
| POST | `/api/admin/publish` | `{ note? }` → snapshot the draft into `world_versions` |
| GET | `/api/admin/versions` | Version history |
| POST | `/api/admin/versions/:id/restore` | Copy a snapshot back into the draft tables |
| POST | `/api/admin/upload` | Vercel Blob client-upload handshake; records the file in `assets` |
| GET | `/api/admin/assets` | Media library |

Errors use JSON, `{ error: string }`, with standard status codes: 400 validation, 401 auth, 404, 415 content type, 503 not configured, 500.
