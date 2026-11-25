import { OBJECT_TYPES } from '../world/objectTypes.js';

const MODE_LABELS = { topdown: 'Top-down (walk in all directions)', platformer: 'Side-scroller (walk + jump)' };
export const modeLabel = (mode) => MODE_LABELS[mode] || mode;

/** Friendly display name for an object (layers list, inspector title). */
export function objectName(obj) {
  const p = obj.props || {};
  const title = (p.title || '').split('\n').map((s) => s.trim()).filter(Boolean).pop();
  return title || p.label || p.text || OBJECT_TYPES[obj.type]?.label || obj.type;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  node.append(...children.filter(Boolean));
  return node;
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Build one input for a field spec from objectTypes.fields. */
function fieldInput(field, value, { readOnly, scenes }) {
  const common = { id: `f-${field.key}`, name: field.key, disabled: readOnly };
  switch (field.input) {
    case 'textarea':
      return el('textarea', { ...common, rows: field.rows || 3 }, value ?? '');
    case 'checkbox': {
      const input = el('input', { ...common, type: 'checkbox' });
      input.checked = Boolean(value);
      return input;
    }
    case 'number':
      return el('input', { ...common, type: 'number', min: field.min, max: field.max, value: value ?? '' });
    case 'color':
      return el('input', { ...common, type: 'color', value: value || '#000000' });
    case 'datetime':
      return el('input', { ...common, type: 'datetime-local', value: toLocalInput(value) });
    case 'scene': {
      const select = el('select', common);
      for (const s of scenes) select.append(el('option', { value: s.id, selected: s.id === value, text: s.name }));
      return select;
    }
    case 'url':
      return el('input', { ...common, type: 'url', value: value ?? '', placeholder: 'https://' });
    case 'image': {
      const wrap = el('div', { class: 'image-field' });
      if (value) wrap.append(el('img', { class: 'thumb', src: value, alt: '' }));
      wrap.append(el('input', { ...common, type: 'text', value: value ?? '' }));
      return wrap;
    }
    default:
      return el('input', { ...common, type: 'text', value: value ?? '' });
  }
}

function labelled(text, input, { check = false } = {}) {
  return check
    ? el('label', { class: 'field check' }, input, el('span', { text }))
    : el('label', { class: 'field' }, el('span', { text }), input);
}

/**
 * Render the inspector for an object into `container`.
 * Phase 3: read-only. Phase 4 wires `onChange`.
 */
export function renderInspector(container, obj, { scenes, readOnly = true } = {}) {
  container.replaceChildren();
  if (!obj) {
    container.append(el('p', { class: 'muted', text: 'Select an object on the map or in the list.' }));
    return;
  }
  const type = OBJECT_TYPES[obj.type] || { label: obj.type, icon: '❔', fields: [] };
  const opts = { readOnly, scenes };

  container.append(el('div', { class: 'type-badge pill', text: `${type.icon} ${type.label}` }));

  const num = (key, label, value) => labelled(label, el('input', { type: 'number', name: key, value: Math.round(value), disabled: readOnly }));
  container.append(
    el('div', { class: 'row2' }, num('x', 'X', obj.x), num('y', 'Y', obj.y)),
    el('div', { class: 'row2' }, num('size', 'Size (px)', obj.size), num('depth', 'Layer', obj.depth)),
  );
  const visible = el('input', { type: 'checkbox', name: 'visible', disabled: readOnly });
  visible.checked = obj.visible !== false;
  container.append(labelled('Visible to players', visible, { check: true }));

  for (const field of type.fields) {
    const input = fieldInput(field, obj.props?.[field.key], opts);
    container.append(labelled(field.label, input, { check: field.input === 'checkbox' }));
  }
  if (readOnly) container.append(el('p', { class: 'muted', text: 'Read-only preview. Editing arrives in the next update.' }));
}
