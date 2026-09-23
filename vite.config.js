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
        // Match the light page background: iOS 26 blurs the status-bar band
        // when it can't sample one flat colour there.
        background_color: '#f4f3ef',
        theme_color: '#f4f3ef',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,mp3}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
