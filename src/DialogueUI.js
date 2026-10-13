export class DialogueUI {
  constructor(scene, config = {}) {
    this.scene = scene;

    // Configurable parameters with defaults
    this.boxWidth = config.width || 250;
    this.boxHeight = config.height || 140;
    
    // Variables for padding and position
    this.paddingTop = config.paddingTop || 15;
    this.paddingSide = config.paddingSide || 20;
    this.titleSpacing = config.titleSpacing || 30;
    this.bottomMargin = config.bottomMargin || 20; // NEW: Space from the bottom edge

    this.container = null;
    this.titleText = null;
    this.descText = null;

    this.createDialogueBox();
  }

  createDialogueBox() {
    const cam = this.scene.cameras.main;
    
    // NEW: Set exact screen coordinates once (center X, bottom Y)
    const screenX = cam.width / 2;
    const screenY = cam.height - this.bottomMargin;

    this.container = this.scene.add.container(screenX, screenY)
      .setDepth(100)
      .setScrollFactor(0) 
      .setVisible(false);

    // Keep it on the UI camera
    const uiCam = this.scene.cameras.getCamera('UI_CAM');
    if (uiCam) {
        this.scene.cameras.main.ignore(this.container);
    }

    // UPDATED: Origin (0.5, 1) means the rectangle grows UPWARDS from the bottom
    const bg = this.scene.add.rectangle(0, 0, this.boxWidth, this.boxHeight, 0x000000, 0.85).setOrigin(0.5, 1);
    bg.setStrokeStyle(2, 0xffffff);

    // Because the container is at the bottom, local Y coordinates for top elements need to be negative
    const titleY = -this.boxHeight + this.paddingTop;
    const descY = titleY + this.titleSpacing;
    const wrapWidth = this.boxWidth - (this.paddingSide * 2);

    this.titleText = this.scene.add.text(0, titleY, '', {
      fontSize: '18px', fill: '#ffffff', fontStyle: 'bold', align: 'center', 
      wordWrap: { width: wrapWidth }
    }).setOrigin(0.5, 0);

    this.descText = this.scene.add.text(0, descY + 10, '', {
      fontSize: '14px', fill: '#cccccc', align: 'center', 
      wordWrap: { width: wrapWidth }
    }).setOrigin(0.5, 0);

    this.container.add([bg, this.titleText, this.descText]);
  }

  // UPDATED: Now only requires the artData, no position tracking needed
  show(artData) {
    this.titleText.setText(artData.title);
    this.descText.setText(artData.description);
    this.container.setVisible(true);
  }

  hide() {
    this.container.setVisible(false);
  }
}