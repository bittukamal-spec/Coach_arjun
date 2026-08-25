// Test-only resolution target for the `virtual:pwa-register/react` Vite
// virtual module (vite-plugin-pwa). VitePWA is deliberately NOT loaded in
// vitest.config.js (see that file's own comment), so this bare specifier
// has nothing to resolve to during Vite's import-analysis pass unless
// aliased here. Every real test then overrides this via
// `vi.mock('virtual:pwa-register/react', ...)` — this file's own export
// is only a safety-net default, never exercised when a test mocks it.
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  };
}
