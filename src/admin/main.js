import Phaser from 'phaser';
import { api } from './api.js';
import { createStore } from './store.js';
import { EditorScene } from './EditorScene.js';
import { OBJECT_TYPES } from '../world/objectTypes.js';
import { renderInspector, syncForm, buildForm, objectName, modeLabel, el } from './inspector.js';
import { createMediaPicker } from './media.js';

const $ = (id) => document.getElementById(id);
const PREF = { scene: 'mw-editor-scene', snap: 'mw-editor-snap' };
const SNAP_PX = 10;
const pref = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};

const store = createStore();
const ui = { sceneId: null, selectedId: null, game: null, published: null, dirty: false };

const currentScene = () => store.getScene(ui.sceneId);
const selectedObject = () => currentScene()?.objects.find((o) => o.id === ui.selectedId) || null;
const editorScene = () => ui.game?.scene.getScene('Editor');

// ---------- Toasts ----------
function toast(message, { type = 'info', timeout = 4000 } = {}) {
  const node = el('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
    el('span', { text: message }),
    el('button', { type: 'button', 'aria-label': 'Dismiss', text: '×', onclick: () => node.remove() }));
  $('toasts').append(node);
  if (timeout) setTimeout(() => node.remove(), timeout);
}

// ---------- Media picker ----------
const media = createMediaPicker({ toast });
const worldImages = () => {
  const urls = new Set();
  for (const s of store.world.scenes) {
    if (s.background?.imageUrl) urls.add(s.background.imageUrl);
    for (const o of s.objects) if (o.props?.imageUrl) urls.add(o.props.imageUrl);
  }
  return [...urls].filter((u) => !/^https?:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(u)); // uploads are listed separately
};
const pickImage = (current) => async (path, set) => {
  const url = await media.open({ current: current(path), worldImages: worldImages() });
  if (url) set(url);
};

// ---------- Login ----------
function showLogin(message = '') {
  $('editor-view').hidden = true;
  $('login-view').hidden = false;
  $('login-error').textContent = message;
  $('password').focus();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || e.target.querySelector('button');
  button.disabled = true;
  $('login-error').textContent = '';
  try {
    await api.login($('password').value);
    $('password').value = '';
    await openEditor();
  } catch (err) {
    $('login-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  await store.flush();
  await api.logout().catch(() => {});
  ui.game?.destroy(true);
  ui.game = null;
  showLogin();
});

// ---------- Store wiring ----------
store.on('status', ({ state, message }) => {
  const node = $('save-status');
  node.className = `save-status ${state}`;
  node.textContent = state === 'saving' ? 'Saving…' : state === 'error' ? `⚠ Not saved` : 'All changes saved';
  node.title = message || '';
});
store.on('error', (message) => toast(message, { type: 'error', timeout: 8000 }));
store.on('dirty', (dirty) => { ui.dirty = dirty; renderStatus(); });
store.on('history', ({ canUndo, canRedo }) => {
  $('undo').disabled = !canUndo;
  $('redo').disabled = !canRedo;
});
store.on('object:update', (obj) => {
  if (obj.id === ui.selectedId) {
    syncForm($('inspector'), obj);
    $('inspector-title').textContent = objectName(obj);
  }
  updateLayerRow(obj);
});
store.on('object:create', () => renderLayers());
store.on('object:delete', (id) => {
  if (id === ui.selectedId) selectObject(null);
  renderLayers();
});
store.on('scenes:change', () => renderSceneSelect());
store.on('scene:update', (scene) => {
  if (scene.id !== ui.sceneId) return;
  syncForm($('scene-form'), scene);
  renderSceneSelect();
});

window.addEventListener('beforeunload', (e) => {
  if (store.isSaving) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Editor ----------
async function openEditor() {
  const { world, published, hasUnpublishedChanges } = await api.draft();
  store.load(world);
  ui.published = published;
  ui.dirty = hasUnpublishedChanges;

  const saved = pref.get(PREF.scene);
  ui.sceneId = world.scenes.some((s) => s.id === saved) ? saved : world.startScene || world.scenes[0]?.id;
  $('snap').checked = pref.get(PREF.snap) !== 'off';

  $('login-view').hidden = true;
  $('editor-view').hidden = false;

  renderPalette();
  renderSceneSelect();
  renderStatus();
  startGame();
  showScene(ui.sceneId);
}

function renderStatus() {
  const pill = $('status');
  if (!ui.published) {
    pill.textContent = 'Not published yet';
    pill.className = 'pill warn';
  } else if (ui.dirty) {
    pill.textContent = `Unpublished changes · live v${ui.published.version}`;
    pill.className = 'pill warn';
  } else {
    pill.textContent = `Live: version ${ui.published.version}`;
    pill.className = 'pill ok';
  }
  pill.title = ui.published
    ? `Version ${ui.published.version} published ${new Date(ui.published.publishedAt).toLocaleString()}. Click to open the live site.`
    : 'Open the site';
  $('publish-btn').disabled = !ui.dirty && Boolean(ui.published);
  $('publish-btn').title = $('publish-btn').disabled ? 'Nothing new to publish' : 'Make your changes live for everyone';
}

// ---------- Publish / preview / history ----------
$('preview-btn').addEventListener('click', async () => {
  const tab = window.open('about:blank', '_blank'); // open synchronously so popup blockers allow it
  await store.flush();
  if (tab) tab.location.href = '/?draft=1';
});

$('publish-btn').addEventListener('click', async () => {
  await store.flush();
  if (store.isSaving || $('save-status').classList.contains('error')) {
    toast('Some changes could not be saved yet. Fix the highlighted problem before publishing.', { type: 'error', timeout: 8000 });
    return;
  }
  const scenes = store.world.scenes;
  const objects = scenes.reduce((n, s) => n + s.objects.length, 0);
  $('publish-summary').textContent = `${scenes.length} scenes and ${objects} objects will go live${ui.published ? `, replacing version ${ui.published.version}` : ''}.`;
  $('publish-error').textContent = '';
  $('publish-form').reset();
  $('publish-dialog').showModal();
});

$('publish-form').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'publish') return;
  e.preventDefault();
  $('publish-confirm').disabled = true;
  try {
    const { published } = await api.publish(new FormData(e.target).get('note') || null);
    ui.published = published;
    ui.dirty = false;
    renderStatus();
    $('publish-dialog').close();
    toast(`🎉 Version ${published.version} is live. Visitors see it within about a minute.`, { timeout: 6000 });
  } catch (err) {
    $('publish-error').textContent = err.message;
  } finally {
    $('publish-confirm').disabled = false;
  }
});

$('versions-btn').addEventListener('click', async () => {
  const list = $('versions-list');
  list.replaceChildren(el('li', { class: 'muted', text: 'Loading…' }));
  $('versions-dialog').showModal();
  try {
    const { versions } = await api.versions();
    list.replaceChildren(...versions.map((v) => el('li', {},
      el('div', { class: 'v-main' },
        el('div', { class: 'v-title', text: `Version ${v.version}${v.version === ui.published?.version ? ' · live now' : ''}` }),
        el('div', { class: 'v-note', text: `${new Date(v.publishedAt).toLocaleString()} · ${v.scenes} scenes, ${v.objects} objects${v.note ? ` · ${v.note}` : ''}` })),
      el('button', { type: 'button', class: 'btn', text: 'Restore', onclick: () => restoreVersion(v.version) }))));
    if (!versions.length) list.replaceChildren(el('li', { class: 'muted', text: 'Nothing published yet.' }));
  } catch (err) {
    list.replaceChildren(el('li', { class: 'error', text: err.message }));
  }
});

async function restoreVersion(version) {
  if (!confirm(`Replace your current draft with version ${version}?\n\nAny unpublished changes will be lost. The live site doesn't change until you press Publish.`)) return;
  try {
    await store.flush();
    await api.restore(version);
    const { world, published, hasUnpublishedChanges } = await api.draft();
    store.load(world);
    ui.published = published;
    ui.dirty = hasUnpublishedChanges;
    $('versions-dialog').close();
    renderStatus();
    renderSceneSelect();
    showScene(store.getScene(ui.sceneId) ? ui.sceneId : world.startScene);
    toast(`Version ${version} restored to your draft. Check it, then press Publish to make it live.`, { timeout: 7000 });
  } catch (err) {
    toast(err.message, { type: 'error', timeout: 8000 });
  }
}

function renderSceneSelect() {
  const select = $('scene-select');
  select.replaceChildren(...store.world.scenes.map((s) => new Option(`${s.name} (${s.objects.length})`, s.id)));
  select.value = ui.sceneId;
}
$('scene-select').addEventListener('change', (e) => showScene(e.target.value));

function startGame() {
  if (ui.game) return;
  ui.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'editor-canvas',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    loader: { baseURL: import.meta.env.BASE_URL },
    banner: false,
    scene: [],
  });
  if (import.meta.env.DEV) window.__editor = { store, ui, game: ui.game };
}

function showScene(sceneId) {
  ui.sceneId = sceneId;
  ui.selectedId = null;
  pref.set(PREF.scene, sceneId);
  $('scene-select').value = sceneId;

  const data = {
    sceneId,
    store,
    onSelect: (id) => selectObject(id, { fromCanvas: true }),
    onZoom: (z) => { $('zoom-label').textContent = `${Math.round(z * 100)}%`; },
    getSnap: () => ($('snap').checked ? SNAP_PX : 0),
  };
  const existing = editorScene();
  if (existing) existing.scene.restart(data);
  else ui.game.scene.add('Editor', EditorScene, true, data);

  renderSceneForm();
  renderLayers();
  renderInspectorPanel();
}

// ---------- Palette (add objects) ----------
function renderPalette() {
  $('palette').replaceChildren(...Object.entries(OBJECT_TYPES).map(([type, def]) =>
    el('button', {
      type: 'button', draggable: 'true', title: `Add ${def.label.toLowerCase()}`,
      onclick: () => addObject(type),
      ondragstart: (e) => { e.dataTransfer.setData('application/x-mw-type', type); e.dataTransfer.effectAllowed = 'copy'; },
    }, el('span', { class: 'icon', text: def.icon }), el('span', { text: def.label }))));
}

function addObject(type, at) {
  const def = OBJECT_TYPES[type];
  const scene = currentScene();
  const pos = at || editorScene()?.viewCenter() || { x: scene.width / 2, y: scene.height / 2 };
  const snap = $('snap').checked ? SNAP_PX : 1;
  const props = structuredClone(def.defaults.props);
  if (type === 'portal') props.targetScene = store.world.scenes.find((s) => s.id !== scene.id)?.id || scene.id;
  const maxDepth = Math.max(0, ...scene.objects.map((o) => o.depth));
  const obj = store.createObject(scene.id, {
    type,
    x: Math.min(scene.width, Math.max(0, Math.round(pos.x / snap) * snap)),
    y: Math.min(scene.height, Math.max(0, Math.round(pos.y / snap) * snap)),
    size: def.defaults.size,
    depth: type === 'decor' ? def.defaults.depth : Math.max(def.defaults.depth, maxDepth),
    props,
  });
  // Wait a tick so the canvas has created the view, then select it
  setTimeout(() => selectObject(obj.id), 50);
  toast(`${def.icon} ${def.label} added. Edit it in the inspector on the right.`, { timeout: 2500 });
}

const wrap = $('canvas-wrap');
wrap.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('application/x-mw-type')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  wrap.classList.add('drop-target');
});
wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-target'));
wrap.addEventListener('drop', (e) => {
  wrap.classList.remove('drop-target');
  const type = e.dataTransfer.getData('application/x-mw-type');
  if (!type) return;
  e.preventDefault();
  const p = editorScene()?.clientToWorld(e.clientX, e.clientY);
  if (p) addObject(type, p);
});

// ---------- Layers list ----------
function layerButton(obj) {
  const type = OBJECT_TYPES[obj.type];
  return el('button', {
    type: 'button', 'data-id': obj.id, 'aria-selected': String(obj.id === ui.selectedId), title: objectName(obj),
    onclick: () => selectObject(obj.id, { focus: true }),
  },
  el('span', { class: 'icon', text: type?.icon || '❔' }),
  el('span', { class: 'name', text: objectName(obj) }),
  el('span', { class: 'tag', text: obj.visible === false ? 'Hidden' : type?.label || obj.type }));
}

function renderLayers() {
  const s = currentScene();
  if (!s) return;
  $('object-count').textContent = `(${s.objects.length})`;
  const ordered = [...s.objects].sort((a, b) => b.depth - a.depth);
  $('layers').replaceChildren(...ordered.map((obj) =>
    el('li', { class: obj.visible === false ? 'hidden-obj' : null }, layerButton(obj))));
  if (!ordered.length) $('layers').append(el('li', { class: 'muted', text: 'No objects yet. Add one above.' }));
}

function updateLayerRow(obj) {
  const btn = $('layers').querySelector(`[data-id="${obj.id}"]`);
  if (!btn) return;
  const prevDepthOrder = btn.closest('li');
  const fresh = layerButton(obj);
  btn.replaceWith(fresh);
  prevDepthOrder.className = obj.visible === false ? 'hidden-obj' : '';
  // Re-sort if layer order changed
  const ids = [...$('layers').querySelectorAll('[data-id]')].map((b) => b.dataset.id);
  const sorted = [...currentScene().objects].sort((a, b) => b.depth - a.depth).map((o) => o.id);
  if (ids.join() !== sorted.join()) renderLayers();
}

// ---------- Selection + inspector ----------
function selectObject(id, { fromCanvas = false, focus = false } = {}) {
  ui.selectedId = id;
  if (!fromCanvas) editorScene()?.select(id, { focus });
  for (const btn of $('layers').querySelectorAll('button[data-id]')) {
    const selected = btn.dataset.id === id;
    btn.setAttribute('aria-selected', String(selected));
    if (selected && fromCanvas) btn.scrollIntoView({ block: 'nearest' });
  }
  renderInspectorPanel();
}

function renderInspectorPanel() {
  const obj = selectedObject();
  $('inspector-title').textContent = obj ? objectName(obj) : 'Inspector';
  renderInspector($('inspector'), obj, {
    scenes: store.world.scenes,
    onChange: (patch, key) => store.updateObject(obj.id, patch, { coalesceKey: key }),
    onDelete: () => deleteSelected(),
    onDuplicate: () => duplicateSelected(),
    onImagePick: obj && pickImage((path) => path.split('.').reduce((o, k) => o?.[k], selectedObject())),
  });
}

function deleteSelected() {
  const obj = selectedObject();
  if (!obj) return;
  store.deleteObject(obj.id);
  toast(`Deleted “${objectName(obj)}”. Press Ctrl+Z to undo.`);
}

function duplicateSelected() {
  const obj = selectedObject();
  if (!obj) return;
  const copy = store.createObject(ui.sceneId, { ...structuredClone(obj), id: undefined, x: obj.x + 30, y: obj.y + 30 });
  setTimeout(() => selectObject(copy.id), 50);
}

// ---------- Scene settings ----------
const SCENE_FIELDS = [
  { path: 'name', label: 'Name', input: 'text' },
  { path: 'mode', label: 'Type', input: 'select', options: [['platformer', modeLabel('platformer')], ['topdown', modeLabel('topdown')]] },
  { path: 'width', label: 'Width (px)', input: 'number', min: 200, max: 20000, half: true },
  { path: 'height', label: 'Height (px)', input: 'number', min: 200, max: 20000, half: true },
  { path: 'spawn.x', label: 'Player start X', input: 'number', half: true },
  { path: 'spawn.y', label: 'Player start Y', input: 'number', half: true },
  { path: 'background.color', label: 'Background colour', input: 'color' },
  { path: 'background.imageUrl', label: 'Background image (optional, stretched to fit)', input: 'image' },
];
const GROUND_FIELDS = [
  { path: 'ground.y', label: 'Ground height (Y)', input: 'number', half: true },
  { path: 'ground.color', label: 'Ground colour', input: 'color', half: true },
];

function renderSceneForm() {
  const scene = currentScene();
  const fields = scene.mode === 'platformer' && scene.ground ? [...SCENE_FIELDS, ...GROUND_FIELDS] : SCENE_FIELDS;
  const form = buildForm(scene, fields, {
    commitOn: 'change', // scene changes save when a field is left, not on every keystroke
    onImagePick: pickImage((path) => path.split('.').reduce((o, k) => o?.[k], currentScene())),
    onChange: (patch, key) => {
      // Nested objects (spawn, background, ground) are sent whole so partial merges stay valid
      for (const k of ['spawn', 'background', 'ground']) if (patch[k]) patch[k] = { ...scene[k], ...patch[k] };
      if (patch.mode === 'platformer' && !scene.ground) patch.ground = { y: Math.round(scene.height * 0.64), height: 40, color: '#000000' };
      if (patch.mode === 'topdown') patch.ground = null;
      store.updateScene(scene.id, patch, { coalesceKey: key });
      if ('mode' in patch) renderSceneForm();
    },
  });
  $('scene-form').replaceChildren(form);
  $('delete-scene').hidden = scene.id === (store.world.startScene || 'hub');
}

$('delete-scene').addEventListener('click', async () => {
  const scene = currentScene();
  if (!confirm(`Delete “${scene.name}” and its ${scene.objects.length} object(s)? This can't be undone.`)) return;
  try {
    await store.flush();
    await store.deleteScene(scene.id);
    toast(`Deleted scene “${scene.name}”.`);
    showScene(store.world.startScene || store.world.scenes[0].id);
  } catch (err) {
    toast(err.message, { type: 'error', timeout: 8000 });
  }
});

// ---------- New scene ----------
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'scene';

$('new-scene').addEventListener('click', () => {
  $('new-scene-error').textContent = '';
  $('new-scene-form').reset();
  $('new-scene-dialog').showModal();
});

$('new-scene-form').addEventListener('submit', async (e) => {
  if (e.submitter?.value !== 'create') return; // Cancel closes the dialog
  e.preventDefault();
  const f = new FormData(e.target);
  const mode = f.get('mode');
  const width = Number(f.get('width'));
  const height = Number(f.get('height'));
  let id = slugify(f.get('name'));
  while (store.getScene(id)) id = `${id}-2`;
  const groundY = Math.round(height * 0.64);
  $('new-scene-create').disabled = true;
  try {
    await store.createScene({
      id, name: f.get('name').trim(), mode, width, height,
      spawn: mode === 'platformer' ? { x: 170, y: groundY - 42 } : { x: Math.round(width / 2), y: Math.round(height / 2) },
      background: { color: '#ffffff' },
      ground: mode === 'platformer' ? { y: groundY, height: 40, color: '#000000' } : null,
    });
    $('new-scene-dialog').close();
    showScene(id);
    if (f.get('returnPortal')) {
      const portalY = mode === 'platformer' ? groundY - 80 : Math.round(height / 2);
      store.createObject(id, {
        type: 'portal', x: 75, y: portalY, size: 100, depth: 0,
        props: { ...structuredClone(OBJECT_TYPES.portal.defaults.props), targetScene: 'hub', label: "Return to Moki's Hub", labelSize: 16, labelOffset: -50 },
      });
    }
    toast(`Scene created. Add a Portal in another scene that leads to “${f.get('name').trim()}” so players can reach it.`, { timeout: 7000 });
  } catch (err) {
    $('new-scene-error').textContent = err.message;
  } finally {
    $('new-scene-create').disabled = false;
  }
});

// ---------- Toolbar + keyboard ----------
$('undo').addEventListener('click', () => store.undo());
$('redo').addEventListener('click', () => store.redo());
$('zoom-in').addEventListener('click', () => editorScene()?.zoomBy(1.25));
$('zoom-out').addEventListener('click', () => editorScene()?.zoomBy(0.8));
$('zoom-fit').addEventListener('click', () => editorScene()?.fit());
$('snap').addEventListener('change', (e) => pref.set(PREF.snap, e.target.checked ? 'on' : 'off'));

document.addEventListener('keydown', (e) => {
  if ($('editor-view').hidden || document.querySelector('dialog[open]')) return;
  const typing = e.target.closest('input, textarea, select, [contenteditable]');
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z' && !typing) { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
  if (mod && key === 'y' && !typing) { e.preventDefault(); store.redo(); return; }
  if (typing) return;
  if (mod && key === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelected(); return; }
  if (key === 'f') { editorScene()?.fit(); return; }
  if (key === 'escape') { selectObject(null); return; }
  const nudge = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
  const obj = selectedObject();
  if (nudge && obj) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    store.updateObject(obj.id, { x: obj.x + nudge[0] * step, y: obj.y + nudge[1] * step }, { coalesceKey: 'nudge' });
  }
});

// ---------- Boot ----------
(async function boot() {
  try {
    await api.me();
    await openEditor();
  } catch (err) {
    showLogin(err.status === 401 ? '' : err.message);
  }
})();
