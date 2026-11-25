import Phaser from 'phaser';

const KC = Phaser.Input.Keyboard.KeyCodes;
const { JustDown } = Phaser.Input.Keyboard;
const STICK_DEADZONE = 0.25;
const DRAG_THRESHOLD = 8; // px of pointer travel before a press becomes a camera drag

/**
 * Unified input: merges keyboard, gamepad and the HUD's touch buttons into one set of actions,
 * read once per frame by WorldScene and the movement controllers.
 *
 *   moveX / moveY      -1..1 (analog from a stick, ±1 from keys / d-pad / touch)
 *   jump               held (platformer)
 *   interactPressed    edge: E / Enter (Space in top-down) · gamepad X (A in top-down) · touch ACT
 *   cancelPressed      edge: Esc · gamepad B
 *
 * Also tracks the last-used input `source` ('keyboard' | 'gamepad' | 'touch' | 'mouse') and emits
 * 'source' when it changes, so the HUD can show the right prompts and touch controls.
 */
export class InputState extends Phaser.Events.EventEmitter {
  constructor(scene, mode) {
    super();
    this.scene = scene;
    this.platformer = mode === 'platformer';

    this.keys = scene.input.keyboard.addKeys({
      up: KC.W, down: KC.S, left: KC.A, right: KC.D,
      upArrow: KC.UP, downArrow: KC.DOWN, leftArrow: KC.LEFT, rightArrow: KC.RIGHT,
      space: KC.SPACE, e: KC.E, enter: KC.ENTER, esc: KC.ESC,
    });

    /** Held state of the HUD's virtual buttons, written by HudScene. */
    this.touch = { up: false, down: false, left: false, right: false, jump: false };
    /** Edge-triggered HUD presses (e.g. 'interact'), consumed on the next update(). */
    this.touchPresses = new Set();
    this.prevPad = { interact: false, cancel: false };

    this.moveX = 0;
    this.moveY = 0;
    this.jump = false;
    this.interactPressed = false;
    this.cancelPressed = false;
    this.source = null;

    scene.input.keyboard.on('keydown', () => this.setSource('keyboard'));
    scene.input.on('pointerdown', (pointer) => this.setSource(pointer.wasTouch ? 'touch' : 'mouse'));
  }

  setSource(source) {
    if (source === this.source) return;
    this.source = source;
    this.emit('source', source);
  }

  /** HUD virtual button held / released. */
  setTouch(key, down) {
    this.touch[key] = down;
    if (down) this.setSource('touch');
  }

  /** HUD one-shot press (e.g. the ACT button). */
  pressTouch(action) {
    this.touchPresses.add(action);
    this.setSource('touch');
  }

  /** First connected gamepad, if the browser has exposed one (needs a button press first). */
  get pad() {
    const gp = this.scene.input.gamepad;
    if (!gp || !gp.total) return null;
    return gp.getAll().find((p) => p && p.connected) ?? null;
  }

  update() {
    const k = this.keys;
    const t = this.touch;
    const axis = (neg, pos) => (pos ? 1 : 0) - (neg ? 1 : 0);

    let x = axis(k.left.isDown || k.leftArrow.isDown || t.left, k.right.isDown || k.rightArrow.isDown || t.right);
    let y = axis(k.up.isDown || k.upArrow.isDown || t.up, k.down.isDown || k.downArrow.isDown || t.down);
    let jump = k.space.isDown || t.jump || (this.platformer && (k.up.isDown || k.upArrow.isDown));

    // Evaluate every JustDown so no key keeps a stale "just pressed" flag for a later frame
    const eDown = JustDown(k.e);
    const enterDown = JustDown(k.enter);
    const spaceDown = !this.platformer && JustDown(k.space);
    let interact = eDown || enterDown || spaceDown || this.touchPresses.has('interact');
    let cancel = JustDown(k.esc);
    this.touchPresses.clear();

    const pad = this.pad;
    if (pad) {
      const dead = (v) => (Math.abs(v) > STICK_DEADZONE ? v : 0);
      const px = dead(pad.leftStick.x) || axis(pad.left, pad.right);
      const py = dead(pad.leftStick.y) || axis(pad.up, pad.down);
      const padJump = this.platformer && pad.A;
      const padInteract = pad.X || (!this.platformer && pad.A);
      const padCancel = pad.B;
      if (px || py || padJump || padInteract || padCancel) this.setSource('gamepad');

      x = Phaser.Math.Clamp(x + px, -1, 1);
      y = Phaser.Math.Clamp(y + py, -1, 1);
      jump ||= padJump;
      interact ||= padInteract && !this.prevPad.interact;
      cancel ||= padCancel && !this.prevPad.cancel;
      this.prevPad = { interact: padInteract, cancel: padCancel };
    } else {
      this.prevPad = { interact: false, cancel: false };
    }

    this.moveX = x;
    this.moveY = y;
    this.jump = jump;
    this.interactPressed = interact;
    this.cancelPressed = cancel;
  }

  get isMoving() {
    return this.moveX !== 0 || this.moveY !== 0 || this.jump;
  }

  /** Label for the interact control on the current input source. */
  get interactGlyph() {
    switch (this.source) {
      case 'gamepad': return this.platformer ? 'X' : 'A';
      case 'touch': return 'ACT';
      default: return 'E'; // keyboard, or mouse (desktop players have E too)
    }
  }
}

/**
 * Single owner of the main camera: follows the player, focuses on an object (framed around the
 * dialogue box), and handles wheel / pinch zoom and drag-to-pan. Nothing else should call
 * startFollow / stopFollow / pan on the camera, so its state can't drift.
 *
 * modes: 'follow' (tracking the player) · 'focus' (panned to an object) · 'free' (user dragged)
 */
export class CameraDirector {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.GameObjects.Sprite} player
   * @param {{ minZoom?: number, maxZoom?: number, lerp?: number, onTap?: (pointer) => void }} [opts]
   */
  constructor(scene, player, opts = {}) {
    this.scene = scene;
    this.player = player;
    this.cam = scene.cameras.main;
    this.minZoom = opts.minZoom ?? 1;
    this.maxZoom = opts.maxZoom ?? 2;
    this.lerp = opts.lerp ?? 0.1;
    this.onTap = opts.onTap ?? (() => {});

    this.mode = 'follow';
    this.cam.startFollow(player, true, this.lerp, this.lerp);
    this.drag = null;
    this.pinchDistance = -1;
    this.gesture = false; // a pinch happened during this touch sequence: its release is not a tap

    this.setupPointer();
  }

  /** Glide back to tracking the player (the follow lerp makes the return smooth). */
  follow() {
    if (this.mode === 'follow') return;
    this.cam.panEffect.reset();
    this.cam.startFollow(this.player, true, this.lerp, this.lerp);
    this.mode = 'follow';
  }

  /**
   * Pan to (x, y) so it sits in the middle of the screen area the dialogue box leaves visible.
   * @param {{ edge: 'top' | 'bottom', size: number }} [coverage]  from DialogueUI.getCoverage()
   */
  focusOn(x, y, coverage = { edge: 'bottom', size: 0 }) {
    const offset = (coverage.size / 2 / this.cam.zoom) * (coverage.edge === 'top' ? -1 : 1);
    this.cam.stopFollow();
    this.cam.pan(x, y + offset, 500, 'Power2', true);
    this.mode = 'focus';
  }

  setZoom(zoom) {
    const z = Phaser.Math.Clamp(zoom, this.minZoom, this.maxZoom);
    this.cam.setZoom(z);
    // Zooming all the way out after free panning snaps back to the player
    if (z <= this.minZoom && this.mode === 'free') this.follow();
  }

  setupPointer() {
    const input = this.scene.input;
    const pinching = () => input.pointer1.isDown && input.pointer2.isDown;

    input.on('wheel', (pointer, over, dx, dy) => this.setZoom(this.cam.zoom - dy * 0.001));

    input.on('pointerdown', (pointer, over) => {
      if (pinching()) {
        this.drag = null;
        this.gesture = true;
        this.pinchDistance = -1;
        return;
      }
      // Presses on world objects belong to the object, not the camera
      this.drag = over.length ? null : { id: pointer.id, x: pointer.x, y: pointer.y, moved: false };
    });

    input.on('pointermove', (pointer) => {
      if (pinching()) {
        const p1 = input.pointer1;
        const p2 = input.pointer2;
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (this.pinchDistance > 0) this.setZoom(this.cam.zoom + (d - this.pinchDistance) * 0.005);
        this.pinchDistance = d;
        return;
      }
      const drag = this.drag;
      if (!drag || drag.id !== pointer.id || !pointer.isDown) return;
      if (!drag.moved) {
        // Panning is only useful when zoomed in; small jitters stay taps
        if (this.cam.zoom <= this.minZoom) return;
        if (Phaser.Math.Distance.Between(pointer.x, pointer.y, drag.x, drag.y) < DRAG_THRESHOLD) return;
        drag.moved = true;
        drag.x = pointer.x;
        drag.y = pointer.y;
        drag.scrollX = this.cam.scrollX;
        drag.scrollY = this.cam.scrollY;
        this.cam.panEffect.reset();
        this.cam.stopFollow();
        this.mode = 'free';
      }
      // Divide by zoom so the world moves 1:1 under the finger (camera bounds clamp the result)
      this.cam.setScroll(
        drag.scrollX - (pointer.x - drag.x) / this.cam.zoom,
        drag.scrollY - (pointer.y - drag.y) / this.cam.zoom,
      );
    });

    input.on('pointerup', (pointer) => {
      const drag = this.drag;
      const wasTap = drag && drag.id === pointer.id && !drag.moved && !this.gesture;
      if (!drag || drag.id === pointer.id) this.drag = null;
      if (!input.pointer1.isDown && !input.pointer2.isDown) {
        this.pinchDistance = -1;
        this.gesture = false;
      }
      if (wasTap) this.onTap(pointer);
    });
  }
}

/** Base for the movement controllers: maps InputState onto the player's physics + animation. */
class BaseController {
  /**
   * @param {Phaser.Scene} scene
   * @param {Phaser.Physics.Arcade.Sprite} player
   * @param {InputState} input
   */
  constructor(scene, player, input) {
    this.scene = scene;
    this.player = player;
    this.input = input;
  }

  update() {}
}

export class TopDownController extends BaseController {
  constructor(scene, player, input, speed = 300) {
    super(scene, player, input);
    this.speed = speed;
  }

  update() {
    let x = this.input.moveX;
    let y = this.input.moveY;
    // Normalise so diagonals aren't ~1.41× faster (analog sticks below full tilt stay as they are)
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.player.setVelocity(x * this.speed, y * this.speed);

    // Front sprite faces right when flipped
    if (x < 0) this.player.setFlipX(false);
    else if (x > 0) this.player.setFlipX(true);

    if (y < -0.3) this.player.anims.play('walk', true); // back view
    else if (x !== 0 || y !== 0) this.player.anims.play('walk-down', true); // front view
    else { this.player.anims.stop(); this.player.setFrame(0); }
  }
}

export class PlatformerController extends BaseController {
  constructor(scene, player, input, speed = 200, jumpPower = 400) {
    super(scene, player, input);
    this.speed = speed;
    this.jumpPower = jumpPower;
  }

  update() {
    const x = this.input.moveX;
    this.player.setVelocityX(x * this.speed);

    // Side sprite faces right by default
    if (x < 0) this.player.setFlipX(true);
    else if (x > 0) this.player.setFlipX(false);

    const body = this.player.body;
    const onGround = body.touching.down || body.blocked.down;
    if (this.input.jump && onGround) this.player.setVelocityY(-this.jumpPower);

    if (x !== 0 && onGround) this.player.anims.play('walk-side', true);
    else { this.player.anims.stop(); this.player.setFrame(0); }
  }
}
