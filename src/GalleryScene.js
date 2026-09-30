import Phaser from 'phaser';

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

    // Tell the physics engine the new boundaries
    // 1. Expand the World Width
    const worldWidth = 2400; // Increased from 900
    const worldHeight = 900;

    // Tell the physics engine the new boundaries
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.physics.world.gravity.y = 600;

    // Side-scroll physics (gravity enabled)
    this.physics.world.gravity.y = 600;

 // ==========================================
    // PARALLAX BACKGROUND LAYERS
    // ==========================================
    // Layer 1: Deep Background (Moves very slowly: 20% speed)
    // Using a dark grey rectangle to represent a back wall
    this.add.rectangle(0, 0, worldWidth * 1.5, worldHeight, 0xffffff)
        .setOrigin(0, 0)
        .setDepth(-5)
        .setScrollFactor(0.2); 



    // ==========================================
    // EXPANDED PLATFORM / GROUND
    // ==========================================
    // Center X is now worldWidth / 2. Width is now worldWidth.
    const groundRect = this.add.rectangle(worldWidth / 2, 580, worldWidth, 40, 0x000000);
    this.ground = this.physics.add.existing(groundRect, true);

// ==========================================
    // PLAYER SETUP
    // ==========================================

    // FIX 2: Create a solid, visible rectangle for the player
    this.player = this.physics.add.sprite(100, 538, 'player-side');
    this.player.setScale(0.25); 
    this.player.setSize(200, 190);

    // ==========================================
    // CAMERA SETUP (REQUIRED FOR PARALLAX)
    // ==========================================
    // Stop the camera from showing the void outside the new 2400px width
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    
    // Smoothly follow the player 
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);


    this.anims.create({
      key: 'walk-side',
      frames: this.anims.generateFrameNumbers('player-side', { start: 0, end: 3 }),
      frameRate: 6,
      repeat: -1
    });

    // ==========================================
    // ADD GALLERY ARTWORK (BACKGROUND)
    // ==========================================
    const artSize = 160; // Forces all images to be 160x160 squares
    const heightOnWall = 350; // Y coordinate (lower number = higher on the wall)

    // Left Frame
    this.add.image(250, heightOnWall, 'art-news')
        .setDisplaySize(artSize, artSize)
        .setDepth(-1); // Forces it to the background

    // Center Frame
    this.add.image(450, heightOnWall, 'art-say')
        .setDisplaySize(artSize, artSize)
        .setDepth(-1);

    // Right Frame
    this.add.image(650, heightOnWall, 'art-blue')
        .setDisplaySize(artSize, artSize)
        .setDepth(-1);

    
    // Add a DYNAMIC physics body to the player
    this.physics.add.existing(this.player, false);

    // FIX 3: Prevent the player from falling out of the screen completely
    this.player.body.setCollideWorldBounds(true);

    // Enable collision between the player and the ground
    this.physics.add.collider(this.player, this.ground);

    this.cursors = this.input.keyboard.createCursorKeys();

    this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE

        });

    // 1. staticSprite makes it ignore gravity
    // 2. Positioned at X:40, Y:520 (physically behind the player and resting on the ground)
    this.hubPortal = this.physics.add.staticSprite(40, 520, 'portal');
    
    // 3. Set depth to 0 (draws under the player)
    this.hubPortal.setDepth(0);

    // Move the text to float right above the portal
    this.add.text(80, 480, 'Return to Moki\'s Hub', { 
      fontSize: '16px', // Scaled down slightly to fit better
      fill: '#000000', 
      fontFamily: 'Arial',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // Optional: Actually trigger the scene change when the player touches the portal
    this.physics.add.overlap(this.player, this.hubPortal, this.returnToHub, null, this);

  }

update() {
    const speed = 200;
    const jumpPower = 400;
    let isMoving = false; // Track if we are moving horizontally

    // We can use .setVelocityX directly on the sprite now!
    this.player.setVelocityX(0); 

    // Left/Right Movement
    if (this.cursors.left.isDown || this.keys.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.setFlipX(true); // Flip to face LEFT
      isMoving = true;
    } 
    else if (this.cursors.right.isDown || this.keys.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.setFlipX(false); // Face RIGHT (Default)
      isMoving = true;
    }

    // Jump Logic
    if (( this.keys.space.isDown) && this.player.body.touching.down) {
      this.player.setVelocityY(-jumpPower);
    }

    // Animation Logic
    if (isMoving) {
      // 'true' stops it from restarting the animation if it's already playing
      this.player.anims.play('walk-side', true); 
    } else {
      this.player.anims.stop();
      this.player.setFrame(0); // Reset to standing frame when idle
    }
  }

  // Optional: Function to handle going back to the hub
  returnToHub() {
    this.scene.start('HubScene');
  }
    
}
