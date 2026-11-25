/**
 * Validation + normalisation for scenes and objects. Used by the admin API and scripts/seed.js.
 * Returns clean copies; throws HttpError(400) with a readable message on bad input.
 * Keep PROP_SPECS in sync with src/world/objectTypes.js (inspector fields).
 */
import { HttpError } from './http.js';

const fail = (msg) => { throw new HttpError(400, msg); };

const num = (v, name, { min = -1e6, max = 1e6, int = false } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(`${name} must be a number between ${min} and ${max}`);
  return int ? Math.round(n) : n;
};
const str = (v, name, { max = 2000, required = false } = {}) => {
  if (v == null || v === '') { if (required) fail(`${name} is required`); return ''; }
  if (typeof v !== 'string') fail(`${name} must be text`);
  if (v.length > max) fail(`${name} is too long (max ${max})`);
  return v;
};
const bool = (v, def = false) => (v == null ? def : Boolean(v));
const color = (v, name, def) => {
  if (v == null || v === '') return def;
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) fail(`${name} must be a colour like #1a2b3c`);
  return v;
};

/** http(s) absolute URL, or a site-relative path. Rejects javascript:, data:, etc. */
export function safeUrl(v, name, { required = false, allowRelative = true } = {}) {
  const s = str(v, name, { max: 2048, required });
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try { new URL(s); return s; } catch { fail(`${name} is not a valid URL`); }
  }
  if (allowRelative && !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith('//')) return s;
  fail(`${name} must start with http:// or https://`);
}
const date = (v, name) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) fail(`${name} must be a date`);
  return d.toISOString();
};

const label = (p) => ({
  label: str(p.label, 'Label', { max: 200 }),
  labelSize: num(p.labelSize ?? 18, 'Label size', { min: 8, max: 96, int: true }),
  labelOffset: num(p.labelOffset ?? -60, 'Label offset', { min: -1000, max: 1000, int: true }),
});

export const PROP_SPECS = {
  painting: (p) => ({
    imageUrl: safeUrl(p.imageUrl, 'Image', { required: true }),
    title: str(p.title, 'Title', { max: 300 }),
    description: str(p.description, 'Description', { max: 2000 }),
    panOnClick: bool(p.panOnClick, true),
  }),
  link: (p) => ({
    imageUrl: safeUrl(p.imageUrl, 'Image', { required: true }),
    url: safeUrl(p.url, 'Link URL', { required: true, allowRelative: false }),
    openInNewTab: bool(p.openInNewTab, true),
    ...label(p),
  }),
  portal: (p, ctx) => {
    const targetScene = str(p.targetScene, 'Destination scene', { required: true, max: 64 });
    if (ctx.sceneIds && !ctx.sceneIds.has(targetScene)) fail(`Destination scene "${targetScene}" does not exist`);
    return { imageUrl: safeUrl(p.imageUrl, 'Image', { required: true }), targetScene, ...label(p) };
  },
  promo: (p) => {
    const startsAt = date(p.startsAt, 'Start date');
    const endsAt = date(p.endsAt, 'End date');
    if (startsAt && endsAt && startsAt > endsAt) fail('End date must be after start date');
    return {
      imageUrl: safeUrl(p.imageUrl, 'Image', { required: true }),
      title: str(p.title, 'Title', { max: 300 }),
      body: str(p.body, 'Text', { max: 2000 }),
      ctaLabel: str(p.ctaLabel, 'Button label', { max: 60 }),
      ctaUrl: safeUrl(p.ctaUrl, 'Button URL', { allowRelative: false }),
      startsAt, endsAt,
    };
  },
  text: (p) => ({
    text: str(p.text, 'Text', { required: true, max: 1000 }),
    fontSize: num(p.fontSize ?? 24, 'Font size', { min: 8, max: 200, int: true }),
    color: color(p.color, 'Colour', '#000000'),
  }),
  decor: (p) => ({ imageUrl: safeUrl(p.imageUrl, 'Image', { required: true }) }),
};

export const OBJECT_TYPES = Object.keys(PROP_SPECS);

/** Full object validation. `ctx.sceneIds` (Set) enables portal destination checks. */
export function validateObject(o, ctx = {}) {
  if (!o || typeof o !== 'object') fail('Object body required');
  const spec = PROP_SPECS[o.type];
  if (!spec) fail(`Unknown object type "${o.type}"`);
  return {
    type: o.type,
    x: num(o.x, 'x'),
    y: num(o.y, 'y'),
    size: num(o.size ?? 100, 'Size', { min: 1, max: 10000 }),
    rotation: num(o.rotation ?? 0, 'Rotation', { min: -360, max: 360 }),
    depth: num(o.depth ?? 0, 'Depth', { min: -1000, max: 1000, int: true }),
    visible: bool(o.visible, true),
    props: spec(o.props || {}, ctx),
  };
}

export function validateScene(s) {
  if (!s || typeof s !== 'object') fail('Scene body required');
  const id = str(s.id, 'Scene id', { required: true, max: 64 });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail('Scene id may only contain lowercase letters, numbers and dashes');
  const mode = s.mode;
  if (mode !== 'topdown' && mode !== 'platformer') fail('Mode must be "topdown" or "platformer"');
  const width = num(s.width, 'Width', { min: 200, max: 20000, int: true });
  const height = num(s.height, 'Height', { min: 200, max: 20000, int: true });
  const spawn = s.spawn || { x: s.spawn_x, y: s.spawn_y };
  const bg = s.background || {};
  const g = s.ground;
  return {
    id,
    name: str(s.name, 'Name', { required: true, max: 100 }),
    mode, width, height,
    spawn: { x: num(spawn.x, 'Spawn x', { min: 0, max: width, int: true }), y: num(spawn.y, 'Spawn y', { min: 0, max: height, int: true }) },
    background: { color: color(bg.color, 'Background colour', '#ffffff'), ...(bg.imageUrl ? { imageUrl: safeUrl(bg.imageUrl, 'Background image') } : {}) },
    ground: mode === 'platformer' && g
      ? { y: num(g.y, 'Ground y', { min: 0, max: height, int: true }), height: num(g.height ?? 40, 'Ground height', { min: 1, max: 1000, int: true }), color: color(g.color, 'Ground colour', '#000000') }
      : null,
    sort: num(s.sort ?? 0, 'Sort', { min: -1000, max: 1000, int: true }),
  };
}
