import Phaser from 'phaser';
import { HubScene } from './HubScene';
import { GalleryScene } from './GalleryScene';
import { GAME_CONFIG } from './constants'; 

const config = {
  type: Phaser.AUTO,
  parent: 'game-container', // Matches the div ID in index.html
  backgroundColor: '#ffffff',

  // ADD THIS SCALE CONFIGURATION
  scale: {
    // FIT maintains aspect ratio and scales the canvas to fit the window
    mode: Phaser.Scale.FIT, 

    // Centers the game canvas both horizontally and vertically
    autoCenter: Phaser.Scale.CENTER_BOTH, 

    // Your base game resolution (Phaser scales this up or down)
    width: GAME_CONFIG.width,  
    height: GAME_CONFIG.height
  },

  physics: { 
    default: 'arcade', 
    arcade: {
      gravity: { y: 0 },
      debug: false // Change to true to see hitboxes
    }
  },
  scene: [HubScene, GalleryScene] // HubScene loads first
};

const game = new Phaser.Game(config);