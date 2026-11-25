# NPCs (chat characters)

Players can walk up to an **NPC** object and chat with it. Each NPC is a chatbot on a cloud LLM,
reached through the **Vercel AI SDK** and the **Vercel AI Gateway**. It answers from reference
pages you give it, and can read or search those sites live.

## How it works
- **Player side.** The prompt says "E · Talk — Pip". A chat panel opens (`src/ui/NpcChat.js`, a DOM overlay).
  - Game keyboard input is suspended while it's open.
  - Esc, ✕, or walking away with a gamepad closes it.
  - History lives in the page's memory, per NPC.
- **Server side.** `POST /api/npc` (`api/npc.js`) does the following:
  - Loads the NPC from the **latest published** world, so drafts never reach players.
  - Loads its knowledge pack from `npc_knowledge`.
  - Runs `runNpcChat()` (`api/_lib/npc/agent.js`) and streams NDJSON events back.

### Tools the model can use
| Tool | What it does | When it's available |
|---|---|---|
| `world_info` | Searches the live world data (from the database): artworks with full descriptions and who requested them, galleries, portals and where they lead, social/shop links, promos and their dates, signs and other NPCs, each with a rough location | Always, when the world has content |
| `lookup_reference` | Keyword search over the stored knowledge pack | The NPC has knowledge rows |
| `fetch_page` | Scrapes a live page (`api/_lib/npc/scrape.js`: Readability + linkedom) | Only on the NPC's **reference domains**; at most 2 per message |
| `search_web` | Tavily or Brave search, restricted to the reference domains | `liveWeb` is on and a search key is set; at most 1 per message |

### World knowledge
Every chat loads the world the player is in: the **published** snapshot, or the **draft** for *Preview as player*. `api/_lib/npc/worldInfo.js` turns it into a catalog.
- **In the system prompt:** a compact overview, about 2.5k characters for the current world. It is grouped by scene, with each item's title, a 160-character description, links, portal targets, promo end dates, and where to find it ("middle-right area", "artwork 6 of 8 from the entrance").
- **Through `world_info`:** full descriptions plus keyword, scene and type filters.

Painting titles written as "Requested by: <name>" + title are split, so NPCs name the requester and never call them the artist. Hidden objects, expired or future promos, decorations and the NPC itself are left out. The world data is treated as owner-written data, not as instructions.

### Knowledge pack
Up to 16k characters of excerpts go into the system prompt. The rest is reachable through `lookup_reference`. Reference text is always marked as **untrusted data**, and the model is told to ignore any instructions inside it.

## Model and cost
| Setting | Default |
|---|---|
| `NPC_MODEL` | `anthropic/claude-haiku-5.5`: $0.10 in / $0.50 out per million tokens, fast, good at tool use |
| `NPC_FALLBACK_MODELS` | `google/gemini-3.5-flash-lite` (comma-separated; the Gateway tries these if the main model fails) |

A typical reply with one page fetch uses about 4k input and 250 output tokens, which is roughly **$0.0005**. Measured on 2026-11-25.

## Safety and abuse limits
- **SSRF.** Every fetch goes through `api/_lib/npc/safeFetch.js`:
  - only http(s) on ports 80/443/8080/8443
  - each redirect hop is DNS-checked, and private, loopback, link-local and metadata IPs are rejected
  - 8 s timeout, 2 MB cap, text content types only
- **Origin.** `POST /api/npc` must come from the same origin. Extra origins can be allowed with `NPC_ALLOWED_ORIGINS`.
- **Rate limits.** Stored in `npc_rate`, with hashed IPs:
  - `NPC_RATE_PER_IP` messages per `NPC_RATE_WINDOW_S` (default 20 per 600 s)
  - `NPC_DAILY_LIMIT` messages per day across everyone (default 2000), which acts as a cost ceiling
- **Input limits.** At most 12 turns of history, 500 characters per player message, and 500 output tokens per reply.
- **Persona is public.** It is part of the published world JSON. Never put secrets in it.

## Environment variables
| Var | Needed | Notes |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Locally, unless `VERCEL_OIDC_TOKEN` is pulled | On Vercel, OIDC authenticates automatically. AI Gateway must be enabled for the project |
| `TAVILY_API_KEY` or `BRAVE_SEARCH_API_KEY` | Only for `search_web` | |
| `NPC_MODEL`, `NPC_FALLBACK_MODELS`, `NPC_DAILY_LIMIT`, `NPC_RATE_PER_IP`, `NPC_RATE_WINDOW_S`, `NPC_ALLOWED_ORIGINS` | Optional | Defaults are listed above |

## Creating an NPC
1. In `/admin`, add **💬 NPC (chat)** and fill in Image, Name, Greeting, Persona and Reference URLs.
2. Fill the knowledge pack in one of two ways:
   - `POST /api/admin/npc-knowledge/:id` scrapes the object's reference URLs.
   - The studio CLI (`mokis-world_studio`, `node studio/cli.js npc push`) uploads hand-reviewed pages.
3. **Test before publishing.** Use *Preview as player* (`/?draft=1` while signed in). The chat then sends `draft: true` and talks to the unpublished NPC; that path requires the admin cookie.
4. **Publish.** Players can only talk to NPCs in the published world.

The studio's `moki-npc` skill automates all of this: sprite, persona, scraping, test chats and the push.
