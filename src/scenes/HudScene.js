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
 * Launched (and re-launched on every scene change) by WorldScene with { world, mode, input }.
 *
 * Touch controls: shown on touch devices and hidden on desktop. Until the player picks a setting
 * in the ☰ menu, they also follow the input in use: hidden after keyboard/gamepad input, shown again
 * after a touch. The menu choice is remembered (localStorage) and overrides the automatic behaviour.
 */
export class HudScene extends Phaser.Scene {
  constructor() {
    super('Hud');
  }

  init(data) {
    this.world = data.world;
    this.mode = data.mode;
    this.inputState = data.input;
  }

  create() {
    this.touchButtons = [];
    this.dialogue = new DialogueUI(this, { onClose: () => this.world.closeDialogue() });
    this.createTouchControls();
    this.createMenu();
    this.touchPref = loadTouchPref(); // null = automatic
    this.setTouchControlsVisible(this.touchPref ?? this.sys.game.device.input.touch);
    const onSource = (source) => {
      if (this.touchPref !== null) return;
      if (source === 'touch') this.setTouchControlsVisible(true);
      else if (source === 'keyboard' || source === 'gamepad') this.setTouchControlsVisible(false);
    };
    this.inputState.on('source', onSource);

    // A touch that ends anywhere (or the tab losing focus) must never leave a button stuck down
    this.input.on('pointerup', (pointer) => this.touchButtons.forEach((b) => b.release(pointer)));
    const releaseAll = () => this.touchButtons.forEach((b) => b.release());
    this.game.events.on(Phaser.Core.Events.BLUR, releaseAll);
    this.events.once('shutdown', () => {
      this.game.events.off(Phaser.Core.Events.BLUR, releaseAll);
      this.inputState.off('source', onSource);
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
      this.inputState.setTouch(key, down);
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
    this.touchButtons.forEach((b) => b.setVisible(on));
    this.dialogue.setSafeArea(this.computeSafeArea());
    this.menuText?.setText(on ? 'Hide touch controls' : 'Show touch controls');
  }

  /** Horizontal band the bottom dialogue must leave free so it sits between the button clusters. */
  computeSafeArea() {
    const { width } = this.cameras.main;
    const gap = 8;
    let left = 0;
    let right = 0;
    for (const { bg } of this.touchButtons) {
      if (!this.touchVisible || !bg.visible) continue;
      if (bg.x < width / 2) left = Math.max(left, bg.x + bg.width / 2 + gap);
      else right = Math.max(right, width - (bg.x - bg.width / 2) + gap);
    }
    return { left, right, bottom: 0 };
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
    item.on('pointerdown', () => {
      this.touchPref = !this.touchVisible;
      saveTouchPref(this.touchPref);
      this.setTouchControlsVisible(this.touchPref);
      setOpen(false);
    });
    // Tapping anywhere else closes the menu
    this.input.on('pointerdown', (pointer, over) => {
      if (this.menuOpen && !over.includes(burger) && !over.includes(item)) setOpen(false);
    });
  }
}

/** @returns {boolean | null} the player's explicit choice, or null for automatic */
function loadTouchPref() {
  try {
    const v = window.localStorage.getItem(TOUCH_PREF_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function saveTouchPref(on) {
  try { window.localStorage.setItem(TOUCH_PREF_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}
