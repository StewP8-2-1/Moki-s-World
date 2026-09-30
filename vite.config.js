import { defineConfig } from 'vite';

export default defineConfig({
  // REPLACE 'mokis-world' with your exact GitHub repository name
  base: '/Moki-s-World/', 
  build: {
    // This ensures your assets like images don't get compressed into unreadable formats
    assetsInlineLimit: 0 
  }
});