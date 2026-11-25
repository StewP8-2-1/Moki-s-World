/**
 * NPC data access: published NPC lookup and the knowledge pack (npc_knowledge).
 * Shared by api/npc.js, the admin npc-knowledge endpoint and the studio CLI.
 */
import { scrapeUrl } from './scrape.js';
import { parseReferenceUrls } from './agent.js';
import { loadDraft } from '../world.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => UUID_RE.test(String(s || ''));

/** Find an NPC object in the latest *published* snapshot (drafts never reach players). */
export async function loadPublishedNpc(sql, npcId) {
  if (!isUuid(npcId)) return null;
  const rows = await sql`
    SELECT o AS obj
    FROM (SELECT snapshot FROM world_versions ORDER BY id DESC LIMIT 1) v,
         jsonb_array_elements(v.snapshot->'scenes') s,
         jsonb_array_elements(s->'objects') o
    WHERE o->>'id' = ${npcId} AND o->>'type' = 'npc'
    LIMIT 1`;
  return rows[0]?.obj ?? null;
}

/** Latest published snapshot (with publishedAt), or null if nothing is published. */
export async function loadPublishedWorld(sql) {
  const rows = await sql`SELECT snapshot, published_at FROM world_versions ORDER BY id DESC LIMIT 1`;
  return rows[0] ? { ...rows[0].snapshot, publishedAt: rows[0].published_at } : null;
}

/** The live draft as a snapshot (scenes + objects tables), for "Preview as player" and the studio. */
export async function loadDraftWorld(sql) {
  return loadDraft(sql);
}

/** Find an NPC object inside a snapshot. */
export function findNpc(world, npcId) {
  for (const s of world?.scenes || []) {
    const o = (s.objects || []).find((x) => x.id === npcId && x.type === 'npc');
    if (o) return o;
  }
  return null;
}

/** Find an NPC in the live *draft* (objects table), for admins using "Preview as player". */
export async function loadDraftNpc(sql, npcId) {
  if (!isUuid(npcId)) return null;
  const rows = await sql`SELECT id, type, props FROM objects WHERE id = ${npcId} AND type = 'npc'`;
  return rows[0] ?? null;
}

export async function loadKnowledge(sql, objectId) {
  if (!isUuid(objectId)) return [];
  return sql`SELECT url, title, content, fetched_at FROM npc_knowledge WHERE object_id = ${objectId} ORDER BY id`;
}

export async function upsertKnowledge(sql, objectId, { url, title, content }) {
  const rows = await sql`
    INSERT INTO npc_knowledge (object_id, url, title, content, fetched_at)
    VALUES (${objectId}, ${url}, ${title || ''}, ${content || ''}, now())
    ON CONFLICT (object_id, url) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, fetched_at = now()
    RETURNING id, url, title, length(content) AS chars, fetched_at`;
  return rows[0];
}

/** Remove knowledge rows for URLs that are no longer referenced. */
export async function pruneKnowledge(sql, objectId, keepUrls) {
  return sql`DELETE FROM npc_knowledge WHERE object_id = ${objectId} AND NOT (url = ANY(${keepUrls}))`;
}

/** Scrape every reference URL of an NPC and store the results. Returns per-URL outcome. */
export async function refreshKnowledge(sql, objectId, referenceUrls) {
  const urls = parseReferenceUrls(referenceUrls);
  const results = [];
  for (const url of urls) {
    try {
      const page = await scrapeUrl(url);
      const row = await upsertKnowledge(sql, objectId, { url, title: page.title, content: page.text });
      results.push({ url, ok: true, title: row.title, chars: Number(row.chars), truncated: page.truncated });
    } catch (err) {
      results.push({ url, ok: false, error: err.message });
    }
  }
  await pruneKnowledge(sql, objectId, urls);
  return results;
}
