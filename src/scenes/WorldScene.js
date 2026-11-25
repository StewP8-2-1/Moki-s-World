import Phaser from 'phaser';
import { TopDownController, PlatformerController, InputState, CameraDirector } from '../GameControllers';
import { createObjectView } from '../world/objectTypes.js';
import { attachBehavior } from '../world/behaviors.js';
import { isActive, textureKey } from '../world/loadWorld.js';

/** Max gap (px) between the player's body and an object's bounds for keyboard/gamepad/ACT interaction. */
const INTERACT_RANGE = 100;

/** Per-mode player + physics setup (kept identical to the legacy scenes). */
const MODES = {
  topdown: {
    gravity: 0,
    createPlayer(scene, spawn) {
      const p = scene.physics.add.sprite(spawn.x, spawn.y, 'playerFront');
      p.setScale(0.25).setSize(180, 200).setOffset(150, 150);
      return p;
    },
    createController: (scene, player, input) => new TopDownController(scene, player, input, 300),
  },
  platformer: {
    gravity: 600,
    createPlayer(scene, spawn) {
      const p = scene.physics.add.sprite(spawn.x, spawn.y, 'player-side');
      p.setScale(0.25).setSize(200, 190);
      return p;
    },
    createController: (scene, player, input) => new PlatformerController(scene, player, input, 200, 400),
  },
};

/**
 * One generic, data-driven scene. Everything it shows comes from the world snapshot
 * in the registry (see BootScene / docs/DATABASE.md). Start with { sceneId }.
 */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World');
  }

  init(data) {
    const world = this.registry.get('world');
    this.sceneData = world.scenes.find((s) => s.id === data?.sceneId)
      ?? world.scenes.find((s) => s.id === world.startScene)
      ?? world.scenes[0];
    this.isDialogueLocked = false;
    this.isTravelling = false;
  }

  create() {
    const s = this.sceneData;
    const mode = MODES[s.mode] ?? MODES.topdown;

    // World + physics bounds
    this.physics.world.setBounds(0, 0, s.width, s.height);
    this.physics.world.gravity.y = mode.gravity;
    this.cameras.main.setBounds(0, 0, s.width, s.height);
    this.cameras.main.setBackgroundColor(s.background?.color || '#ffffff');
    if (s.background?.imageUrl && this.textures.exists(textureKey(s.background.imageUrl))) {
      this.add.image(0, 0, textureKey(s.background.imageUrl)).setOrigin(0).setDisplaySize(s.width, s.height).setDepth(-10);
    }

    // Player
    this.player = mode.createPlayer(this, s.spawn);
    this.player.setCollideWorldBounds(true);

    // Ground (platformer)
    if (s.ground) {
      const rect = this.add.rectangle(s.width / 2, s.ground.y, s.width, s.ground.height ?? 40,
        Phaser.Display.Color.HexStringToColor(s.ground.color || '#000000').color);
      this.ground = this.physics.add.existing(rect, true);
      this.physics.add.collider(this.player, this.ground);
    }

    // Input (keyboard + gamepad + HUD touch buttons), camera and movement
    this.inputState = new InputState(this, s.mode);
    this.cameraDirector = new CameraDirector(this, this.player, {
      onTap: () => this.closeDialogue(), // tap / click on empty space (not a drag or pinch)
    });
    this.controls = mode.createController(this, this.player, this.inputState);

    // Screen-space HUD (dialogue, touch buttons, menu) on top. launch() restarts the HUD when
    // this scene restarts, so it always matches the current mode and input state.
    this.hud = this.scene.get('Hud');
    this.scene.launch('Hud', { world: this, mode: s.mode, input: this.inputState });

    // World objects from data (behaviours register their interactables via addInteractable)
    this.interactables = [];
    this.focusTarget = null;
    this.objectViews = [];
    for (const obj of s.objects) {
      if (!isActive(obj)) continue;
      const view = createObjectView(this, obj);
      if (!view) continue;
      attachBehavior(this, view, obj);
      this.objectViews.push(view);
    }

    // "E · View" prompt floating above the player when something is in range
    this.prompt = this.add.text(0, 0, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'Arial', fontStyle: 'bold',
      backgroundColor: '#000000cc', padding: { x: 8, y: 4 },
    }).setOrigin(0.5, 1).setDepth(1000).setVisible(false);
    this.boundsTmp = new Phaser.Geom.Rectangle();

    this.cameras.main.fadeIn(250, 255, 255, 255);
  }

  update() {
    const input = this.inputState;
    input.update();
    if (input.cancelPressed) this.closeDialogue();
    if (input.isMoving) {
      // Walking away closes a locked dialogue and brings the camera back to the player
      this.closeDialogue();
      this.cameraDirector.follow();
    }
    this.controls.update();
    this.updateInteractFocus();
    if (input.interactPressed) this.interact();
  }

  /** Called by behaviours: `activate()` runs when the player interacts while this is the nearest in range. */
  addInteractable({ target, verb, activate }) {
    this.interactables.push({ target, verb, activate });
  }

  /** Pick the nearest interactable in range and place the prompt above the player. */
  updateInteractFocus() {
    const body = this.player.body;
    let best = null;
    let bestGap = INTERACT_RANGE;
    for (const it of this.interactables) {
      const b = it.target.getBounds(this.boundsTmp);
      const dx = Math.max(b.left - body.right, 0, body.left - b.right);
      const dy = Math.max(b.top - body.bottom, 0, body.top - b.bottom);
      const gap = Math.hypot(dx, dy);
      if (gap <= bestGap) { best = it; bestGap = gap; }
    }
    this.focusTarget = best;

    const show = Boolean(best) && !this.isDialogueLocked && !this.isTravelling;
    this.prompt.setVisible(show);
    if (show) {
      this.prompt.setText(`${this.inputState.interactGlyph} · ${best.verb}`);
      this.prompt.setPosition(this.player.x, body.top - 6);
    }
  }

  /** Interact (E / Space / gamepad A·X / ACT): CTA or close an open dialogue, else use the nearest object. */
  interact() {
    if (this.isDialogueLocked) {
      if (!this.dialogue?.activateCta()) this.closeDialogue();
      return;
    }
    this.focusTarget?.activate();
  }

  /** Glyph for the dialogue's CTA button when it can be pressed from the keyboard / gamepad. */
  get ctaKeyHint() {
    const source = this.inputState.source;
    return source === 'keyboard' || source === 'gamepad' ? this.inputState.interactGlyph : '';
  }

  /** Dialogue lives in the HUD scene, which starts one tick after this one (launch is queued). */
  get dialogue() {
    return this.hud.dialogue;
  }

  /** @param {{ placement?: 'bottom' | 'top' }} [opts] */
  showDialogue(data, opts) {
    this.dialogue?.show(data, opts);
  }

  hideDialogue() {
    this.dialogue?.hide();
  }

  /**
   * Lock the dialogue open for an object. With `pan`, the camera frames the object in the part of
   * the screen the box leaves visible; without it, the box goes wherever it doesn't hide the object.
   */
  openDialogue(data, target, { pan = true } = {}) {
    this.isDialogueLocked = true;
    this.dialogueTarget = target;
    if (!pan) {
      this.showDialogue(data, { placement: this.dialoguePlacementFor(target.x, target.y) });
      return;
    }
    this.showDialogue(data, { placement: 'bottom' });
    this.cameraDirector.focusOn(target.x, target.y, this.dialogue?.getCoverage());
  }

  /** Close a locked dialogue (✕, Esc / B, tap on empty space, moving) and return the camera. */
  closeDialogue() {
    if (!this.isDialogueLocked) return;
    this.isDialogueLocked = false;
    this.dialogueTarget = null;
    this.hideDialogue();
    this.cameraDirector.follow();
  }

  /** Bottom unless the point (world coords) would be hidden under a bottom-anchored box. */
  dialoguePlacementFor(x, y) {
    const cam = this.cameras.main;
    const screenY = (y - cam.worldView.y) * cam.zoom;
    return screenY > cam.height * 0.55 ? 'top' : 'bottom';
  }

  /** Called by portal behaviours. */
  travelTo(sceneId) {
    if (this.isTravelling) return;
    this.isTravelling = true;
    this.cameras.main.fadeOut(250, 255, 255, 255);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ sceneId }));
  }
}
