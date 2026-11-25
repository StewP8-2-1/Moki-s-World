/**
 * Public NPC chat (the third Vercel Function; see CLAUDE.md "Function budget").
 *
 * GET  /api/npc?npcId=<uuid>               -> { name, greeting } for a published NPC
 * POST /api/npc  { npcId, messages: [...], draft? } -> NDJSON stream, one event per line
 *        (draft: true chats with the unpublished draft NPC; admin cookie required):
 *        {"type":"text","delta":"..."} | {"type":"tool","name":"fetch_page"}
 *        {"type":"source","url":"...","title":"..."} | {"type":"done"} | {"type":"error","message":"..."}
 *
 * NPCs are read from the latest *published* snapshot; their knowledge pack from npc_knowledge.
 * Guards: same-origin check, input limits, per-IP + daily rate limits (api/_lib/npc/rateLimit.js).
 */
import { getSql } from './_lib/db.js';
import { handle, json, readJson, HttpError } from './_lib/http.js';
import { requireAdmin } from './_lib/auth.js';
import { loadPublishedNpc, loadPublishedWorld, loadDraftWorld, findNpc, loadKnowledge, isUuid } from './_lib/npc/store.js';
import { enforceRateLimit } from './_lib/npc/rateLimit.js';
import { runNpcChat } from './_lib/npc/agent.js';

const MAX_TURNS = 12;
const MAX_USER_CHARS = 500;
const MAX_ASSISTANT_CHARS = 3000;

function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) throw new HttpError(403, 'Missing origin');
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const extra = (process.env.NPC_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Bad origin');
  }
  if (originHost !== host && !extra.includes(origin)) throw new HttpError(403, 'Cross-origin requests are not allowed');
}

/** Validate + normalise the chat history; returns the last MAX_TURNS messages ending with the player's. */
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new HttpError(400, 'messages must be a non-empty array');
  const recent = messages.slice(-MAX_TURNS);
  const out = recent.map((m, i) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) throw new HttpError(400, `message ${i + 1}: role must be user or assistant`);
    if (typeof m.content !== 'string') throw new HttpError(400, `message ${i + 1}: content must be text`);
    const max = m.role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS;
    const content = m.content.trim();
    if (!content) throw new HttpError(400, `message ${i + 1} is empty`);
    if (content.length > max) throw new HttpError(400, `Message is too long (max ${max} characters)`);
    return { role: m.role, content };
  });
  while (out.length && out[0].role !== 'user') out.shift(); // history must start with the player
  if (!out.length || out[out.length - 1].role !== 'user') throw new HttpError(400, 'The last message must be from the player');
  return out;
}

export const GET = handle(async (request) => {
  const npcId = new URL(request.url).searchParams.get('npcId');
  if (!isUuid(npcId)) throw new HttpError(400, 'npcId is required');
  const npc = await loadPublishedNpc(getSql(), npcId);
  if (!npc) throw new HttpError(404, 'NPC not found');
  return json({ name: npc.props?.name || '', greeting: npc.props?.greeting || '' }, 200, {
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vercel-CDN-Cache-Control': 'max-age=60',
  });
});

export const POST = handle(async (request) => {
  assertSameOrigin(request);
  const body = await readJson(request);
  if (!isUuid(body?.npcId)) throw new HttpError(400, 'npcId is required');
  const messages = validateMessages(body.messages);

  const sql = getSql();
  let world;
  if (body.draft === true) {
    // "Preview as player": admins can chat with unpublished NPCs (and they see the draft world).
    await requireAdmin(request);
    world = await loadDraftWorld(sql);
  } else {
    world = await loadPublishedWorld(sql);
  }
  const npc = findNpc(world, body.npcId);
  if (!npc) throw new HttpError(404, 'NPC not found (is the world published?)');
  await enforceRateLimit(sql, request);
  const knowledge = await loadKnowledge(sql, body.npcId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runNpcChat({ npc: npc.props || {}, knowledge, world, selfId: npc.id, messages, emit: send, abortSignal: request.signal });
        send({ type: 'done' });
      } catch (err) {
        console.error('[npc]', err);
        send({ type: 'error', message: 'Sorry, I lost my train of thought. Try again?' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
});
