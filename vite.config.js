import { defineConfig } from 'vite';

// GitHub Pages deploys to: https://<user>.github.io/<repo>/
// Set VITE_BASE env var to '/' for custom domains or root deployments.
// Default '/firework/' matches the GitHub repo name.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/firework/',
  build: {
    target: 'es2015',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
