import Phaser from 'phaser';
import { DialogueUI } from '../DialogueUI.js';

const TOUCH_PREF_KEY = 'mokis-world:touchControls';

/** Per-mode on-screen button layout (base 800×600 canvas; y measured up from the bottom edge). */
const TOUCH_LAYOUTS = {
  topdown: [
    { key: 'up', label: 'W', x: 120, fromBottom: 160 },
    { key: 'down', label: 'S', x: 120, fromBottom: 60 },
    { key: 'left', label: 'A', x: 50, fromBottom: 110 },
    { key: 'right', label: 'D', x: 190, fromBottom: 110 },
  ],
  platformer: [
    { key: 'left', label: 'A', x: 70, fromBottom: 70 },
    { key: 'right', label: 'D', x: 150, fromBottom: 70 },
    { key: 'jump', label: 'JUMP', x: -90, fromBottom: 70, w: 100 },
  ],
};

/**
 * Screen-space HUD, run in parallel above WorldScene: dialogue box, touch buttons, menu.
 * It has its own camera that never scrolls or zooms, so nothing here needs counter-zoom maths,
 * and Phaser's globalTopOnly input keeps taps on HUD buttons from reaching the world below.
 * Launched (and re-launched on every scene change) by WorldScene with { world, mode, controls }.
 */
export class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  init(data) {
    this.world = data.world;
    this.mode = data.mode;
    this.controls = data.controls;
  }

  create() {
    this.touchButtons = [];
    this.dialogue = new DialogueUI(this, {
      width: this.cameras.main.width + 10, height: 140, paddingTop: 20, titleSpacing: 0, bottomMargin: 140,
    });
    this.createTouchControls();
    this.createMenu();
    this.setTouchControlsVisible(loadTouchPref(this.sys.game.device.input.touch));

    // A touch that ends anywhere (or the tab losing focus) must never leave a button stuck down
    this.input.on('pointerup', (pointer) => this.touchButtons.forEach((b) => b.release(pointer)));
    const releaseAll = () => this.touchButtons.forEach((b) => b.release());
    this.game.events.on(Phaser.Core.Events.BLUR, releaseAll);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.BLUR, releaseAll);
      this.dialogue = null; // WorldScene checks this until the relaunched HUD has created its own
    });
  }

  // ---------- touch buttons ----------

  createTouchControls() {
    const { width, height } = this.cameras.main;
    for (const spec of TOUCH_LAYOUTS[this.mode] ?? TOUCH_LAYOUTS.topdown) {
      const x = spec.x < 0 ? width + spec.x : spec.x;
      this.touchButtons.push(this.createTouchButton(x, height - spec.fromBottom, spec.label, spec.key, spec.w, spec.h));
    }
  }

  /** A virtual button that stays "down" while at least one pointer holds it (multitouch-safe). */
  createTouchButton(x, y, label, key, w = 60, h = 60) {
    const bg = this.add.rectangle(x, y, w, h, 0x000000, 0.3).setInteractive();
    const text = this.add.text(x, y, label, { fontSize: '20px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
    const held = new Set();
    const sync = () => {
      const down = held.size > 0;
      this.controls.mobileControls[key] = down;
      bg.setFillStyle(0x000000, down ? 0.6 : 0.3);
    };
    bg.on('pointerdown', (pointer) => { held.add(pointer.id); sync(); });
    bg.on('pointerout', (pointer) => { held.delete(pointer.id); sync(); });
    return {
      bg, text,
      setVisible(on) { bg.setVisible(on); text.setVisible(on); if (!on) { held.clear(); sync(); } },
      release(pointer) { if (pointer) held.delete(pointer.id); else held.clear(); sync(); },
    };
  }

  setTouchControlsVisible(on) {
    this.touchVisible = on;
    saveTouchPref(on);
    this.touchButtons.forEach((b) => b.setVisible(on));
    this.menuText?.setText(on ? 'Hide touch controls' : 'Show touch controls');
  }

  // ---------- burger menu ----------

  createMenu() {
    const x = this.cameras.main.width / 2;
    const burger = this.add.rectangle(x, 25, 50, 50, 0x000000, 0.5).setInteractive({ useHandCursor: true });
    this.add.text(x, 25, '☰', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    const item = this.add.rectangle(x, 85, 230, 50, 0x000000, 0.8).setInteractive({ useHandCursor: true });
    this.menuText = this.add.text(x, 85, '', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);

    const setOpen = (open) => { this.menuOpen = open; item.setVisible(open); this.menuText.setVisible(open); };
    setOpen(false);
    burger.on('pointerdown', () => setOpen(!this.menuOpen));
    item.on('pointerdown', () => { this.setTouchControlsVisible(!this.touchVisible); setOpen(false); });
    // Tapping anywhere else closes the menu
    this.input.on('pointerdown', (pointer, over) => {
      if (this.menuOpen && !over.includes(burger) && !over.includes(item)) setOpen(false);
    });
  }
}

function loadTouchPref(fallback) {
  try {
    const v = window.localStorage.getItem(TOUCH_PREF_KEY);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function saveTouchPref(on) {
  try { window.localStorage.setItem(TOUCH_PREF_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}
