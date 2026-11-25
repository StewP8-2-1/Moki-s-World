# API (Vercel Functions)

> Status: ✅ all endpoints are implemented (Phases 1–5).

Handlers use Web-standard signatures (`export const GET = (request) => Response`).

**Deployment layout:** only three Vercel Functions are deployed, because the Hobby plan limit is 12 per deployment.
- `api/world.js` serves the public world endpoint.
- `api/npc.js` serves the public NPC chat (see `docs/NPC.md`).
- `api/admin.js` serves every `/api/admin/*` endpoint. `vercel.json` rewrites `/api/admin/<path>` to `/api/admin?__path=<path>`, and the router dispatches to the modules in `api/_admin/`, passing `:id` params.

Folders starting with `_` (`api/_admin/`, `api/_lib/`) are never deployed or routed. Locally, `npm run dev` serves the same files through `scripts/viteDevApi.js`, which applies the same `vercel.json` rewrites.

## Public
| Method | Path | Description |
|---|---|---|
| GET | `/api/world` ✅ | Latest published world snapshot (format in `docs/DATABASE.md`), plus `version` and `publishedAt`. Returns `404` if nothing is published and `503` if the DB isn't configured. |
| GET | `/api/world?draft=1` ✅ | The live **draft** (with `draft: true`), for *Preview as player*. Needs the admin cookie (`401` otherwise; the game then falls back to the published world). `Cache-Control: private, no-store` |

**Caching of `/api/world`:**
- `Cache-Control: public, max-age=0, must-revalidate` makes browsers always check, so returning visitors never see a stale version.
- `Vercel-CDN-Cache-Control: max-age=60, stale-while-revalidate=600` lets only Vercel's CDN cache it, so a publish goes live within about a minute.
- Don't put `stale-while-revalidate` in `Cache-Control`. Browsers honour it, and returning visitors would see the previous version once after every publish.

| GET | `/api/npc?npcId=:uuid` ✅ | `{ name, greeting }` of a **published** NPC. `404` if unknown |
| POST | `/api/npc` ✅ | `{ npcId, messages: [{ role: 'user' or 'assistant', content }] }` → NDJSON stream, one event per line: `{type:'text',delta}`, `{type:'tool',name}`, `{type:'source',url,title}`, `{type:'done'}` or `{type:'error',message}`. `403` without a same-origin `Origin`, `400` for bad input (max 12 turns, 500 chars per player message), `404` for an unknown or unpublished NPC, `429` when rate-limited. With `draft: true` (sent by *Preview as player*) it chats with the unpublished draft NPC instead; that needs the admin cookie (`401` otherwise) |

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
| GET | `/api/admin/draft` ✅ | `{ world, published, changedAt, hasUnpublishedChanges }`: `world` is the editable draft in snapshot format; `published` is `{ version, publishedAt, note }` or `null` |
| GET | `/api/admin/scenes` ✅ | List scenes, without objects |
| POST | `/api/admin/scenes` ✅ | `{ id, name, mode, width, height, spawn, background?, ground?, sort? }` → `201 { scene }`. `409` if the id exists. `sort` defaults to last |
| PUT | `/api/admin/scenes/:id` ✅ | Partial update, merged over the stored scene and re-validated. The id itself can't change |
| DELETE | `/api/admin/scenes/:id` ✅ | Deletes the scene and its objects. Refused (`400`) for `hub` or while portals in other scenes lead to it |
| GET | `/api/admin/objects?scene=:id` ✅ | List a scene's objects |
| POST | `/api/admin/objects` ✅ | `{ id?, sceneId, type, x, y, size?, rotation?, depth?, visible?, props }` → `201 { object }`. The client may supply the uuid, so undo/redo keeps ids stable. `409` if it exists |
| PATCH | `/api/admin/objects/:id` ✅ | Partial update. Fields and `props` keys are merged over the stored object, and the result is fully re-validated. `type` can't change |
| DELETE | `/api/admin/objects/:id` ✅ | Delete one object |

Every write also bumps `draft_state.changed_at`, which drives `hasUnpublishedChanges`.
| GET | `/api/admin/npc-knowledge/:id` ✅ | The NPC's stored reference pages (`url, title, chars, preview, fetchedAt`) |
| POST | `/api/admin/npc-knowledge/:id` ✅ | Re-scrapes the **draft** NPC's `referenceUrls` and replaces its knowledge pack → `{ results: [{ url, ok, title?, chars?, error? }] }` |
| POST | `/api/admin/publish` ✅ | `{ note? }` → `201 { published: { version, publishedAt, note } }`. Snapshots the draft into `world_versions`, and the draft becomes "clean" |
| GET | `/api/admin/versions` ✅ | `{ versions: [{ version, publishedAt, note, scenes, objects }] }`, newest first, at most 100 |
| POST | `/api/admin/restore` ✅ | `{ version }` → replaces the **draft** with that snapshot, re-validated. Nothing goes live until the next publish. `404` if the version is unknown |
| POST | `/api/admin/upload` ✅ | Vercel Blob client-upload handshake (`handleUpload`). Only images are allowed (PNG/JPEG/WebP/GIF), up to 10 MB. The path must be `uploads/<safe name>`, and a random suffix is added. The browser then uploads directly to Blob, so there's no 4.5 MB function body limit |
| GET | `/api/admin/assets` ✅ | Media library: `{ assets: [{ id, url, name, width, height, createdAt }] }` |
| POST | `/api/admin/assets` ✅ | `{ url, name, width?, height? }` → records a finished upload. Only `https://*.public.blob.vercel-storage.com` URLs are accepted |

Errors use JSON, `{ error: string }`, with standard status codes: 400 validation, 401 auth, 404, 415 content type, 503 not configured, 500.
