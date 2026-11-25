import fallbackWorld from '../data/fallbackWorld.json';

export const SUPPORTED_FORMAT = 1;

/**
 * Fetch the world snapshot from /api/world, falling back to the bundled JSON
 * (offline, `npm run dev` without the API, or any API error).
 * @returns {Promise<{ world: object, source: 'api' | 'fallback' }>}
 */
export async function loadWorld({ draft = false, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/world${draft ? '?draft=1' : ''}`, {
      credentials: 'same-origin',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const world = await res.json();
    if (world?.format !== SUPPORTED_FORMAT || !Array.isArray(world.scenes)) throw new Error('Unexpected world format');
    return { world, source: 'api' };
  } catch (err) {
    if (draft) {
      console.info(`[world] draft preview unavailable (${err.message}), showing the published world`);
      return loadWorld({ draft: false, timeoutMs });
    }
    console.info(`[world] using bundled fallback (${err.message})`);
    return { world: fallbackWorld, source: 'fallback' };
  } finally {
    clearTimeout(timer);
  }
}

/** Every image URL referenced by the world (object images + scene backgrounds), de-duplicated. */
export function collectImageUrls(world) {
  const urls = new Set();
  for (const scene of world.scenes) {
    if (scene.background?.imageUrl) urls.add(scene.background.imageUrl);
    for (const obj of scene.objects) if (obj.props?.imageUrl) urls.add(obj.props.imageUrl);
  }
  return [...urls];
}

/** Texture key used for an image URL (shared by game + editor). */
export const textureKey = (url) => `img:${url}`;

/** Promo objects can be time-boxed. */
export function isActive(obj, now = Date.now()) {
  if (obj.visible === false) return false;
  const { startsAt, endsAt } = obj.props || {};
  if (startsAt && now < Date.parse(startsAt)) return false;
  if (endsAt && now > Date.parse(endsAt)) return false;
  return true;
}
