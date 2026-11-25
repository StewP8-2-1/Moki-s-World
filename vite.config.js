import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';
import { devApi } from './scripts/viteDevApi.js';

export default defineConfig(({ mode }) => {
  // Make .env.local (DATABASE_URL, ADMIN_PASSWORD, …) available to the dev API middleware.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    // GitHub Pages serves from /Moki-s-World/; Vercel and local dev serve from /.
    // (The GitHub Pages workflow is removed in Phase 6.)
    base: process.env.GITHUB_ACTIONS ? '/Moki-s-World/' : '/',
    plugins: [devApi()],
    build: {
      // Keep images as files (no inlining)
      assetsInlineLimit: 0,
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          admin: resolve(import.meta.dirname, 'admin.html'),
        },
      },
    },
  };
});
