import Phaser from 'phaser';
import { TopDownController, PlatformerController } from '../GameControllers';
import { createObjectView } from '../world/objectTypes.js';
import { attachBehavior } from '../world/behaviors.js';
import { isActive, textureKey } from '../world/loadWorld.js';

/** Per-mode player + physics setup (kept identical to the legacy scenes). */
const MODES = {
  topdown: {
    gravity: 0,
    createPlayer(scene, spawn) {
      const p = scene.physics.add.sprite(spawn.x, spawn.y, 'playerFront');
      p.setScale(0.25).setSize(180, 200).setOffset(150, 150);
      return p;
    },
    createController: (scene, player) => new TopDownController(scene, player, 300),
  },
  platformer: {
    gravity: 600,
    createPlayer(scene, spawn) {
      const p = scene.physics.add.sprite(spawn.x, spawn.y, 'player-side');
      p.setScale(0.25).setSize(200, 190);
      return p;
    },
    createController: (scene, player) => new PlatformerController(scene, player, 200, 400),
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

    // Camera follows the player
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Controls, then the screen-space HUD (dialogue, touch buttons, menu) on top.
    // launch() restarts the HUD when this scene restarts, so it always matches the current mode.
    this.controls = mode.createController(this, this.player);
    this.hud = this.scene.get('Hud');
    this.scene.launch('Hud', { world: this, mode: s.mode, controls: this.controls });

    // World objects from data
    this.objectViews = [];
    for (const obj of s.objects) {
      if (!isActive(obj)) continue;
      const view = createObjectView(this, obj);
      if (!view) continue;
      attachBehavior(this, view, obj);
      this.objectViews.push(view);
    }

    // Click anywhere else: close a locked dialogue
    this.input.on('pointerdown', () => this.closeDialogue());

    this.cameras.main.fadeIn(250, 255, 255, 255);
  }

  update() {
    this.controls.update();
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

  /** Close a locked dialogue (✕, tap on empty space) and glide the camera back to the player. */
  closeDialogue() {
    if (!this.isDialogueLocked) return;
    this.isDialogueLocked = false;
    this.hideDialogue();
    this.cameras.main.pan(this.player.x, this.player.y, 1000, 'Power2', true, (camera, progress) => {
      if (progress === 1) camera.startFollow(this.player, true, 0.1, 0.1);
    });
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
