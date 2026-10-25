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

// Mock window object
global.window = {
  open: () => {},
  location: {
    href: "http://localhost",
  },
};

// Mock document object for DOM operations
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

// Mock logger if needed
global.logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {},
};
