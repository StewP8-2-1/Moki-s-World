/**
 * World knowledge for NPCs: turns the world snapshot (scenes + objects from the database) into a
 * compact catalog the NPC can talk about — paintings (titles, descriptions), links, portals,
 * promos (with date windows), signs and other NPCs — with rough "where to find it" hints.
 *
 * - catalogPrompt(): short overview injected into the system prompt
 * - searchCatalog(): backs the `world_info` tool (full descriptions, filtered by keywords / scene)
 */
const SNIPPET = 160;
const FULL = 1500;

const oneLine = (s) => String(s || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' — ');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function isActive(obj, now) {
  if (obj.visible === false) return false;
  const { startsAt, endsAt } = obj.props || {};
  if (startsAt && now < Date.parse(startsAt)) return false;
  if (endsAt && now > Date.parse(endsAt)) return false;
  return true;
}

/** Rough, human location: thirds of the hub, or how far along a side-scrolling gallery. */
function whereIn(scene, obj) {
  const w = scene.width || 1, h = scene.height || 1;
  if (scene.mode === 'platformer') {
    const f = obj.x / w;
    return f < 0.2 ? 'near the entrance (left end)' : f < 0.45 ? 'in the first half' : f < 0.7 ? 'around the middle' : f < 0.88 ? 'in the second half' : 'near the far (right) end';
  }
  const col = obj.x < w / 3 ? 'left' : obj.x > (2 * w) / 3 ? 'right' : 'center';
  const row = obj.y < h / 3 ? 'top' : obj.y > (2 * h) / 3 ? 'bottom' : 'middle';
  return row === 'middle' && col === 'center' ? 'in the middle' : `${row}-${col} area`;
}

/**
 * @param world snapshot { scenes: [{ id, name, mode, width, height, objects: [...] }], publishedAt? }
 * @param opts { selfId?, selfName?, now? } — the talking NPC is left out of the catalog
 */
export function buildWorldCatalog(world, { selfId = null, selfName = null, now = Date.now() } = {}) {
  const scenes = world?.scenes || [];
  const sceneName = new Map(scenes.map((s) => [s.id, s.name || s.id]));
  const items = [];

  for (const scene of scenes) {
    const objs = (scene.objects || []).filter((o) => isActive(o, now));
    const paintings = objs.filter((o) => o.type === 'painting').sort((a, b) => a.x - b.x);
    for (const o of objs) {
      const p = o.props || {};
      const base = { scene: scene.id, sceneName: sceneName.get(scene.id), where: whereIn(scene, o) };
      switch (o.type) {
        case 'painting': {
          const n = paintings.indexOf(o) + 1;
          // Titles are often "Requested by: <name>\n<artwork title>" — split that out so the NPC
          // doesn't present the requester as the artist.
          const lines = String(p.title || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const reqIdx = lines.findIndex((l) => /^requested by\s*:/i.test(l));
          const requestedBy = reqIdx >= 0 ? lines.splice(reqIdx, 1)[0].replace(/^requested by\s*:\s*/i, '') : undefined;
          items.push({
            ...base,
            type: 'painting',
            title: lines.join(' — ') || 'Untitled',
            requestedBy,
            text: String(p.description || '').trim(),
            order: scene.mode === 'platformer' ? `artwork ${n} of ${paintings.length} from the entrance` : undefined,
          });
          break;
        }
        case 'link':
          items.push({ ...base, type: 'link', title: oneLine(p.label) || 'Link', url: p.url });
          break;
        case 'portal':
          items.push({ ...base, type: 'portal', title: oneLine(p.label) || 'Portal', leadsTo: sceneName.get(p.targetScene) || p.targetScene });
          break;
        case 'promo':
          items.push({ ...base, type: 'promo', title: oneLine(p.title) || 'Promo', text: String(p.body || '').trim(), cta: p.ctaUrl ? { label: p.ctaLabel || 'Learn more', url: p.ctaUrl } : undefined, until: p.endsAt || undefined });
          break;
        case 'text':
          if (p.text) items.push({ ...base, type: 'sign', title: oneLine(p.text) });
          break;
        case 'npc':
          if (o.id === selfId || (selfName && p.name === selfName)) break;
          items.push({ ...base, type: 'npc', title: p.name || 'Someone', text: p.greeting || '' });
          break;
        default:
          break; // decor: nothing to say
      }
    }
  }
  return {
    scenes: scenes.map((s) => ({ id: s.id, name: s.name || s.id, kind: s.mode === 'platformer' ? 'side-scrolling gallery' : 'top-down area' })),
    items,
    publishedAt: world?.publishedAt || null,
  };
}

const esc = (s) => String(s || '').replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›'));

function itemLine(it, textChars) {
  const bits = [`[${it.type}] ${esc(it.title)}`];
  if (it.requestedBy) bits.push(` (requested by ${esc(it.requestedBy)})`);
  if (it.text) bits.push(`: ${esc(clip(oneLine(it.text), textChars))}`);
  if (it.leadsTo) bits.push(` → leads to ${esc(it.leadsTo)}`);
  if (it.url) bits.push(` (${it.url})`);
  if (it.cta) bits.push(` — button "${esc(it.cta.label)}" → ${it.cta.url}`);
  if (it.until) bits.push(` — until ${it.until.slice(0, 10)}`);
  bits.push(` · ${it.order || it.where}`);
  return `- ${bits.join('')}`;
}

/** Overview for the system prompt, grouped by scene; capped in size. */
export function catalogPrompt(catalog, { maxChars = 6000 } = {}) {
  if (!catalog?.items?.length) return '';
  const out = [];
  for (const s of catalog.scenes) {
    out.push(`### ${esc(s.name)} (${s.kind}, id "${s.id}")`);
    for (const it of catalog.items.filter((i) => i.scene === s.id)) out.push(itemLine(it, SNIPPET));
  }
  let text = out.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n[…more — use world_info]`;
  return text;
}

/** Keyword / type / scene search with full text, for the world_info tool. */
export function searchCatalog(catalog, { query = '', scene = '', type = '' } = {}, { limit = 8 } = {}) {
  const terms = String(query).toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const sceneQ = String(scene).toLowerCase();
  let items = catalog.items.filter((it) =>
    (!sceneQ || it.scene.toLowerCase() === sceneQ || it.sceneName.toLowerCase().includes(sceneQ))
    && (!type || it.type === type));
  if (terms.length) {
    items = items
      .map((it) => {
        const hay = `${it.title} ${it.requestedBy || ''} ${it.text || ''} ${it.leadsTo || ''} ${it.sceneName} ${it.type}`.toLowerCase();
        return { it, score: terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.it);
  }
  return items.slice(0, limit).map((it) => ({ ...it, text: it.text ? clip(it.text, FULL) : undefined }));
}
