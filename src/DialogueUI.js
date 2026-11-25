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

    // Lives in HudScene, whose camera never scrolls or zooms, so no scroll-factor tricks are needed
    this.container = this.scene.add.container(screenX, screenY)
      .setDepth(100)
      .setVisible(false);

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

    // Optional call-to-action button (used by promo objects)
    this.ctaText = this.scene.add.text(0, -this.paddingTop, '', {
      fontSize: '16px', fill: '#000000', backgroundColor: '#ffd84d', fontStyle: 'bold',
      padding: { x: 12, y: 6 },
    }).setOrigin(0.5, 1).setVisible(false).setInteractive({ useHandCursor: true });
    this.ctaText.on('pointerdown', (pointer, localX, localY, event) => {
      event.stopPropagation();
      if (/^https?:\/\//i.test(this.ctaUrl || '')) window.open(this.ctaUrl, '_blank', 'noopener');
    });

    this.container.add([bg, this.titleText, this.descText, this.ctaText]);
  }

  /** @param {{ title?: string, description?: string, ctaLabel?: string, ctaUrl?: string }} data */
  show(data) {
    this.titleText.setText(data.title || '');
    this.descText.setText(data.description || '');
    this.ctaUrl = data.ctaUrl;
    const hasCta = Boolean(data.ctaLabel && data.ctaUrl);
    this.ctaText.setText(hasCta ? data.ctaLabel : '').setVisible(hasCta);
    this.container.setVisible(true);
  }

  hide() {
    this.container.setVisible(false);
  }
}