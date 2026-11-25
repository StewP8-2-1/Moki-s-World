import Phaser from 'phaser';
import { loadWorld, collectImageUrls, textureKey } from '../world/loadWorld.js';

/**
 * Loads the player sprites + world data (API or fallback) + every image the world references,
 * creates the player animations once, then starts WorldScene at the world's start scene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    const sheet = { frameWidth: 512, frameHeight: 512 };
    this.load.spritesheet('player', 'Moki TYB.png', sheet);
    this.load.spritesheet('playerFront', 'Moki TYB Front.png', sheet);
    this.load.spritesheet('player-side', 'Moki (side).png', sheet);
  }

  async create() {
    const { width, height } = this.cameras.main;
    const status = this.add.text(width / 2, height / 2, 'Loading Moki\'s World…', {
      fontSize: '24px', color: '#000000', fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.createAnimations();

    const draft = new URLSearchParams(window.location.search).has('draft');
    const { world, source } = await loadWorld({ draft });
    this.registry.set('world', world);
    this.registry.set('worldSource', source);
    if (world.draft) showDraftBanner();

    this.load.setCORS('anonymous'); // Blob-hosted images
    for (const url of collectImageUrls(world)) {
      const key = textureKey(url);
      if (!this.textures.exists(key)) this.load.image(key, url);
    }
    this.load.on('progress', (p) => status.setText(`Loading Moki's World… ${Math.round(p * 100)}%`));
    this.load.on('loaderror', (file) => console.warn(`[world] failed to load image ${file.src}`));
    this.load.once('complete', () => this.scene.start('World', { sceneId: world.startScene }));
    this.load.start();
  }

  createAnimations() {
    const walk = (key, texture) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(texture, { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    };
    walk('walk', 'player');
    walk('walk-down', 'playerFront');
    walk('walk-side', 'player-side');
  }
}

/** Small DOM banner so a draft preview is never mistaken for the live site. */
function showDraftBanner() {
  const bar = document.createElement('div');
  bar.textContent = 'Preview of unpublished changes. Players still see the live version.';
  Object.assign(bar.style, {
    position: 'fixed', top: '0', left: '0', right: '0', zIndex: '20', padding: '6px 12px',
    background: '#c98a12', color: '#fff', font: '600 13px system-ui, sans-serif', textAlign: 'center',
    pointerEvents: 'none',
  });
  document.body.append(bar);
}
