import Phaser from 'phaser';
import { HubScene } from './HubScene';
import { GalleryScene } from './GalleryScene';

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'game-container', // Matches the div ID in index.html
  backgroundColor: '#ffffff',

  // ADD THIS SCALE CONFIGURATION
  scale: {
    // FIT maintains aspect ratio and scales the canvas to fit the window
    mode: Phaser.Scale.FIT, 
    // Centers the game canvas both horizontally and vertically
    autoCenter: Phaser.Scale.CENTER_BOTH, 
    // Your base game resolution (Phaser scales this up or down)
    width: 800,  
    height: 600
  },

  physics: {
    default: 'arcade',
    arcade: {
      debug: false // Turn this to false when you publish
    }
  },
  scene: [HubScene, GalleryScene] // HubScene loads first
};

const game = new Phaser.Game(config);