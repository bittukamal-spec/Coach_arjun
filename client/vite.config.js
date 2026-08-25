import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate'): a new service worker installs and
      // stays WAITING instead of silently skip-waiting + clients-claiming
      // itself in. AppUpdatePrompt.jsx (useRegisterSW) is what turns that
      // waiting worker into a visible "Arjun has an update" prompt and
      // activates it only on the athlete's own Refresh now tap.
      registerType: 'prompt',
      includeAssets: [
        'favicon.ico',
        'brand/arjun/favicon-16.png',
        'brand/arjun/favicon-32.png',
        'brand/arjun/favicon-48.png',
        'brand/arjun/apple-touch-icon-180.png',
      ],
      manifest: {
        name: 'Arjun — Mental Coach',
        short_name: 'Arjun',
        description: 'AI mental performance coaching for Indian athletes. Build focus, resilience, and confidence.',
        theme_color: '#185FA5',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['health', 'fitness', 'sports'],
        icons: [
          { src: 'brand/arjun/pwa-icon-192.png',          sizes: '192x192', type: 'image/png' },
          { src: 'brand/arjun/pwa-icon-512.png',          sizes: '512x512', type: 'image/png' },
          { src: 'brand/arjun/pwa-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
