import Phaser from 'phaser';

export class HubScene extends Phaser.Scene {
  constructor() {
    super('HubScene');
  }

  preload() {
    // Note: You will need to load your images here or in main.js
   this.load.spritesheet('player', 'public/Moki TYB.png', {
      frameWidth: 512,
      frameHeight: 512
    });

    this.load.spritesheet('playerFront', 'public/Moki TYB Front.png', {
      frameWidth: 512,
      frameHeight: 512
    });
    
    // this.load.image('portal', 'path/to/portal.png');
    // this.load.image('clouds', 'path/to/clouds.png');
  }

  create() {
    this.physics.world.gravity.y = 0;

    // 1. Expand the Game World
    // The canvas is 800x600, but the world is now 2000x2000
    const worldWidth = 900;
    const worldHeight = 900;
    
    // Tell the physics engine the new boundaries
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

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
    
    // 3. Setup WASD Keys instead of Cursor Keys
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    // Alternatively, if each frame represents a specific direction:
    // Frame 0 = down, Frame 1 = up, Frame 2 = left, Frame 3 = right
    this.anims.create({
      key: 'face-down',
      frames: [{ key: 'player', frame: 0 }],
      frameRate: 4
    });


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

    // Setup controls and overlaps
    this.cursors = this.input.keyboard.createCursorKeys();
    
    this.physics.add.overlap(this.player, this.makiPortal, this.enterGallery, null, this);
    this.physics.add.overlap(this.player, this.merchPortal, this.enterMerch, null, this);
    
  }

  update() {
    const speed = 300; // Increased speed for the larger map
    this.player.setVelocity(0);

    // 4-Way Movement
    if (this.cursors.left.isDown) this.player.setVelocityX(-speed);
    else if (this.cursors.right.isDown) this.player.setVelocityX(speed);

    if (this.cursors.up.isDown) this.player.setVelocityY(-speed);
    else if (this.cursors.down.isDown) this.player.setVelocityY(speed);

    let isMoving = false;
    let isMovingDown = false;

    // Left/Right Movement
    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true); // Flips the sprite horizontally when walking left
      isMoving = true;
    } 
    else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false); // Resets the flip when walking right
      isMoving = true;
    }

    // Up/Down Movement
    if (this.cursors.up.isDown) {
      this.player.setVelocityY(-speed);
      isMovingDown = true;
    } 
    else if (this.cursors.down.isDown) {
      this.player.setVelocityY(speed);
      isMoving = true;
    }

    // Left/Right Movement (A and D)
    if (this.keys.left.isDown && !(this.keys.up.isDown || this.keys.down.isDown)) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(false); // Face LEFT (Default)
      isMovingDown = true;
    } 
    else if (this.keys.right.isDown && !(this.keys.up.isDown || this.keys.down.isDown)) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(true); 
      isMovingDown = true;
    }

    // Up/Down Movement (W and S)
    if (this.keys.up.isDown) {
      this.player.setVelocityY(-speed);
      isMoving = true;
    } 
    else if (this.keys.down.isDown || (this.keys.down.isDown && this.keys.left.isDown) || (this.keys.down.isDown && this.keys.right.isDown)) {
      this.player.setVelocityY(speed);
      isMovingDown = true;
    }

    // 4. Play or Stop the Animation
    if (isMoving) {
      // The 'true' argument is critical: it tells Phaser NOT to restart the animation if it's already playing
      this.player.anims.play('walk', true); 
    } else if (isMovingDown) {
         this.player.anims.play('walk-down', true); 
    }
    else {
      this.player.anims.stop();
      this.player.setFrame(0); // Resets to the top-left frame when standing still
    }

    // Optional: Add ambient movement to the parallax layer
    // This makes the clouds slowly drift across the screen even when the player stands still
    if (this.overheadClouds) {
        this.overheadClouds.x -= 0.2;
    }
  }

  enterGallery() {
    this.scene.start('GalleryScene');
  }

  enterMerch() {
    // this.scene.start('MerchScene');
  }
}