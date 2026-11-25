import Phaser from 'phaser';

// ==========================================
// 1. THE BASE CONTROLLER (Shared Logic)
// ==========================================
class BaseController {

  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    // Track if camera is currently following the player
    this.isCameraFollowing = true;

    // Written by the HUD's on-screen touch buttons (src/scenes/HudScene.js)
    this.mobileControls = { up: false, down: false, left: false, right: false, jump: false };

    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.keys = this.scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    // Setup camera zoom and drag controls
    this.setupCameraControls();
  }

  // ==========================================
  // ZOOM & DRAG LOGIC
  // ==========================================
  setupCameraControls() {
    const cam = this.scene.cameras.main;
    const minZoom = 1.0; 
    const maxZoom = 2.0; 
    const zoomSpeedWheel = 0.001; 
    const zoomSpeedPinch = 0.005; 

    let prevPinchDistance = -1;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let camScrollStartX = 0;
    let camScrollStartY = 0;

    // 1. Mouse Scroll Wheel (Zoom)
    this.scene.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
      let newZoom = Phaser.Math.Clamp(cam.zoom - (deltaY * zoomSpeedWheel), minZoom, maxZoom);
      cam.setZoom(newZoom);
      
      // If zoomed all the way out, snap camera back to player
      if (newZoom <= minZoom) this.resumeCameraFollow();
    });

    // 2. Pointer Down (Start Drag to Pan)
    this.scene.input.on('pointerdown', (pointer, currentlyOver) => {
      // Prevent panning if we are clicking on a UI button or D-pad
      if (currentlyOver.length > 0) return;

      // Only allow panning if zoomed in
      if (cam.zoom > minZoom) {
        isDragging = true;
        dragStartX = pointer.x;
        dragStartY = pointer.y;
        camScrollStartX = cam.scrollX;
        camScrollStartY = cam.scrollY;
        
        // Temporarily stop following the player to allow free panning
        cam.stopFollow();
        this.isCameraFollowing = false;
      }
    });

    // 3. Pointer Move (Pinch to Zoom & Drag to Pan)
    this.scene.input.on('pointermove', (pointer) => {
      const p1 = this.scene.input.pointer1;
      const p2 = this.scene.input.pointer2;

      // PINCH TO ZOOM
      if (p1.isDown && p2.isDown) {
        isDragging = false; // Cancel panning if pinching
        const currentDistance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);

        if (prevPinchDistance > 0) {
          let distanceDelta = currentDistance - prevPinchDistance;
          let newZoom = Phaser.Math.Clamp(cam.zoom + (distanceDelta * zoomSpeedPinch), minZoom, maxZoom);
          
          cam.setZoom(newZoom);

          if (newZoom <= minZoom) this.resumeCameraFollow();
        }
        prevPinchDistance = currentDistance;
        return; 
      }

      // DRAG TO PAN
      if (isDragging && pointer.isDown) {
        // Calculate pointer movement, divided by zoom so dragging feels 1:1
        const dx = (pointer.x - dragStartX) / cam.zoom;
        const dy = (pointer.y - dragStartY) / cam.zoom;
        
        // cam.setBounds() will automatically cap this so you can't pan outside the world
        cam.setScroll(camScrollStartX - dx, camScrollStartY - dy);
      }
    });

    // 4. Pointer Up (Reset Drag/Pinch)
    this.scene.input.on('pointerup', () => {
      prevPinchDistance = -1;
      isDragging = false;
    });
  }

  // Call this to re-engage camera tracking on the player smoothly
  resumeCameraFollow() {
    if (!this.isCameraFollowing) {
      // Uses the same lerp settings you provided in your example for a smooth cinematic glide back
      this.scene.cameras.main.startFollow(this.player, true, 0.1, 0.1);
      this.isCameraFollowing = true;
    }
  }
}

// ==========================================
// 2. TOP-DOWN CONTROLLER (Extends Base)
// ==========================================
export class TopDownController extends BaseController {
  constructor(scene, player, speed = 300) {
    super(scene, player); // Calls the BaseController setup
    this.speed = speed;
  }

  update() {
    this.player.setVelocity(0);

    const isLeft = this.cursors.left.isDown || this.keys.left.isDown || this.mobileControls.left;
    const isRight = this.cursors.right.isDown || this.keys.right.isDown || this.mobileControls.right;
    const isUp = this.cursors.up.isDown || this.keys.up.isDown || this.mobileControls.up;
    const isDown = this.cursors.down.isDown || this.keys.down.isDown || this.mobileControls.down;

    // If the user inputs any movement, glide the camera back to the player
    if (isLeft || isRight || isUp || isDown) {
      this.resumeCameraFollow();
    }

    let isMoving = false;
    let isMovingDown = false;

    if (isLeft) { this.player.setVelocityX(-this.speed); this.player.setFlipX(false); isMovingDown = true; } 
    else if (isRight) { this.player.setVelocityX(this.speed); this.player.setFlipX(true); isMovingDown = true; }

    if (isUp) { this.player.setVelocityY(-this.speed); isMoving = true; } 
    else if (isDown) { this.player.setVelocityY(this.speed); isMovingDown = true; }

    if (isMoving) { this.player.anims.play('walk', true); } 
    else if (isMovingDown) { this.player.anims.play('walk-down', true); } 
    else { this.player.anims.stop(); this.player.setFrame(0); }
  }
}

// ==========================================
// 3. PLATFORMER CONTROLLER (Extends Base)
// ==========================================
export class PlatformerController extends BaseController {
  constructor(scene, player, speed = 200, jumpPower = 400) {
    super(scene, player); // Calls the BaseController setup
    this.speed = speed;
    this.jumpPower = jumpPower;
  }

  update() {
    this.player.setVelocityX(0); 

    const isLeft = this.cursors.left.isDown || this.keys.left.isDown || this.mobileControls.left;
    const isRight = this.cursors.right.isDown || this.keys.right.isDown || this.mobileControls.right;
    const isJump = this.keys.space.isDown || this.cursors.up.isDown || this.keys.up.isDown || this.mobileControls.jump;

    // If the user inputs any movement, glide the camera back to the player
    if (isLeft || isRight || isJump) {
      this.resumeCameraFollow();
    }

    let isMoving = false;

    if (isLeft) { this.player.setVelocityX(-this.speed); this.player.setFlipX(true); isMoving = true; } 
    else if (isRight) { this.player.setVelocityX(this.speed); this.player.setFlipX(false); isMoving = true; }

    const onGround = this.player.body.touching.down || this.player.body.blocked.down;
    
    if (isJump && onGround) {
      this.player.setVelocityY(-this.jumpPower);
    }

    if (isMoving && onGround) { this.player.anims.play('walk-side', true); } 
    else if (!onGround) { this.player.anims.stop(); this.player.setFrame(0); } 
    else { this.player.anims.stop(); this.player.setFrame(0); }
  }
}