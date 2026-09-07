// ESLint 9 flat config.
//
// Globals are listed inline rather than pulled from the `globals` package:
// that package is only present here as a transitive dependency (v11), so
// depending on it would make linting break on the next clean install.

import js from "@eslint/js";

/** Browser/DOM globals used by the renderer. */
const browser = {
  window: "readonly",
  document: "readonly",
  console: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  fetch: "readonly",
  Response: "readonly",
  Request: "readonly",
  Headers: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Element: "readonly",
  HTMLElement: "readonly",
  HTMLInputElement: "readonly",
  Node: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  Image: "readonly",
  location: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  queueMicrotask: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  structuredClone: "readonly",
  MutationObserver: "readonly",
  ResizeObserver: "readonly",
  IntersectionObserver: "readonly",
  DOMParser: "readonly",
  XMLSerializer: "readonly",
  atob: "readonly",
  btoa: "readonly",
};

/** Node globals used by the Electron main process and preload. */
const node = {
  process: "readonly",
  require: "readonly",
  module: "writable",
  exports: "writable",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  global: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  fetch: "readonly",
};

/** Jest globals for the local test suite. */
const jest = {
  jest: "readonly",
  describe: "readonly",
  test: "readonly",
  it: "readonly",
  expect: "readonly",
  beforeAll: "readonly",
  afterAll: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "dev-scripts/**"],
  },

  js.configs.recommended,

  // Renderer: ES modules in a browser context
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: browser,
    },
    rules: {
      // The point of having a linter here: catch calls to identifiers that
      // do not exist. This is the class of bug that shipped undetected while
      // `npm run lint` was broken.
      "no-undef": "error",

      // `catch {}` is used deliberately in several best-effort paths
      // (i18n persistence, boot-time DOM work); an empty block elsewhere is
      // still worth flagging.
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Unused *arguments* are common and harmless in callback-heavy code,
      // and `catch (error) {}` appears throughout. Flag unused locals only.
      "no-unused-vars": [
        "warn",
        {
          args: "none",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Electron main process runs in Node
  {
    files: ["src/main/**/*.js"],
    languageOptions: { globals: { ...browser, ...node } },
  },

  // preload is CommonJS
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { ...browser, ...node } },
  },

  // Local test suite
  {
    files: ["__tests__/**/*.js"],
    languageOptions: { globals: { ...browser, ...node, ...jest } },
  },
];
