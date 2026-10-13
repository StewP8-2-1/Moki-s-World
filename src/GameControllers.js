import Phaser from 'phaser';

// ==========================================
// 1. THE BASE CONTROLLER (Shared Logic)
// ==========================================
class BaseController {

  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    
    this.dpadElements = [];
    // Array to hold ALL UI elements so we can adjust their scale/position on zoom
    this.uiElements = []; 
    
    // Track if camera is currently following the player
    this.isCameraFollowing = true; 
    
    // Check if a preference already exists globally. If not, default to true.
    let savedState = this.scene.registry.get('dpadEnabled');
    if (savedState === undefined) {
      savedState = true;
      this.scene.registry.set('dpadEnabled', true);
    }
    this.isDpadEnabled = savedState; 
    
    this.mobileControls = { up: false, down: false, left: false, right: false, jump: false };

    this.cursors = this.scene.input.keyboard.createCursorKeys();
    this.keys = this.scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    this.scene.input.addPointer(2); 

    // Setup camera zoom and drag controls
    this.setupCameraControls();
  }

  // ==========================================
  // NEW: REGISTER EXTERNAL UI (DIALOGUE BOX)
  // Call this from your Scene after creating the DialogueUI
  // ==========================================
  registerDialogueBox(dialogueContainer) {
    // Save the original screen coordinates so the counter-zoom math knows where it started
    dialogueContainer.origX = dialogueContainer.x;
    dialogueContainer.origY = dialogueContainer.y;
    
    // Push it into the master array so updateUI(zoom) handles it automatically
    this.uiElements.push(dialogueContainer);
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
      this.updateUI(newZoom);
      
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
          this.updateUI(newZoom);

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

  // Counter-scales and repositions UI so it doesn't leave the screen during zoom
  updateUI(zoom) {
    const cam = this.scene.cameras.main;
    const cx = cam.centerX; // Center X of the screen
    const cy = cam.centerY; // Center Y of the screen

    this.uiElements.forEach(el => {
      // Counter-scale the UI element
      el.setScale(1 / zoom);
      // Counter-shift position relative to the screen center
      el.x = cx + (el.origX - cx) / zoom;
      el.y = cy + (el.origY - cy) / zoom;
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

  createMobileBtn(x, y, label, key, btnWidth = 60, btnHeight = 60) {
    const btn = this.scene.add.rectangle(x, y, btnWidth, btnHeight, 0x000000, 0.3)
      .setScrollFactor(0).setDepth(100).setVisible(this.isDpadEnabled); 

    if (this.isDpadEnabled) btn.setInteractive();

    const txt = this.scene.add.text(x, y, label, { fontSize: '20px', fill: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(101).setVisible(this.isDpadEnabled); 

    // Save original positions for the zoom math
    btn.origX = x; btn.origY = y;
    txt.origX = x; txt.origY = y;

    this.dpadElements.push(btn, txt);
    this.uiElements.push(btn, txt); // Add to master UI array

    btn.on('pointerdown', () => { this.mobileControls[key] = true; btn.setFillStyle(0x000000, 0.6); });
    btn.on('pointerup', () => { this.mobileControls[key] = false; btn.setFillStyle(0x000000, 0.3); });
    btn.on('pointerout', () => { this.mobileControls[key] = false; btn.setFillStyle(0x000000, 0.3); });
  }

  toggleDpad(isVisible) {
    this.isDpadEnabled = isVisible;
    this.scene.registry.set('dpadEnabled', isVisible); 
    
    this.dpadElements.forEach(el => {
      el.setVisible(isVisible);
      if (isVisible && el.type === 'Rectangle') {
        el.setInteractive();
      } else if (!isVisible && el.type === 'Rectangle') {
        el.disableInteractive();
        Object.keys(this.mobileControls).forEach(k => this.mobileControls[k] = false);
      }
    });
  }

  createBurgerMenu() {
    const { width } = this.scene.cameras.main;
    const topCenterX = width / 2;

    const burgerBg = this.scene.add.rectangle(topCenterX, 25, 50, 50, 0x000000, 0.5)
      .setScrollFactor(0).setDepth(200).setInteractive();
    const burgerIcon = this.scene.add.text(topCenterX, 25, '☰', { fontSize: '32px', fill: '#ffffff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201);

    const menuBg = this.scene.add.rectangle(topCenterX, 110, 180, 50, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(200).setVisible(false).setInteractive();

    const initialText = this.isDpadEnabled ? 'Hide D-Pad' : 'Show D-Pad';
    const menuText = this.scene.add.text(topCenterX, 110, initialText, { fontSize: '20px', fill: '#ffffff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201).setVisible(false);

    // Save original positions for the zoom math
    burgerBg.origX = topCenterX; burgerBg.origY = 25;
    burgerIcon.origX = topCenterX; burgerIcon.origY = 25;
    menuBg.origX = topCenterX; menuBg.origY = 110;
    menuText.origX = topCenterX; menuText.origY = 110;
    
    this.uiElements.push(burgerBg, burgerIcon, menuBg, menuText); // Add to master UI array

    let isMenuOpen = false;

    burgerBg.on('pointerdown', () => {
      isMenuOpen = !isMenuOpen;
      menuBg.setVisible(isMenuOpen);
      menuText.setVisible(isMenuOpen);
    });

    menuBg.on('pointerdown', () => {
      this.toggleDpad(!this.isDpadEnabled); 
      menuText.setText(this.isDpadEnabled ? 'Hide D-Pad' : 'Show D-Pad'); 
      isMenuOpen = false;
      menuBg.setVisible(false);
      menuText.setVisible(false);
    });
  }
}

// ==========================================
// 2. TOP-DOWN CONTROLLER (Extends Base)
// ==========================================
export class TopDownController extends BaseController {
  constructor(scene, player, speed = 300) {
    super(scene, player); // Calls the BaseController setup
    this.speed = speed;
    
    const { height } = this.scene.cameras.main;
    this.createMobileBtn(120, height - 160, 'W', 'up');
    this.createMobileBtn(120, height - 60, 'S', 'down');
    this.createMobileBtn(50, height - 110, 'A', 'left');
    this.createMobileBtn(190, height - 110, 'D', 'right');
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

    const { width, height } = this.scene.cameras.main;
    this.createMobileBtn(70, height - 70, 'A', 'left', 60, 60);
    this.createMobileBtn(150, height - 70, 'D', 'right', 60, 60);
    this.createMobileBtn(width - 90, height - 70, 'JUMP', 'jump', 100, 60);
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