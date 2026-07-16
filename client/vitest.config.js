import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate from vite.config.js (which pulls in VitePWA — unnecessary and
// noisy for tests) and from the pre-existing node:test source-text suite
// (test/**/*.test.js). This config only picks up *.dom.test.jsx files.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['test/**/*.dom.test.jsx'],
    setupFiles: ['./test/setupDom.js'],
    globals: false,
  },
});
