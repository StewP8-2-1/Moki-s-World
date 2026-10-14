import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';
import { PlatformerController } from '../GameControllers';
import { ReqworksData } from '../ReqworkData'; // Import the new module
import { DialogueUI } from '../DialogueUI';

export class GalleryScene extends Phaser.Scene {
    
  constructor() {
    super('GalleryScene');
  }

  preload() {
    this.load.spritesheet('player-side', 'Moki (side).png', {
      frameWidth: 512,
      frameHeight: 512
    });

     // 1. Dynamically Load the gallery artwork from our module
       ReqworksData.forEach(art => {
         this.load.image(art.key, art.imagePath);
       });
    
  }

  create() {

    // 1. Expand the Game World dynamically
    const { width: worldWidth, height: worldHeight } = GAME_CONFIG.worlds.gallery; 
    
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
    this.player = this.physics.add.sprite(170, 538, 'player-side');
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
        // INITIALIZE EXTERNAL DIALOGUE UI
        // ==========================================
        this.dialogueUI = new DialogueUI(this, { 
          // Let's subtract 40 from width so it doesn't touch the very edges of the screen
          width: this.cameras.main.width + 10, 
          height: 140, 
          paddingTop: 20, 
          titleSpacing: 0,
          bottomMargin: 140 // Space from the bottom edge of the screen
        });

       // ==========================================
    // ADD GALLERY ARTWORK & INTERACTION
    // ==========================================
    ReqworksData.forEach(art => {
      const artImage = this.add.image(art.x, art.y, art.key);
      const scale = art.size / Math.max(artImage.width, artImage.height);
      
      artImage.setScale(scale)
          .setDepth(-1)
          .setInteractive({ useHandCursor: true });

      // Hover In
      artImage.on('pointerover' , () => {
        if (!this.isDialogueLocked) {
          this.dialogueUI.show(art); 
        }
      });

      // Hover Out
      artImage.on('pointerout', () => {
        if (!this.isDialogueLocked) {
          this.dialogueUI.hide();
        }
      });

      // Click to lock and pan camera
      artImage.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation(); 
        this.isDialogueLocked = true;
        this.dialogueUI.show(art); 
        
        // 1. Stop following the player
        this.cameras.main.stopFollow();
        
        // 2. Pan to the artwork (x, y, duration in ms, easing function)
        this.cameras.main.pan(artImage.x, artImage.y + 70, 500, 'Power2');
      });
    });

    // Global click listener to close the dialogue box and return camera
    this.input.on('pointerdown', () => {
      if (this.isDialogueLocked) {
        this.isDialogueLocked = false;
        this.dialogueUI.hide();

        // 1. Pan back to the player
        this.cameras.main.pan(this.player.x, this.player.y, 1000, 'Power2', false, (camera, progress) => {
          // 2. Once the pan is 100% complete, resume following the player
          if (progress === 1) {
            camera.startFollow(this.player, true, 0.1, 0.1);
          }
        });
      }
    });

    // ==========================================
    // INITIALIZE PLATFORMER CONTROLS HERE
    // Pass 'this' (the scene), the player sprite, speed (200), and jump power (400)
    // ==========================================
    this.controls = new PlatformerController(this, this.player, 200, 400);

    // 3. Register the Dialogue container to sync with Zoom!
    this.controls.registerDialogueBox(this.dialogueUI.container);

    // 2. Generate the settings menu automatically
    this.controls.createBurgerMenu();

    // ==========================================
    // PORTAL SETUP
    // ==========================================
    this.hubPortal = this.physics.add.staticSprite(75, 500, 'portal').setScale(0.5); // Far left and down
    this.hubPortal.setDepth(0);

    // 1. ADJUST THE HITBOX SIZE AND POSITION
    // setSize(width, height) defines the actual pixel dimensions of the overlap area
    this.hubPortal.setSize(100, 100); 
    
    // setOffset(x, y) shifts the hitbox relative to the top-left of the unscaled texture
    this.hubPortal.setOffset(50, 50);

    this.add.text(80, 450, 'Return to Moki\'s Hub', { 
      fontSize: '16px', fill: '#000000', fontFamily: 'Arial', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.physics.add.overlap(this.player, this.hubPortal, this.returnToHub, null, this); // Adjust the size of the overlap area

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