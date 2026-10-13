import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';
import { PlatformerController } from '../GameControllers';
import { ArtworksData } from '../ArtworkData'; // Import the new module
import { DialogueUI } from '../DialogueUI'; // Import the new UI module

export class ArtworkScene extends Phaser.Scene {
    
  constructor() {
    super('ArtworkScene');
    this.isDialogueLocked = false; // Tracks if the dialogue box is pinned by a click
  }

  preload() {
    this.load.spritesheet('player-side', 'Moki (side).png', {
      frameWidth: 512,
      frameHeight: 512
    });

    // 1. Dynamically Load the gallery artwork from our module
    ArtworksData.forEach(art => {
      this.load.image(art.key, art.imagePath);
    });
    
  }

  create() {
    const { width: worldWidth, height: worldHeight } = GAME_CONFIG.worlds.gallery; 
    
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.physics.world.gravity.y = 600;

    // ==========================================
    // PARALLAX BACKGROUND LAYERS
    // ==========================================
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
    this.player = this.physics.add.sprite(175, 538, 'player-side');
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
    // You can now easily change the dialogue box parameters here without breaking text alignment
    this.dialogueUI = new DialogueUI(this, { 
      width: this.cameras.main.width, 
      height: 140, 
      paddingTop: 20, 
      titleSpacing: 0,
      bottomMargin: 140 // Space from the bottom edge of the screen
    });

    // ==========================================
    // ADD GALLERY ARTWORK & INTERACTION
    // ==========================================
    ArtworksData.forEach(art => {
      const artImage = this.add.image(art.x, art.y, art.key);

       // 1. Calculate the scale factor based on the largest side of the original image
      const scale = art.size / Math.max(artImage.width, artImage.height);
      
      // 2. Use setScale() instead of setDisplaySize()
      artImage.setScale(scale)
          .setDepth(-1)
          .setInteractive({ useHandCursor: true });

      // Hover In
      artImage.on('pointerover' , () => {
        if (!this.isDialogueLocked) {
          // Pass the data and the calculated X/Y coordinates to place it above the artwork
          this.dialogueUI.show(art, this.cameras.main.width / 2, artImage.y - (art.size / 2) - 15);
        }
      });

      // Hover Out
      artImage.on('pointerout', () => {
        if (!this.isDialogueLocked) {
          this.dialogueUI.hide();
        }
      });

      // Click to lock
      artImage.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation(); 
        this.isDialogueLocked = true;
        const targetY = artImage.y - (art.size / 2) - 15;
        this.dialogueUI.show(art, this.cameras.main.width / 2, artImage.y - (art.size / 2) - 15);

      });

    });

    // Global click listener to close the dialogue box
    this.input.on('pointerdown', () => {
      if (this.isDialogueLocked) {
        this.isDialogueLocked = false;
        this.dialogueUI.hide();
      }
    });

    // ==========================================
    // INITIALIZE PLATFORMER CONTROLS HERE
    // ==========================================
    this.controls = new PlatformerController(this, this.player, 200, 400);

     // 3. Register the Dialogue container to sync with Zoom!
    this.controls.registerDialogueBox(this.dialogueUI.container);
    
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

    this.physics.add.overlap(this.player, this.hubPortal, this.returnToHub, null, this);
  }

  update() {
    this.player.setVelocityX(0); 
    this.controls.update();
  }

  returnToHub() {
    this.scene.start('HubScene');
  }


}