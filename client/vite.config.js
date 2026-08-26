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
      // activates it only on the athlete's own Refresh now tap. This
      // client-side contract (needRefresh / updateServiceWorker) is
      // governed entirely by registerType and is unaffected by the
      // generateSW -> injectManifest switch below; only the SW-side half
      // of it (previously auto-generated) had to move into src/sw.js by
      // hand — see that file's own header comment for the exact
      // one-message-listener replication of it.
      registerType: 'prompt',
      // Push Notifications v1 needs a `push` + `notificationclick` handler
      // inside the service worker itself — generateSW has no seam for
      // arbitrary custom code, only its own structured config options.
      // injectManifest is the standard, documented way to add that: still
      // Workbox underneath (precacheAndRoute/cleanupOutdatedCaches/
      // NavigationRoute, imported as plain ES modules in src/sw.js — this
      // file gets its own separate Vite build pass), just with a
      // developer-owned source file instead of a fully generated one.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // Same file types the old generateSW `workbox.globPatterns` precached.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
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
      // `workbox` (runtimeCaching etc.) is a generateSW-only option — it is
      // silently ignored under injectManifest, so it is removed rather
      // than left here as dead/misleading config. The identical google-
      // fonts CacheFirst rule now lives as an explicit registerRoute()
      // call in src/sw.js — same cache name, same expiration, same
      // cacheable-response policy, just written directly.
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
