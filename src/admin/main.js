import Phaser from 'phaser';
import { api } from './api.js';
import { EditorScene } from './EditorScene.js';
import { OBJECT_TYPES } from '../world/objectTypes.js';
import { renderInspector, objectName, modeLabel } from './inspector.js';

const $ = (id) => document.getElementById(id);
const LAST_SCENE_KEY = 'mw-editor-scene';

const state = {
  world: null,
  published: null,
  sceneId: null,
  selectedId: null,
  game: null,
};

const currentScene = () => state.world.scenes.find((s) => s.id === state.sceneId);
const editorScene = () => state.game?.scene.getScene('Editor');

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
  await api.logout().catch(() => {});
  state.game?.destroy(true);
  state.game = null;
  showLogin();
});

// ---------- Editor ----------
async function openEditor() {
  const { world, published } = await api.draft();
  state.world = world;
  state.published = published;

  let saved = null;
  try { saved = localStorage.getItem(LAST_SCENE_KEY); } catch { /* storage unavailable */ }
  state.sceneId = world.scenes.some((s) => s.id === saved) ? saved : world.startScene || world.scenes[0]?.id;

  $('login-view').hidden = true;
  $('editor-view').hidden = false;

  renderSceneSelect();
  renderStatus();
  startGame();
  showScene(state.sceneId);
}

function renderSceneSelect() {
  const select = $('scene-select');
  select.replaceChildren(...state.world.scenes.map((s) => new Option(`${s.name} (${s.objects.length})`, s.id)));
  select.value = state.sceneId;
}

$('scene-select').addEventListener('change', (e) => showScene(e.target.value));

function renderStatus() {
  const pill = $('status');
  if (state.published) {
    pill.textContent = `Live: version ${state.published.version}`;
    pill.className = 'pill ok';
    pill.title = `Published ${new Date(state.published.publishedAt).toLocaleString()}${state.published.note ? ` · ${state.published.note}` : ''}`;
  } else {
    pill.textContent = 'Not published yet';
    pill.className = 'pill warn';
  }
}

function startGame() {
  if (state.game) return;
  state.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'editor-canvas',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    loader: { baseURL: import.meta.env.BASE_URL },
    banner: false,
    scene: [],
  });
  if (import.meta.env.DEV) window.__editor = { state, game: state.game };
}

function showScene(sceneId) {
  state.sceneId = sceneId;
  state.selectedId = null;
  try { localStorage.setItem(LAST_SCENE_KEY, sceneId); } catch { /* ignore */ }
  $('scene-select').value = sceneId;

  const data = {
    scene: currentScene(),
    onSelect: (id) => selectObject(id, { fromCanvas: true }),
    onZoom: (z) => { $('zoom-label').textContent = `${Math.round(z * 100)}%`; },
  };
  const existing = editorScene();
  if (existing) existing.scene.restart(data);
  else state.game.scene.add('Editor', EditorScene, true, data);

  renderSceneInfo();
  renderLayers();
  renderInspectorPanel();
}

function renderSceneInfo() {
  const s = currentScene();
  const rows = [
    ['Name', s.name],
    ['Type', modeLabel(s.mode)],
    ['Size', `${s.width} × ${s.height}px`],
    ['Player start', `${s.spawn.x}, ${s.spawn.y}`],
  ];
  $('scene-info').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
}

function renderLayers() {
  const s = currentScene();
  $('object-count').textContent = `(${s.objects.length})`;
  // Top-most first, like design tools
  const ordered = [...s.objects].sort((a, b) => b.depth - a.depth);
  $('layers').replaceChildren(...ordered.map((obj) => {
    const type = OBJECT_TYPES[obj.type];
    const li = document.createElement('li');
    if (obj.visible === false) li.className = 'hidden-obj';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = obj.id;
    btn.setAttribute('aria-selected', String(obj.id === state.selectedId));
    btn.innerHTML = '<span class="icon"></span><span class="name"></span><span class="tag"></span>';
    btn.querySelector('.icon').textContent = type?.icon || '❔';
    btn.querySelector('.name').textContent = objectName(obj);
    btn.querySelector('.tag').textContent = type?.label || obj.type;
    btn.title = objectName(obj);
    btn.addEventListener('click', () => selectObject(obj.id, { focus: true }));
    li.append(btn);
    return li;
  }));
}

function selectObject(id, { fromCanvas = false, focus = false } = {}) {
  state.selectedId = id;
  if (!fromCanvas) editorScene()?.select(id, { focus });
  for (const btn of $('layers').querySelectorAll('button')) {
    const selected = btn.dataset.id === id;
    btn.setAttribute('aria-selected', String(selected));
    if (selected && fromCanvas) btn.scrollIntoView({ block: 'nearest' });
  }
  renderInspectorPanel();
}

function renderInspectorPanel() {
  const obj = currentScene()?.objects.find((o) => o.id === state.selectedId);
  $('inspector-title').textContent = obj ? objectName(obj) : 'Inspector';
  renderInspector($('inspector'), obj, { scenes: state.world.scenes, readOnly: true });
}

// ---------- Zoom + keyboard ----------
$('zoom-in').addEventListener('click', () => editorScene()?.zoomBy(1.25));
$('zoom-out').addEventListener('click', () => editorScene()?.zoomBy(0.8));
$('zoom-fit').addEventListener('click', () => editorScene()?.fit());

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || $('editor-view').hidden) return;
  if (e.key === 'f' || e.key === 'F') editorScene()?.fit();
  if (e.key === 'Escape') selectObject(null);
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
