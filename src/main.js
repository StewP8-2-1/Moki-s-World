import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';
import { HudScene } from './scenes/HudScene';
import { GAME_CONFIG } from './constants';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container', // Matches the div ID in index.html
  backgroundColor: '#ffffff',

  scale: {
    // FIT maintains aspect ratio and scales the canvas to fit the window
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.NO_CENTER, // CSS flexbox centres the canvas
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
  },

  // Relative asset paths (legacy files in /public) resolve against the deploy base
  loader: { baseURL: import.meta.env.BASE_URL },

  // Mouse + 3 touch pointers (pinch-zoom while holding a button). Set once here: calling
  // input.addPointer() from a scene added more pointers on every scene restart.
  input: { activePointers: 3 },

  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },

  // Boot loads the world (API or bundled fallback), then starts the data-driven World scene,
  // which launches the screen-space HUD on top of itself
  scene: [BootScene, WorldScene, HudScene],
};

const game = new Phaser.Game(config);

// Dev-only handle for debugging and automated smoke tests (stripped from production builds)
if (import.meta.env.DEV) window.__game = game;
