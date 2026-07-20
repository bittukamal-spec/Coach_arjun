// jsdom doesn't implement scrollIntoView — ChatPage auto-scrolls to the
// latest message on load/stream. A no-op is enough for DOM tests.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom doesn't implement matchMedia — useTheme() (used by Navbar on every
// page) reads it on mount. A trivial stub is enough for tests that don't
// care about actual theme switching.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
