import Phaser from 'phaser';
import { createObjectView } from '../world/objectTypes.js';
import { textureKey } from '../world/loadWorld.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const GRID = 50;
const ACCENT = 0x5b5bd6;

const hex = (s, fallback = 0xffffff) => {
  try { return Phaser.Display.Color.HexStringToColor(s).color; } catch { return fallback; }
};

/**
 * Editor canvas: renders one scene of the draft world with the SAME object registry as the game,
 * plus editor-only overlays (world bounds, grid, ground, player start, selection outline).
 * Phase 3: view + select. Dragging/resizing arrives in Phase 4.
 *
 * init data: { scene, onSelect(id|null), onZoom(zoom) }
 */
export class EditorScene extends Phaser.Scene {
  constructor() {
    super('Editor');
  }

  init(data) {
    this.sceneData = data.scene;
    this.onSelect = data.onSelect || (() => {});
    this.onZoom = data.onZoom || (() => {});
    this.views = new Map(); // id -> { view, obj }
    this.selectedId = null;
  }

  preload() {
    const sheet = { frameWidth: 512, frameHeight: 512 };
    if (!this.textures.exists('playerFront')) this.load.spritesheet('playerFront', 'Moki TYB Front.png', sheet);
    if (!this.textures.exists('player-side')) this.load.spritesheet('player-side', 'Moki (side).png', sheet);
    this.load.setCORS('anonymous');
    const urls = new Set(this.sceneData.objects.map((o) => o.props?.imageUrl).filter(Boolean));
    if (this.sceneData.background?.imageUrl) urls.add(this.sceneData.background.imageUrl);
    for (const url of urls) if (!this.textures.exists(textureKey(url))) this.load.image(textureKey(url), url);
  }

  create() {
    const s = this.sceneData;
    this.input.mouse?.disableContextMenu();
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.cameras.main.setBackgroundColor(dark ? '#101016' : '#dcdce4');

    // World area + optional background image
    this.add.rectangle(0, 0, s.width, s.height, hex(s.background?.color)).setOrigin(0).setDepth(-1000);
    if (s.background?.imageUrl && this.textures.exists(textureKey(s.background.imageUrl))) {
      this.add.image(0, 0, textureKey(s.background.imageUrl)).setOrigin(0).setDisplaySize(s.width, s.height).setDepth(-999);
    }
    this.drawGrid();

    // Ground (platformer)
    if (s.ground) {
      this.add.rectangle(s.width / 2, s.ground.y, s.width, s.ground.height ?? 40, hex(s.ground.color, 0)).setDepth(-500);
    }

    // Player start marker
    const startTex = s.mode === 'platformer' ? 'player-side' : 'playerFront';
    this.add.sprite(s.spawn.x, s.spawn.y, startTex, 0).setScale(0.25).setAlpha(0.6).setDepth(500);
    this.add.text(s.spawn.x, s.spawn.y + 70, 'Player start', {
      fontSize: '13px', color: '#ffffff', backgroundColor: '#5b5bd6', padding: { x: 6, y: 3 }, fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(500);

    // Objects
    for (const obj of s.objects) this.addObjectView(obj);

    // Overlays
    this.add.graphics().lineStyle(2, ACCENT, 0.9).strokeRect(0, 0, s.width, s.height).setDepth(9000);
    this.selection = this.add.graphics().setDepth(10000);

    this.setupCameraControls();
    this.fit();
  }

  drawGrid() {
    const { width, height } = this.sceneData;
    const g = this.add.graphics().setDepth(-900);
    for (let x = 0; x <= width; x += GRID) {
      g.lineStyle(1, 0x000000, x % (GRID * 5) === 0 ? 0.12 : 0.05).lineBetween(x, 0, x, height);
    }
    for (let y = 0; y <= height; y += GRID) {
      g.lineStyle(1, 0x000000, y % (GRID * 5) === 0 ? 0.12 : 0.05).lineBetween(0, y, width, y);
    }
  }

  addObjectView(obj) {
    const view = createObjectView(this, obj);
    if (!view) return;
    if (obj.visible === false) {
      view.main.setAlpha(0.35);
      view.label?.setAlpha(0.35);
    }
    view.main.setInteractive({ useHandCursor: true });
    view.main.on('pointerdown', (pointer) => {
      if (pointer.button !== 0) return;
      this.clickedObject = true;
      this.select(obj.id, { notify: true });
    });
    this.views.set(obj.id, { view, obj });
  }

  /** Select an object (or null). notify=true tells the DOM side; false when the DOM initiated it. */
  select(id, { notify = false, focus = false } = {}) {
    this.selectedId = this.views.has(id) ? id : null;
    if (focus && this.selectedId) {
      // Only move the camera if the object is (partly) off-screen
      const cam = this.cameras.main;
      const b = this.views.get(this.selectedId).view.main.getBounds();
      const v = cam.worldView;
      const fullyVisible = b.x >= v.x && b.y >= v.y && b.right <= v.right && b.bottom <= v.bottom;
      if (!fullyVisible) cam.pan(b.centerX, b.centerY, 300, 'Sine.easeInOut');
    }
    if (notify) this.onSelect(this.selectedId);
  }

  update() {
    const g = this.selection;
    g.clear();
    const entry = this.selectedId && this.views.get(this.selectedId);
    if (!entry) return;
    const b = entry.view.main.getBounds();
    const pad = 4 / this.cameras.main.zoom;
    g.lineStyle(2 / this.cameras.main.zoom, ACCENT, 1).strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
  }

  // ---------- Camera ----------
  setupCameraControls() {
    const cam = this.cameras.main;
    let drag = null;

    this.input.on('wheel', (pointer, over, dx, dy) => {
      this.zoomAt(cam.zoom * Math.pow(1.0015, -dy), pointer.x, pointer.y);
    });

    this.input.on('pointerdown', (pointer, over) => {
      const panButton = pointer.button === 1 || pointer.button === 2;
      if (over.length === 0 || panButton) {
        drag = { x: pointer.x, y: pointer.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
      }
    });
    this.input.on('pointermove', (pointer) => {
      if (!drag || !pointer.isDown) return;
      const dx = pointer.x - drag.x;
      const dy = pointer.y - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      cam.setScroll(drag.sx - dx / cam.zoom, drag.sy - dy / cam.zoom);
    });
    this.input.on('pointerup', (pointer) => {
      // A click (not a drag) on empty space clears the selection
      if (drag && !drag.moved && pointer.button === 0 && !this.clickedObject) this.select(null, { notify: true });
      drag = null;
      this.clickedObject = false;
    });
  }

  /** Zoom keeping the world point under (px, py) fixed on screen. */
  zoomAt(zoom, px = this.cameras.main.width / 2, py = this.cameras.main.height / 2) {
    const cam = this.cameras.main;
    const z1 = cam.zoom;
    const z2 = Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const hw = cam.width / 2;
    const hh = cam.height / 2;
    cam.scrollX += (px - hw) * (1 / z1 - 1 / z2);
    cam.scrollY += (py - hh) * (1 / z1 - 1 / z2);
    cam.setZoom(z2);
    this.onZoom(z2);
  }

  zoomBy(factor) {
    this.zoomAt(this.cameras.main.zoom * factor);
  }

  /** Fit the whole scene in view with a margin. */
  fit() {
    const cam = this.cameras.main;
    const { width, height } = this.sceneData;
    const zoom = Phaser.Math.Clamp(Math.min(cam.width / width, cam.height / height) * 0.92, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(zoom);
    cam.centerOn(width / 2, height / 2);
    this.onZoom(zoom);
  }
}
