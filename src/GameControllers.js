import Phaser from 'phaser';

// ==========================================
// 1. THE BASE CONTROLLER (Shared Logic)
// ==========================================
class BaseController {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.dpadElements = [];
    
    // ==========================================
    // NEW: LOAD STATE FROM PHASER REGISTRY
    // ==========================================
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
  }

  createMobileBtn(x, y, label, key, btnWidth = 60, btnHeight = 60) {
    const btn = this.scene.add.rectangle(x, y, btnWidth, btnHeight, 0x000000, 0.3)
      .setScrollFactor(0)
      .setDepth(100)
      .setVisible(this.isDpadEnabled); // Apply global state immediately

    // Only make it interactive if the global state says it should be enabled
    if (this.isDpadEnabled) {
      btn.setInteractive();
    }

    const txt = this.scene.add.text(x, y, label, { fontSize: '20px', fill: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(this.isDpadEnabled); // Apply global state immediately

    this.dpadElements.push(btn, txt);

    btn.on('pointerdown', () => { this.mobileControls[key] = true; btn.setFillStyle(0x000000, 0.6); });
    btn.on('pointerup', () => { this.mobileControls[key] = false; btn.setFillStyle(0x000000, 0.3); });
    btn.on('pointerout', () => { this.mobileControls[key] = false; btn.setFillStyle(0x000000, 0.3); });
  }

  toggleDpad(isVisible) {
    this.isDpadEnabled = isVisible;
    
    // ==========================================
    // NEW: SAVE STATE TO PHASER REGISTRY
    // ==========================================
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

    // Dynamically set initial text based on the loaded registry state
    const initialText = this.isDpadEnabled ? 'Hide D-Pad' : 'Show D-Pad';
    const menuText = this.scene.add.text(topCenterX, 110, initialText, { fontSize: '20px', fill: '#ffffff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(201).setVisible(false);

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
// For HubScene (4-way movement, 4-way D-Pad)
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
// For GalleryScene (Side-scrolling, Jumping, Split UI)
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