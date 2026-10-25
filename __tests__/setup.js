/**
 * Jest setup file
 */

// Mock console to suppress logs in tests
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly needed
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: console.error, // Keep error logs for debugging
};

// The node environment has no DOM: stand-ins for window and document. Suites
// that render markup run in jsdom (@jest-environment jsdom) and keep its DOM.
if (typeof global.document === "undefined") {
  global.window = {
    open: () => {},
    location: {
      href: "http://localhost",
    },
  };

  global.document = {
    createElement: () => ({
      click: () => {},
      setAttribute: () => {},
      style: {},
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };
}

// Mock logger if needed
global.logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
};
