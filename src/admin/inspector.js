import { OBJECT_TYPES } from '../world/objectTypes.js';

const MODE_LABELS = { topdown: 'Top-down (walk in all directions)', platformer: 'Side-scroller (walk + jump)' };
export const modeLabel = (mode) => MODE_LABELS[mode] || mode;

/** Friendly display name for an object (layers list, inspector title). */
export function objectName(obj) {
  const p = obj.props || {};
  const title = (p.title || '').split('\n').map((s) => s.trim()).filter(Boolean).pop();
  return title || p.label || p.text || OBJECT_TYPES[obj.type]?.label || obj.type;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

/** Turn a path + value into a store patch: 'props.title' -> { props: { title } } */
function patchFor(path, value) {
  const [head, key] = path.split('.');
  return key ? { [head]: { [key]: value } } : { [head]: value };
}

/** How each input kind reads/writes values and which DOM event commits. */
const KINDS = {
  text: { event: 'input', read: (i) => i.value, write: (i, v) => { i.value = v ?? ''; } },
  textarea: { event: 'input', read: (i) => i.value, write: (i, v) => { i.value = v ?? ''; } },
  url: { event: 'input', read: (i) => i.value.trim(), write: (i, v) => { i.value = v ?? ''; } },
  image: { event: 'change', read: (i) => i.value.trim(), write: (i, v) => { i.value = v ?? ''; } },
  number: {
    event: 'input',
    read: (i) => (i.value === '' || Number.isNaN(Number(i.value)) ? undefined : Number(i.value)),
    write: (i, v) => { i.value = v == null ? '' : Math.round(v * 100) / 100; },
  },
  checkbox: { event: 'change', read: (i) => i.checked, write: (i, v) => { i.checked = Boolean(v); } },
  color: { event: 'input', read: (i) => i.value, write: (i, v) => { i.value = v || '#000000'; } },
  datetime: { event: 'change', read: (i) => fromLocalInput(i.value), write: (i, v) => { i.value = toLocalInput(v); } },
  scene: { event: 'change', read: (i) => i.value, write: (i, v) => { i.value = v ?? ''; } },
  select: { event: 'change', read: (i) => i.value, write: (i, v) => { i.value = v ?? ''; } },
};

function makeInput(field, { scenes }) {
  const attrs = { id: `f-${field.path.replace('.', '-')}`, 'data-path': field.path, 'data-kind': field.input };
  switch (field.input) {
    case 'textarea': return el('textarea', { ...attrs, rows: field.rows || 3 });
    case 'checkbox': return el('input', { ...attrs, type: 'checkbox' });
    case 'number': return el('input', { ...attrs, type: 'number', min: field.min, max: field.max, step: field.step || 1 });
    case 'color': return el('input', { ...attrs, type: 'color' });
    case 'datetime': return el('input', { ...attrs, type: 'datetime-local' });
    case 'url': return el('input', { ...attrs, type: 'url', placeholder: 'https://…', inputmode: 'url' });
    case 'image': return el('input', { ...attrs, type: 'text', placeholder: 'Image URL' });
    case 'scene': {
      const select = el('select', attrs);
      for (const s of scenes) select.append(new Option(s.name, s.id));
      return select;
    }
    case 'select': {
      const select = el('select', attrs);
      for (const [value, label] of field.options) select.append(new Option(label, value));
      return select;
    }
    default: return el('input', { ...attrs, type: 'text' });
  }
}

/**
 * Build an auto-saving form for `target` from a list of field specs ({ path, label, input, ... }).
 * onChange(patch, coalesceKey) is called as the user edits. Returns the form element.
 */
const isHttpUrl = (v) => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };

/** Client-side check so half-typed values aren't sent (the server validates again). Returns an error or ''. */
function checkValue(field, value) {
  if (field.required && (value === '' || value == null)) return 'Required';
  if (field.input === 'url' && value && !isHttpUrl(value)) return 'Enter a full link starting with https://';
  if (field.input === 'number' && field.min != null && value < field.min) return `Minimum ${field.min}`;
  if (field.input === 'number' && field.max != null && value > field.max) return `Maximum ${field.max}`;
  return '';
}

export function buildForm(target, fields, { scenes = [], onChange, onImagePick, commitOn } = {}) {
  const form = el('div', { class: 'form' });
  let row = null;
  for (const field of fields) {
    const input = makeInput(field, { scenes });
    const kind = KINDS[field.input] || KINDS.text;
    kind.write(input, getPath(target, field.path));
    input.addEventListener(commitOn || kind.event, () => {
      const value = kind.read(input);
      if (value === undefined) return;
      const problem = checkValue(field, value);
      hint.textContent = problem;
      input.setAttribute('aria-invalid', String(Boolean(problem)));
      if (problem) return;
      onChange?.(patchFor(field.path, value), field.path);
      if (field.input === 'image') preview?.setAttribute('src', value);
    });

    const hint = el('small', { class: 'field-hint' });
    let preview = null;
    let control = input;
    if (field.input === 'image') {
      preview = el('img', { class: 'thumb', src: getPath(target, field.path) || '', alt: '' });
      const pick = onImagePick && el('button', { type: 'button', class: 'btn', text: 'Choose image…', onclick: () => onImagePick(field.path, (url) => {
        input.value = url;
        input.dispatchEvent(new Event('change'));
      }) });
      control = el('div', { class: 'image-field' }, preview, el('div', { class: 'image-row' }, input, pick));
    }

    const isCheck = field.input === 'checkbox';
    const label = isCheck
      ? el('label', { class: 'field check' }, control, el('span', { text: field.label }))
      : el('label', { class: 'field' }, el('span', { text: field.label }), control, hint);
    if (field.half) {
      if (!row) { row = el('div', { class: 'row2' }); form.append(row); }
      row.append(label);
      if (row.children.length === 2) row = null;
    } else {
      row = null;
      form.append(label);
    }
  }
  return form;
}

/** Update input values from data without rebuilding (skips the focused input). */
export function syncForm(container, target) {
  for (const input of container.querySelectorAll('[data-path]')) {
    if (input === document.activeElement) continue;
    const kind = KINDS[input.dataset.kind] || KINDS.text;
    kind.write(input, getPath(target, input.dataset.path));
    if (input.dataset.kind === 'image') input.closest('.image-field')?.querySelector('.thumb')?.setAttribute('src', input.value);
  }
}

const COMMON_FIELDS = [
  { path: 'x', label: 'X', input: 'number', half: true },
  { path: 'y', label: 'Y', input: 'number', half: true },
  { path: 'size', label: 'Size (px)', input: 'number', min: 1, half: true },
  { path: 'depth', label: 'Layer', input: 'number', half: true },
  { path: 'visible', label: 'Visible to players', input: 'checkbox' },
];

/** Inspector for one object. */
export function renderInspector(container, obj, { scenes, onChange, onDelete, onDuplicate, onImagePick } = {}) {
  container.replaceChildren();
  if (!obj) {
    container.append(el('p', { class: 'muted', text: 'Select an object on the map or in the list — or add a new one from the left panel.' }));
    return;
  }
  const type = OBJECT_TYPES[obj.type] || { label: obj.type, icon: '❔', fields: [] };
  const fields = [
    ...COMMON_FIELDS.filter((f) => !(obj.type === 'text' && f.path === 'size')),
    ...type.fields.map((f) => ({ ...f, path: `props.${f.key}` })),
  ];
  container.append(
    el('div', { class: 'inspector-head' },
      el('span', { class: 'pill', text: `${type.icon} ${type.label}` }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn', title: 'Duplicate (Ctrl+D)', text: 'Duplicate', onclick: onDuplicate }),
      el('button', { type: 'button', class: 'btn danger', title: 'Delete (Del)', text: 'Delete', onclick: onDelete })),
    buildForm(obj, fields, { scenes, onChange, onImagePick }),
  );
}
