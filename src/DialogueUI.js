import Phaser from 'phaser';

const MIN_TOUCH = 44; // px, minimum touch-target size for buttons

/**
 * Dialogue box for paintings / promos. Lives in HudScene (screen space, never zoomed).
 *
 * - Sized to its content (title, description, optional CTA button), clamped to `maxHeightRatio`
 *   of the screen; an over-long description is truncated with "…".
 * - Placed at the bottom of the screen, or at the top when the thing it describes would be hidden
 *   under it (`show(data, { placement })`). The bottom position respects a safe area so it never
 *   covers on-screen touch controls (`setSafeArea`).
 * - Its background swallows clicks so they never fall through to the world; ✕ closes it.
 */
export class DialogueUI {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ margin?: number, padding?: number, gap?: number, maxHeightRatio?: number,
   *           topReserve?: number, onClose?: () => void }} [config]
   */
  constructor(scene, config = {}) {
    this.scene = scene;
    this.margin = config.margin ?? 12;
    this.padding = config.padding ?? 16;
    this.gap = config.gap ?? 8;
    this.maxHeightRatio = config.maxHeightRatio ?? 0.45;
    this.topReserve = config.topReserve ?? 56; // keeps the top placement clear of the ☰ button
    this.onClose = config.onClose ?? (() => this.hide());

    this.safe = { left: 0, right: 0, bottom: 0 };
    this.data = null;
    this.placement = 'bottom';
    this.keyHint = '';
    this.rect = new Phaser.Geom.Rectangle();

    this.build();
  }

  build() {
    const s = this.scene;
    this.container = s.add.container(0, 0).setDepth(100).setVisible(false);

    this.bg = s.add.rectangle(0, 0, 10, 10, 0x000000, 0.85).setOrigin(0).setStrokeStyle(2, 0xffffff);
    // Swallow clicks on the box itself (HUD hits never reach the world below)
    this.bg.setInteractive();

    this.titleText = s.add.text(0, 0, '', {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold', align: 'center', fontFamily: 'Arial',
      wordWrap: { width: 100, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    this.descText = s.add.text(0, 0, '', {
      fontSize: '14px', color: '#cccccc', align: 'center', fontFamily: 'Arial', lineSpacing: 2,
      wordWrap: { width: 100, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);

    // ✕ close button (44×44 hit area around a small glyph)
    this.closeHit = s.add.rectangle(0, 0, MIN_TOUCH, MIN_TOUCH, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    this.closeText = s.add.text(0, 0, '✕', { fontSize: '20px', color: '#ffffff', fontFamily: 'Arial' }).setOrigin(0.5);
    this.closeHit.on('pointerover', () => this.closeText.setColor('#ffd84d'));
    this.closeHit.on('pointerout', () => this.closeText.setColor('#ffffff'));
    this.closeHit.on('pointerup', () => this.onClose());

    // Call-to-action button (promo objects)
    this.ctaBg = s.add.rectangle(0, 0, 10, MIN_TOUCH, 0xffd84d).setInteractive({ useHandCursor: true });
    this.ctaText = s.add.text(0, 0, '', { fontSize: '16px', color: '#000000', fontStyle: 'bold', fontFamily: 'Arial' }).setOrigin(0.5);
    this.ctaBg.on('pointerover', () => this.ctaBg.setFillStyle(0xffe680));
    this.ctaBg.on('pointerout', () => this.ctaBg.setFillStyle(0xffd84d));
    this.ctaBg.on('pointerdown', () => this.ctaBg.setFillStyle(0xe6b800));
    this.ctaBg.on('pointerup', () => { this.ctaBg.setFillStyle(0xffe680); this.activateCta(); });

    this.container.add([this.bg, this.titleText, this.descText, this.closeHit, this.closeText, this.ctaBg, this.ctaText]);
  }

  get visible() {
    return this.container.visible;
  }

  get hasCta() {
    return Boolean(this.data?.ctaLabel && /^https?:\/\//i.test(this.data?.ctaUrl || ''));
  }

  /**
   * @param {{ title?: string, description?: string, ctaLabel?: string, ctaUrl?: string }} data
   * @param {{ placement?: 'bottom' | 'top' }} [opts]
   */
  show(data, opts = {}) {
    this.data = data;
    this.placement = opts.placement ?? 'bottom';
    this.ctaBlocked = false;
    this.layout();
    this.container.setVisible(true);
  }

  hide() {
    this.data = null;
    this.container.setVisible(false);
  }

  /** Screen-space area reserved by touch controls; the bottom placement stays clear of it. */
  setSafeArea({ left = 0, right = 0, bottom = 0 } = {}) {
    this.safe = { left, right, bottom };
    if (this.visible) this.layout();
  }

  /** Small key/button glyph shown on the CTA (e.g. "E"), so keyboard/gamepad players know how to press it. */
  setKeyHint(hint) {
    if ((hint || '') === this.keyHint) return;
    this.keyHint = hint || '';
    if (this.visible) this.layout();
  }

  /** How much of the screen the box covers, and from which edge (used to frame the camera around it). */
  getCoverage() {
    if (!this.visible) return { edge: 'bottom', size: 0 };
    const h = this.scene.cameras.main.height;
    return this.placement === 'top'
      ? { edge: 'top', size: this.rect.bottom }
      : { edge: 'bottom', size: h - this.rect.top };
  }

  /** Opens the CTA link. Returns false when there is no CTA. */
  activateCta() {
    if (!this.hasCta) return false;
    const win = window.open(this.data.ctaUrl, '_blank');
    if (win) {
      win.opener = null;
    } else if (!this.ctaBlocked) {
      // Popup blocked (e.g. triggered from a gamepad, which isn't a browser "user gesture")
      this.ctaBlocked = true;
      this.layout();
    }
    return true;
  }

  // ---------- layout ----------

  layout() {
    if (!this.data) return;
    const cam = this.scene.cameras.main;
    const { margin, padding, gap } = this;

    // Bottom placement fits between the touch-control clusters; top placement uses the full width
    const useSafe = this.placement === 'bottom';
    const left = margin + (useSafe ? this.safe.left : 0);
    const right = cam.width - margin - (useSafe ? this.safe.right : 0);
    const width = Math.max(220, right - left);
    const innerW = width - padding * 2 - MIN_TOUCH; // leaves room for ✕ on the right
    const cx = width / 2;

    const title = this.data.title || '';
    const desc = this.data.description || '';
    this.titleText.setWordWrapWidth(innerW).setText(title).setVisible(Boolean(title));
    this.descText.setWordWrapWidth(innerW).setText(desc).setVisible(Boolean(desc));

    let ctaH = 0;
    if (this.hasCta) {
      const hint = this.keyHint ? `   [${this.keyHint}]` : '';
      this.ctaText.setText(this.ctaBlocked ? 'Tap to open ↗' : `${this.data.ctaLabel} ↗${hint}`);
      this.ctaBg.setSize(Math.max(MIN_TOUCH * 2, this.ctaText.width + 28), MIN_TOUCH);
      this.ctaBg.input.hitArea.setTo(0, 0, this.ctaBg.width, this.ctaBg.height);
      ctaH = MIN_TOUCH;
    }
    this.ctaBg.setVisible(ctaH > 0);
    this.ctaText.setVisible(ctaH > 0);

    // Clamp the height: truncate the description to the lines that fit
    const maxH = Math.floor(cam.height * this.maxHeightRatio);
    const titleH = title ? this.titleText.height : 0;
    const fixedH = padding * 2 + titleH + (title && desc ? gap : 0) + (ctaH ? gap + ctaH : 0);
    let descH = desc ? this.descText.height : 0;
    if (desc && fixedH + descH > maxH) {
      const lines = this.descText.getWrappedText(desc);
      const lineH = descH / Math.max(1, lines.length);
      const fit = Math.max(1, Math.floor((maxH - fixedH) / lineH));
      if (fit < lines.length) {
        const kept = lines.slice(0, fit);
        kept[fit - 1] = `${kept[fit - 1].replace(/\s*\S{0,3}$/, '')}…`;
        this.descText.setText(kept.join('\n'));
        descH = this.descText.height;
      }
    }
    const height = Math.max(MIN_TOUCH + padding, fixedH + descH);

    // Stack the content top-down
    let y = padding;
    if (title) { this.titleText.setPosition(cx, y); y += titleH + (desc ? gap : 0); }
    if (desc) { this.descText.setPosition(cx, y); y += descH; }
    if (ctaH) { y += gap; this.ctaBg.setPosition(cx, y + ctaH / 2); this.ctaText.setPosition(cx, y + ctaH / 2); }

    this.bg.setSize(width, height);
    this.bg.input.hitArea.setTo(0, 0, width, height);
    this.closeHit.setPosition(width - MIN_TOUCH / 2, MIN_TOUCH / 2);
    this.closeText.setPosition(width - MIN_TOUCH / 2, MIN_TOUCH / 2);

    const top = this.placement === 'top'
      ? this.topReserve
      : cam.height - margin - this.safe.bottom - height;
    this.container.setPosition(left, Math.max(margin, top));
    this.rect.setTo(left, this.container.y, width, height);
  }
}
