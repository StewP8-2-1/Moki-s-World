import Phaser from 'phaser';
import { GAME_CONFIG } from './constants';

export class GalleryScene extends Phaser.Scene {
    
  constructor() {
    super('GalleryScene');
  }

  preload() {
    this.load.spritesheet('player-side', 'Moki (side).png', {
      frameWidth: 512,
      frameHeight: 512
    });

    // Load the gallery artwork
    this.load.image('art-news', 'news of the world.jpg');
    this.load.image('art-say', 'say i am you.jpg');
    this.load.image('art-blue', 'Thank you blue.jpg');
  }

  create() {

    // 1. Expand the Game World dynamically
    const { width: worldWidth, height: worldHeight } = GAME_CONFIG.worlds.hub; 
    
    // Tell the physics engine the new boundaries
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    
    // Side-scroll physics (gravity enabled)
    this.physics.world.gravity.y = 600;

    // ==========================================
    // PARALLAX BACKGROUND LAYERS
    // ==========================================
    // Layer 1: Deep Background (Moves very slowly: 20% speed)
    this.add.rectangle(0, 0, worldWidth * 1.5, worldHeight, 0xffffff)
        .setOrigin(0, 0)
        .setDepth(-5)
        .setScrollFactor(0.2); 

    // ==========================================
    // EXPANDED PLATFORM / GROUND
    // ==========================================
    const groundRect = this.add.rectangle(worldWidth / 2, 580, worldWidth, 40, 0x000000);
    this.ground = this.physics.add.existing(groundRect, true);

    // ==========================================
    // PLAYER SETUP
    // ==========================================
    this.player = this.physics.add.sprite(100, 538, 'player-side');
    this.player.setScale(0.25); 
    this.player.setSize(200, 190);
    this.physics.add.existing(this.player, false);
    this.player.body.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.ground);

    this.anims.create({
      key: 'walk-side',
      frames: this.anims.generateFrameNumbers('player-side', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1
    });

    // ==========================================
    // CAMERA SETUP
    // ==========================================
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ==========================================
    // ADD GALLERY ARTWORK (BACKGROUND)
    // ==========================================
    const artSize = 160; 
    const heightOnWall = 350; 

    this.add.image(250, heightOnWall, 'art-news').setDisplaySize(artSize, artSize).setDepth(-1);
    this.add.image(450, heightOnWall, 'art-say').setDisplaySize(artSize, artSize).setDepth(-1);
    this.add.image(650, heightOnWall, 'art-blue').setDisplaySize(artSize, artSize).setDepth(-1);

    // ==========================================
    // INPUTS (KEYBOARD)
    // ==========================================
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    // ==========================================
    // PORTAL SETUP
    // ==========================================
    this.hubPortal = this.physics.add.staticSprite(40, 520, 'portal');
    this.hubPortal.setDepth(0);

    this.add.text(80, 480, 'Return to Moki\'s Hub', { 
      fontSize: '16px', fill: '#000000', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.physics.add.overlap(this.player, this.hubPortal, this.returnToHub, null, this);

    // ==========================================
    // NEW: MOBILE VIRTUAL CONTROLS (PLATFORMER STYLE)
    // ==========================================
    this.input.addPointer(2); // Enable multi-touch
    this.mobileControls = { left: false, right: false, jump: false };

    const { width, height } = this.cameras.main;

    // Left/Right buttons on the bottom left
    this.createMobileBtn(70, height - 70, 'A', 'left', 60, 60);
    this.createMobileBtn(150, height - 70, 'D', 'right', 60, 60);
    
    // Jump button on the bottom right (made slightly wider)
    this.createMobileBtn(width - 90, height - 70, 'JUMP', 'jump', 100, 60);
  }

  // Helper function to create interactive UI buttons
  createMobileBtn(x, y, label, key, btnWidth, btnHeight) {
    const btn = this.add.rectangle(x, y, btnWidth, btnHeight, 0x000000, 0.3)
      .setScrollFactor(0)
      .setInteractive()
      .setDepth(100);

    this.add.text(x, y, label, { fontSize: '20px', fill: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101);

    btn.on('pointerdown', () => { 
      this.mobileControls[key] = true; 
      btn.setFillStyle(0x000000, 0.6); 
    });
    
    btn.on('pointerup', () => { 
      this.mobileControls[key] = false; 
      btn.setFillStyle(0x000000, 0.3); 
    });
    
    btn.on('pointerout', () => { 
      this.mobileControls[key] = false; 
      btn.setFillStyle(0x000000, 0.3); 
    });
  }

  update() {
    const speed = 200;
    const jumpPower = 400;
    let isMoving = false; 

    this.player.setVelocityX(0); 

    // ==========================================
    // UNIFIED INPUT CHECK (Keyboard + Mobile)
    // ==========================================
    const isLeft = this.cursors.left.isDown || this.keys.left.isDown || this.mobileControls.left;
    const isRight = this.cursors.right.isDown || this.keys.right.isDown || this.mobileControls.right;
    const isJump = this.keys.space.isDown || this.cursors.up.isDown || this.keys.up.isDown || this.mobileControls.jump;

    // Left/Right Movement
    if (isLeft) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true); // Flip to face LEFT
      isMoving = true;
    } 
    else if (isRight) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false); // Face RIGHT (Default)
      isMoving = true;
    }

    // Jump Logic (Must be pressing jump AND touching the ground)
    if (isJump && this.player.body.touching.down) {
      this.player.setVelocityY(-jumpPower);
    }

    // Animation Logic
    if (isMoving) {
      this.player.anims.play('walk-side', true); 
    } else {
      this.player.anims.stop();
      this.player.setFrame(0); // Reset to standing frame when idle
    }
  }

  returnToHub() {
    this.scene.start('HubScene');
  }
}