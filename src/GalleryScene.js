import Phaser from 'phaser';
import { GAME_CONFIG } from './constants';
import { PlatformerController } from './GameControllers';

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
    // INITIALIZE PLATFORMER CONTROLS HERE
    // Pass 'this' (the scene), the player sprite, speed (200), and jump power (400)
    // ==========================================
    this.controls = new PlatformerController(this, this.player, 200, 400);

    // 2. Generate the settings menu automatically
    this.controls.createBurgerMenu();

    // ==========================================
    // PORTAL SETUP
    // ==========================================
    this.hubPortal = this.physics.add.staticSprite(40, 520, 'portal');
    this.hubPortal.setDepth(0);

    this.add.text(80, 480, 'Return to Moki\'s Hub', { 
      fontSize: '16px', fill: '#000000', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.physics.add.overlap(this.player, this.hubPortal, this.returnToHub, null, this);

  }

  update() {
    const speed = 200;
    const jumpPower = 400;
    this.player.setVelocityX(0); 

    this.controls.update();
  }

  returnToHub() {
    this.scene.start('HubScene');
  }
}