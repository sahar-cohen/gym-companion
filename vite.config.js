import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE is set by the GitHub Pages workflow (e.g. "/gym/"). Vercel and local use "/".
const base = process.env.BASE || '/';

export default defineConfig({
  base,
  build: { chunkSizeWarningLimit: 900 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Gym Companion',
        short_name: 'Gym',
        description: 'Follow your workout exercise by exercise.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0F1012',
        theme_color: '#0F1012',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
