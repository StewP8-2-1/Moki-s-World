import Phaser from 'phaser';
import { createObjectView, destroyView, layout } from '../world/objectTypes.js';
import { textureKey } from '../world/loadWorld.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const GRID = 50;
const ACCENT = 0x5b5bd6;
const HANDLE_PX = 12;

const hex = (s, fallback = 0xffffff) => {
  try { return Phaser.Display.Color.HexStringToColor(s).color; } catch { return fallback; }
};
const viewKey = (obj) => `${obj.type}|${obj.props?.imageUrl ?? ''}|${obj.props?.label ? 1 : 0}`;

/**
 * Editor canvas: renders one scene of the draft with the SAME object registry as the game,
 * plus editor overlays (bounds, grid, ground, player start, selection + resize handle).
 * Edits go through the store (store.updateObject / updateScene); the scene listens to store
 * events so undo/redo and inspector edits show up here too.
 *
 * init data: { sceneId, store, onSelect(id|null), onZoom(zoom), getSnap() -> px (0 = off) }
 */
export class EditorScene extends Phaser.Scene {
  constructor() {
    super('Editor');
  }

  init(data) {
    this.sceneId = data.sceneId;
    this.store = data.store;
    this.onSelect = data.onSelect || (() => {});
    this.onZoom = data.onZoom || (() => {});
    this.getSnap = data.getSnap || (() => 0);
    this.views = new Map(); // id -> { view, key }
    this.statics = [];
    this.selectedId = null;
  }

  get sceneData() {
    return this.store.getScene(this.sceneId);
  }

  preload() {
    const sheet = { frameWidth: 512, frameHeight: 512 };
    if (!this.textures.exists('playerFront')) this.load.spritesheet('playerFront', 'Moki TYB Front.png', sheet);
    if (!this.textures.exists('player-side')) this.load.spritesheet('player-side', 'Moki (side).png', sheet);
    this.load.setCORS('anonymous');
    const s = this.sceneData;
    const urls = new Set(s.objects.map((o) => o.props?.imageUrl).filter(Boolean));
    if (s.background?.imageUrl) urls.add(s.background.imageUrl);
    for (const url of urls) if (!this.textures.exists(textureKey(url))) this.load.image(textureKey(url), url);
  }

  create() {
    this.input.mouse?.disableContextMenu();
    this.input.dragDistanceThreshold = 3;
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.cameras.main.setBackgroundColor(dark ? '#101016' : '#dcdce4');

    this.buildStatics();
    for (const obj of this.sceneData.objects) this.addView(obj);

    this.selection = this.add.graphics().setDepth(10000);
    this.handle = this.add.rectangle(0, 0, HANDLE_PX, HANDLE_PX, 0xffffff).setStrokeStyle(2, ACCENT)
      .setDepth(10001).setVisible(false).setInteractive({ useHandCursor: true, cursor: 'nwse-resize' });
    this.input.setDraggable(this.handle);

    this.setupDragging();
    this.setupCameraControls();
    this.subscribe();
    this.fit();
  }

  // ---------- static layers (background, grid, ground, bounds, player start) ----------
  buildStatics() {
    for (const o of this.statics) o.destroy();
    this.statics = [];
    const s = this.sceneData;
    const add = (o) => { this.statics.push(o); return o; };

    add(this.add.rectangle(0, 0, s.width, s.height, hex(s.background?.color)).setOrigin(0).setDepth(-1000));
    if (s.background?.imageUrl && this.textures.exists(textureKey(s.background.imageUrl))) {
      add(this.add.image(0, 0, textureKey(s.background.imageUrl)).setOrigin(0).setDisplaySize(s.width, s.height).setDepth(-999));
    }
    const g = add(this.add.graphics().setDepth(-900));
    for (let x = 0; x <= s.width; x += GRID) g.lineStyle(1, 0x000000, x % (GRID * 5) === 0 ? 0.12 : 0.05).lineBetween(x, 0, x, s.height);
    for (let y = 0; y <= s.height; y += GRID) g.lineStyle(1, 0x000000, y % (GRID * 5) === 0 ? 0.12 : 0.05).lineBetween(0, y, s.width, y);
    if (s.ground) add(this.add.rectangle(s.width / 2, s.ground.y, s.width, s.ground.height ?? 40, hex(s.ground.color, 0)).setDepth(-500));
    add(this.add.graphics().lineStyle(2, ACCENT, 0.9).strokeRect(0, 0, s.width, s.height).setDepth(9000));

    // Draggable player start
    const tex = s.mode === 'platformer' ? 'player-side' : 'playerFront';
    const spawn = add(this.add.sprite(s.spawn.x, s.spawn.y, tex, 0).setScale(0.25).setAlpha(0.7).setDepth(500));
    const tag = add(this.add.text(s.spawn.x, s.spawn.y + 70, 'Player start', {
      fontSize: '13px', color: '#ffffff', backgroundColor: '#5b5bd6', padding: { x: 6, y: 3 }, fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(500));
    spawn.setInteractive({ useHandCursor: true, cursor: 'grab' });
    this.input.setDraggable(spawn);
    spawn.setData('role', 'spawn');
    spawn.setData('tag', tag);
  }

  // ---------- object views ----------
  addView(obj) {
    const view = createObjectView(this, obj);
    if (!view) return;
    view.main.setData('id', obj.id);
    view.main.setInteractive({ useHandCursor: true, cursor: 'move' });
    this.input.setDraggable(view.main);
    view.main.on('pointerdown', (pointer) => {
      if (pointer.button !== 0) return;
      this.clickedObject = true;
      this.select(obj.id, { notify: true });
    });
    this.applyVisibility(view, obj);
    this.views.set(obj.id, { view, key: viewKey(obj) });
  }

  applyVisibility(view, obj) {
    const a = obj.visible === false ? 0.35 : 1;
    view.main.setAlpha(a);
    view.label?.setAlpha(a);
  }

  async refreshView(obj) {
    const entry = this.views.get(obj.id);
    if (entry && entry.key === viewKey(obj) && (!obj.props?.imageUrl || this.textures.exists(textureKey(obj.props.imageUrl)))) {
      layout(entry.view, obj);
      this.applyVisibility(entry.view, obj);
      return;
    }
    if (obj.props?.imageUrl) await this.ensureTexture(obj.props.imageUrl);
    if (!this.sys.isActive()) return;
    const current = this.store.findObject(obj.id);
    if (!current || current.scene.id !== this.sceneId) return;
    destroyView(this.views.get(obj.id)?.view);
    this.views.delete(obj.id);
    this.addView(current.obj);
  }

  removeView(id) {
    destroyView(this.views.get(id)?.view);
    this.views.delete(id);
    if (this.selectedId === id) this.select(null, { notify: true });
  }

  /** Load an image texture on demand (new uploads / changed URLs). Resolves even on failure. */
  ensureTexture(url) {
    const key = textureKey(url);
    if (this.textures.exists(key)) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => { this.load.off(`filecomplete-image-${key}`, done); this.load.off('loaderror', onError); resolve(); };
      const onError = (file) => { if (file.key === key) done(); };
      this.load.once(`filecomplete-image-${key}`, done);
      this.load.on('loaderror', onError);
      this.load.image(key, url);
      this.load.start();
    });
  }

  subscribe() {
    const offs = [
      this.store.on('object:update', (obj, sceneId) => { if (sceneId === this.sceneId) this.refreshView(obj); }),
      this.store.on('object:create', async (obj, sceneId) => {
        if (sceneId !== this.sceneId) return;
        if (obj.props?.imageUrl) await this.ensureTexture(obj.props.imageUrl);
        if (this.sys.isActive() && !this.views.has(obj.id) && this.store.findObject(obj.id)) this.addView(obj);
      }),
      this.store.on('object:delete', (id, sceneId) => { if (sceneId === this.sceneId) this.removeView(id); }),
      this.store.on('scene:update', async (scene) => {
        if (scene.id !== this.sceneId) return;
        if (scene.background?.imageUrl) await this.ensureTexture(scene.background.imageUrl);
        if (this.sys.isActive()) this.buildStatics();
      }),
    ];
    this.events.once('shutdown', () => offs.forEach((off) => off()));
  }

  // ---------- selection ----------
  select(id, { notify = false, focus = false } = {}) {
    this.selectedId = this.views.has(id) ? id : null;
    if (focus && this.selectedId) {
      const cam = this.cameras.main;
      const b = this.views.get(this.selectedId).view.main.getBounds();
      const v = cam.worldView;
      if (!(b.x >= v.x && b.y >= v.y && b.right <= v.right && b.bottom <= v.bottom)) cam.pan(b.centerX, b.centerY, 300, 'Sine.easeInOut');
    }
    if (notify) this.onSelect(this.selectedId);
  }

  update() {
    const g = this.selection;
    const zoom = this.cameras.main.zoom;
    g.clear();
    const entry = this.selectedId && this.views.get(this.selectedId);
    if (!entry) {
      this.handle.setVisible(false);
      return;
    }
    const b = entry.view.main.getBounds();
    const pad = 4 / zoom;
    g.lineStyle(2 / zoom, ACCENT, 1).strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    const resizable = entry.view.main.type === 'Image';
    this.handle.setVisible(resizable);
    if (resizable && !this.resizing) this.handle.setPosition(b.right + pad, b.bottom + pad).setScale(1 / zoom);
  }

  // ---------- dragging (move objects, resize, player start) ----------
  snap(v) {
    const step = this.getSnap();
    return step ? Math.round(v / step) * step : Math.round(v);
  }

  setupDragging() {
    this.input.on('dragstart', (pointer, go) => {
      if (go === this.handle) {
        const entry = this.views.get(this.selectedId);
        const obj = this.store.findObject(this.selectedId)?.obj;
        if (!entry || !obj) return;
        const c = entry.view.main;
        this.resizing = { obj, startSize: obj.size, cx: c.x, cy: c.y, startDist: Math.max(1, Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, c.x, c.y)) };
      } else {
        if (go.getData('id')) this.select(go.getData('id'), { notify: true });
        // Measure from where the button went down, so the drag threshold doesn't make objects lag the cursor
        const down = this.cameras.main.getWorldPoint(pointer.downX, pointer.downY);
        const obj = go.getData('id') && this.store.findObject(go.getData('id'))?.obj;
        const start = obj ? { x: obj.x, y: obj.y } : { x: go.x, y: go.y };
        go.setData('dragFrom', { px: down.x, py: down.y, ...start });
      }
    });
    const dragTarget = (pointer, go) => {
      const f = go.getData('dragFrom');
      return { x: this.snap(f.x + pointer.worldX - f.px), y: this.snap(f.y + pointer.worldY - f.py) };
    };

    this.input.on('drag', (pointer, go) => {
      if (go === this.handle && this.resizing) {
        const r = this.resizing;
        const dist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, r.cx, r.cy);
        const size = Math.max(10, Math.round(r.startSize * (dist / r.startDist)));
        layout(this.views.get(r.obj.id).view, { ...r.obj, size });
        r.size = size;
        this.handle.setPosition(pointer.worldX, pointer.worldY);
        return;
      }
      if (go.getData('role') === 'spawn') {
        const s = this.sceneData;
        const t = dragTarget(pointer, go);
        const x = Phaser.Math.Clamp(t.x, 0, s.width);
        const y = Phaser.Math.Clamp(t.y, 0, s.height);
        go.setPosition(x, y);
        go.getData('tag').setPosition(x, y + 70);
        return;
      }
      const id = go.getData('id');
      const obj = id && this.store.findObject(id)?.obj;
      if (!obj) return;
      const entry = this.views.get(id);
      layout(entry.view, { ...obj, ...dragTarget(pointer, go) });
    });

    this.input.on('dragend', (pointer, go) => {
      if (go === this.handle) {
        const r = this.resizing;
        this.resizing = null;
        if (r?.size && r.size !== r.startSize) this.store.updateObject(r.obj.id, { size: r.size });
        return;
      }
      if (go.getData('role') === 'spawn') {
        const s = this.sceneData;
        if (go.x !== s.spawn.x || go.y !== s.spawn.y) this.store.updateScene(this.sceneId, { spawn: { x: go.x, y: go.y } });
        return;
      }
      const id = go.getData('id');
      const obj = id && this.store.findObject(id)?.obj;
      if (obj && (go.x !== obj.x || go.y !== obj.y)) {
        // Label-bearing views position main at obj.x/y, so main.x/y is the new position
        this.store.updateObject(id, { x: go.x, y: go.y });
      }
    });
  }

  // ---------- camera ----------
  setupCameraControls() {
    const cam = this.cameras.main;
    let drag = null;

    this.input.on('wheel', (pointer, over, dx, dy) => {
      this.zoomAt(cam.zoom * Math.pow(1.0015, -dy), pointer.x, pointer.y);
    });
    this.input.on('pointerdown', (pointer, over) => {
      const panButton = pointer.button === 1 || pointer.button === 2;
      if (over.length === 0 || panButton) drag = { x: pointer.x, y: pointer.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
    });
    this.input.on('pointermove', (pointer) => {
      if (!drag || !pointer.isDown) return;
      const dx = pointer.x - drag.x;
      const dy = pointer.y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      cam.setScroll(drag.sx - dx / cam.zoom, drag.sy - dy / cam.zoom);
    });
    this.input.on('pointerup', (pointer) => {
      if (drag && !drag.moved && pointer.button === 0 && !this.clickedObject) this.select(null, { notify: true });
      drag = null;
      this.clickedObject = false;
    });
  }

  zoomAt(zoom, px = this.cameras.main.width / 2, py = this.cameras.main.height / 2) {
    const cam = this.cameras.main;
    const z1 = cam.zoom;
    const z2 = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    cam.scrollX += (px - cam.width / 2) * (1 / z1 - 1 / z2);
    cam.scrollY += (py - cam.height / 2) * (1 / z1 - 1 / z2);
    cam.setZoom(z2);
    this.onZoom(z2);
  }

  zoomBy(factor) {
    this.zoomAt(this.cameras.main.zoom * factor);
  }

  fit() {
    const cam = this.cameras.main;
    const { width, height } = this.sceneData;
    const zoom = Phaser.Math.Clamp(Math.min(cam.width / width, cam.height / height) * 0.92, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(zoom);
    cam.centerOn(width / 2, height / 2);
    this.onZoom(zoom);
  }

  /** Browser client coords -> world coords (for palette drag-and-drop). */
  clientToWorld(clientX, clientY) {
    const rect = this.game.canvas.getBoundingClientRect();
    const cam = this.cameras.main;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    return {
      x: cam.scrollX + cam.width / 2 + (px - cam.width / 2) / cam.zoom,
      y: cam.scrollY + cam.height / 2 + (py - cam.height / 2) / cam.zoom,
      inside: px >= 0 && py >= 0 && px <= rect.width && py <= rect.height,
    };
  }

  /** World coords of the current view centre. */
  viewCenter() {
    const v = this.cameras.main.worldView;
    return { x: Math.round(v.centerX), y: Math.round(v.centerY) };
  }
}
