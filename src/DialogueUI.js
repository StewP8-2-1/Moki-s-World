// DialogueUI.js

export class DialogueUI {
  constructor(scene, config = {}) {
    this.scene = scene;

    // Configurable parameters with defaults
    this.boxWidth = config.width || 250;
    this.boxHeight = config.height || 120;
    
    // Variables that lock the text into a fixed position relative to the box size
    this.paddingTop = config.paddingTop || 15;
    this.paddingSide = config.paddingSide || 20;
    this.titleSpacing = config.titleSpacing || 30; // Spacing between Title and Description

    this.container = null;
    this.titleText = null;
    this.descText = null;

    this.createDialogueBox();
  }

createDialogueBox() {
    // 1. ADD .setScrollFactor(0) to fix the container to the screen camera
    this.container = this.scene.add.container(0, 0)
      .setDepth(100)
      .setScrollFactor(0) 
      .setVisible(false);

    // Origin remains (0.5, 0) so the box hangs DOWN from the target Y coordinate
    const bg = this.scene.add.rectangle(0, 0, this.boxWidth, this.boxHeight, 0x000000, 0.85).setOrigin(0.5, 0);
    bg.setStrokeStyle(2, 0xffffff);

    const titleY = this.paddingTop;
    const descY = titleY + this.titleSpacing;
    const wrapWidth = this.boxWidth - (this.paddingSide * 2);

    this.titleText = this.scene.add.text(0, titleY, '', {
      fontSize: '18px', fill: '#ffffff', fontStyle: 'bold', align: 'center', 
      wordWrap: { width: wrapWidth }
    }).setOrigin(0.5, 0);

    this.descText = this.scene.add.text(0, descY, '', {
      fontSize: '14px', fill: '#cccccc', align: 'center', 
      wordWrap: { width: wrapWidth }
    }).setOrigin(0.5, 0);

    this.container.add([bg, this.titleText, this.descText]);
  }

  show(artData, targetX, targetY) {
    // Update texts
    this.titleText.setText(artData.title);
    this.descText.setText(artData.description);
    
    // Position the dialogue box directly above the target (artwork)
    this.container.setPosition(targetX, targetY);
    this.container.setVisible(true);
  }

  hide() {
    this.container.setVisible(false);
  }
}