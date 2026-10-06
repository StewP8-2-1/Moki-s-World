import Phaser from 'phaser';
import { GAME_CONFIG } from './constants';
import { TopDownController } from './GameControllers';
  
export class HubScene extends Phaser.Scene {
  constructor() {
    super('HubScene');
  }

  preload() {
    // Note: You will need to load your images here or in main.js
   this.load.spritesheet('player', 'Moki TYB.png', {
      frameWidth: 512,
      frameHeight: 512
    });

    this.load.spritesheet('playerFront', 'Moki TYB Front.png', {
      frameWidth: 512,
      frameHeight: 512
    });

    // Load the Facebook image
    this.load.image('facebookIcon', 'Facebook.png');
    this.load.image('twitterIcon', 'Twitter.png');
    this.load.image('IGIcon', 'IG.png');
    
    // this.load.image('portal', 'path/to/portal.png');
    // this.load.image('clouds', 'path/to/clouds.png');
  }

  create() {
   

    // 1. Expand the Game World dynamically
    const { width: worldWidth, height: worldHeight } = GAME_CONFIG.worlds.hub; 
    
    // Tell the physics engine the new boundaries
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    
    this.physics.world.gravity.y = 0;

    // Optional: Add a large floor background here (Scroll factor defaults to 1)
    // this.add.tileSprite(0, 0, worldWidth, worldHeight, 'floor').setOrigin(0, 0);

    // 1. Spawn the player
    this.player = this.physics.add.sprite(400, 300, 'playerFront');
    
    // 2. Scale the player down to about 15% so it fits the screen properly
    this.player.setScale(0.25); 
    this.player.setCollideWorldBounds(true);

    // 3. Create an animation using the frames
    // (Assuming all 4 frames are a continuous walking animation)
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
      frameRate: 6, // How fast the animation plays
      repeat: -1    // -1 tells it to loop forever
    });

    this.anims.create({
      key: 'walk-down',
      frames: this.anims.generateFrameNumbers('playerFront', { start: 0, end: 3 }),
      frameRate: 6, // How fast the animation plays
      repeat: -1    // -1 tells it to loop forever
    });
    
    // ==========================================
    // INITIALIZE CONTROLS HERE
    // Pass 'this' (the scene) and the player sprite. 300 is the speed.
    // ==========================================
    this.controls = new TopDownController(this, this.player, 300);

    // 2. Generate the settings menu automatically
    this.controls.createBurgerMenu();

    // Alternatively, if each frame represents a specific direction:
    // Frame 0 = down, Frame 1 = up, Frame 2 = left, Frame 3 = right
    this.anims.create({
      key: 'face-down',
      frames: [{ key: 'player', frame: 0 }],
      frameRate: 4
    });

    // ==========================================
    //  INTERACTABLE LINKS OBJECT
    // ==========================================
    // Place it physically above the player spawn (e.g., y = 200)
    this.facebookBtn = this.add.sprite(400, 180, 'facebookIcon');
    
    // Optional: Scale it down if the raw image is too large
    this.facebookBtn.setScale(0.5); 
    
    // Make it clickable/touchable with a hand cursor on hover
    this.facebookBtn.setInteractive({ useHandCursor: true });
    
    // Open new tab on click/touch
    this.facebookBtn.on('pointerdown', () => {
      // Replace with your actual Facebook profile/page URL
      window.open('https://www.facebook.com/yyessa.v', '_blank');
    });

    // Optional label above the Facebook icon
    this.add.text(400, 100, 'Follow on Facebook!', { 
      fontSize: '18px', 
      fill: '#000000', 
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.twtBtn = this.add.sprite(200, 180, 'twitterIcon');
    
    // Optional: Scale it down if the raw image is too large
    this.twtBtn.setScale(0.5); 
    
    // Make it clickable/touchable with a hand cursor on hover
    this.twtBtn.setInteractive({ useHandCursor: true });
    
    // Open new tab on click/touch
    this.twtBtn.on('pointerdown', () => {
      // Replace with your actual Twitter profile URL
      window.open('https://twitter.com/ayessamoki', '_blank');
    });

    // Optional label above the Twitter icon
    this.add.text(200, 100, 'Follow on Twitter!', { 
      fontSize: '18px', 
      fill: '#000000', 
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.igBtn = this.add.sprite(600, 180, 'IGIcon');
    
    // Optional: Scale it down if the raw image is too large
    this.igBtn.setScale(0.5); 
    
    // Make it clickable/touchable with a hand cursor on hover
    this.igBtn.setInteractive({ useHandCursor: true });
    
    // Open new tab on click/touch
    this.igBtn.on('pointerdown', () => {
      // Replace with your actual Instagram profile URL
      window.open('https://www.instagram.com/ayessamoki', '_blank');
    });

    // Optional label above the Instagram icon
    this.add.text(600, 100, 'Follow on Instagram!', { 
      fontSize: '18px', 
      fill: '#000000', 
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5);






    // ==========================================



    // 3. Place Portals Off-Screen
    // Placing these far beyond the 800x600 starting view forces the player to explore
    this.makiPortal = this.physics.add.sprite(700, 400, 'portal'); // Far right and down
    // Label above the Maki portal
    this.add.text(700, 360, 'Cover Art Gallery', { 
      fontSize: '24px', 
      fill: '#000000', // White text
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5); // .setOrigin(0.5) centers the text perfectly over the coordinates

    this.merchPortal = this.physics.add.sprite(200, 800, 'portal'); // Straight down

    // 4. Setup the Camera
    // Restrict the camera so it doesn't show the black void outside the world limits
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    
    // Tell the camera to follow the player. 
    // The (true, 0.1, 0.1) adds a smooth, cinematic glide to the camera.
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    
    this.physics.add.overlap(this.player, this.makiPortal, this.enterGallery, null, this);
    this.physics.add.overlap(this.player, this.merchPortal, this.enterMerch, null, this);
    
  }

  update() {
    const speed = 300; // Increased speed for the larger map
    this.player.setVelocity(0);

    // Delegate the movement logic to the controller module
    this.controls.update();

  }

  enterGallery() {
    this.scene.start('GalleryScene');
  }

  enterMerch() {
    // this.scene.start('MerchScene');
  }
}