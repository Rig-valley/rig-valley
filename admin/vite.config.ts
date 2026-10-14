import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // Production: served by the game server under /admin/ (same origin as the game and API).
  base: command === 'build' ? '/admin/' : '/',
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false } },
  },
}));
