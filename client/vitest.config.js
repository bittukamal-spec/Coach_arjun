import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate from vite.config.js (which pulls in VitePWA — unnecessary and
// noisy for tests) and from the pre-existing node:test source-text suite
// (test/**/*.test.js). This config only picks up *.dom.test.jsx files.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // VitePWA isn't loaded here, so this Vite virtual module (from
      // vite-plugin-pwa) has nothing to resolve to during import-analysis
      // unless aliased — appUpdatePrompt.dom.test.jsx then fully replaces
      // it per test via vi.mock('virtual:pwa-register/react', ...); this
      // stub is only the resolution target, never the real implementation.
      'virtual:pwa-register/react': fileURLToPath(new URL('./test/stubs/pwaRegisterReact.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.dom.test.jsx'],
    setupFiles: ['./test/setupDom.js'],
    globals: false,
  },
});
