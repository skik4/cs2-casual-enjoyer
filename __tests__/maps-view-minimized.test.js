/**
 * @jest-environment jsdom
 *
 * Jest tests for the Maps view's need of fresh servers while the window is
 * minimized. The page cannot see that itself (Electron keeps visibilityState
 * "visible" with backgroundThrottling off), so the main process reports
 * minimize and restore. An open Maps tab stops polling Steam while the
 * window is minimized; a running map join and a pinned map hold needs of
 * their own and keep the finder polling.
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logStateChange: jest.fn(),
  },
}));

import MapFinderView from "../src/ui/map-finder-view.js";
import mapFinder from "../src/game/map-finder.js";
import { MAP_FINDER_CONFIG } from "../src/shared/constants.js";

const POLL_MS = MAP_FINDER_CONFIG.REFRESH_INTERVAL_MS;

/**
 * The preload's window bridge, with the main process played by the test
 * @param {boolean} minimizedAtStart - What the main process answers first
 * @returns {{bridge: Object, report: (minimized: boolean) => void}}
 */
function windowBridge(minimizedAtStart = false) {
  const listeners = [];
  return {
    bridge: {
      minimize: jest.fn(),
      close: jest.fn(),
      isMinimized: jest.fn(async () => minimizedAtStart),
      onMinimized: jest.fn((callback) => {
        listeners.push(callback);
        return () => listeners.splice(listeners.indexOf(callback), 1);
      }),
    },
    report: (minimized) => listeners.forEach((callback) => callback(minimized)),
  };
}

const main = windowBridge();

/**
 * How many times the finder polls Steam over a stretch of time
 * @param {Object} finder - The map finder
 * @param {number} ms - How long
 * @returns {Promise<number>}
 */
async function pollsOver(finder, ms) {
  finder.refresh.mockClear();
  await jest.advanceTimersByTimeAsync(ms);
  return finder.refresh.mock.calls.length;
}

/** Let promise chains run, the finder's start included */
const settle = () => jest.advanceTimersByTimeAsync(0);

beforeAll(() => {
  window.electronAPI = { window: main.bridge };
});

afterAll(() => {
  delete window.electronAPI;
});

beforeEach(() => {
  jest.useFakeTimers();
  mapFinder.reset();
  // Each poll counted, none sent; the rows are not looked at here
  jest.spyOn(mapFinder, "refresh").mockResolvedValue();
  jest.spyOn(MapFinderView, "render").mockImplementation(() => {});
});

afterEach(async () => {
  MapFinderView.hide();
  main.report(false);
  await settle();
  mapFinder.reset();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("asks the main process once where the window stands, and listens from then on", async () => {
  MapFinderView.show();
  MapFinderView.hide();
  MapFinderView.show();
  await settle();

  expect(main.bridge.isMinimized).toHaveBeenCalledTimes(1);
  expect(main.bridge.onMinimized).toHaveBeenCalledTimes(1);
});

test("an open Maps tab stops polling while the window is minimized, and resumes on restore", async () => {
  MapFinderView.show();
  await settle();
  expect(mapFinder.active).toBe(true);
  expect(await pollsOver(mapFinder, 2 * POLL_MS)).toBe(2);

  main.report(true);
  expect(mapFinder.active).toBe(false);
  expect(await pollsOver(mapFinder, 3 * POLL_MS)).toBe(0);

  // Back with fresh servers at once, then every round as before
  main.report(false);
  expect(mapFinder.active).toBe(true);
  expect(await pollsOver(mapFinder, 0)).toBe(1);
  expect(await pollsOver(mapFinder, 2 * POLL_MS)).toBe(2);
});

test.each([
  // As app.js holds it for a map or server join, and map-keeper.js for pins
  ["a running map join", "join"],
  ["a pinned map", "keep"],
])("%s keeps the finder polling while the window is minimized", async (_, need) => {
  mapFinder.setNeed(need, true);
  MapFinderView.show();
  await settle();
  const setNeed = jest.spyOn(mapFinder, "setNeed");

  main.report(true);
  expect(mapFinder.active).toBe(true);
  expect(await pollsOver(mapFinder, 3 * POLL_MS)).toBe(3);

  // The restore adds no poll of its own to a finder that never stopped
  main.report(false);
  expect(await pollsOver(mapFinder, 0)).toBe(0);
  expect(await pollsOver(mapFinder, POLL_MS)).toBe(1);

  // The view touched its own need only
  expect(setNeed.mock.calls.map(([name]) => name)).toEqual(["view", "view"]);
  expect(setNeed.mock.calls.map(([, needed]) => needed)).toEqual([false, true]);
});

test("a closed Maps tab stays closed when the window comes back", async () => {
  MapFinderView.show();
  await settle();
  MapFinderView.hide();

  main.report(true);
  main.report(false);
  await settle();

  expect(mapFinder.active).toBe(false);
  expect(await pollsOver(mapFinder, 2 * POLL_MS)).toBe(0);
});

test("a Maps tab opened while the window is minimized waits for the restore", async () => {
  MapFinderView.show();
  await settle();
  MapFinderView.hide();
  main.report(true);

  MapFinderView.show();
  await settle();
  expect(mapFinder.active).toBe(false);

  main.report(false);
  await settle();
  expect(mapFinder.active).toBe(true);
});

test("a page reloaded in a minimized window starts out not polling", async () => {
  // A fresh page: its own view and finder, and a main process that says
  // the window is minimized already
  const reloaded = windowBridge(true);
  window.electronAPI = { window: reloaded.bridge };
  let View;
  let finder;
  jest.isolateModules(() => {
    View = require("../src/ui/map-finder-view.js").default;
    finder = require("../src/game/map-finder.js").default;
  });
  jest.spyOn(finder, "refresh").mockResolvedValue();
  jest.spyOn(View, "render").mockImplementation(() => {});

  try {
    View.show();
    await settle();
    expect(finder.active).toBe(false);
    expect(await pollsOver(finder, 2 * POLL_MS)).toBe(0);

    reloaded.report(false);
    await settle();
    expect(finder.active).toBe(true);
  } finally {
    View.hide();
    finder.reset();
    window.electronAPI = { window: main.bridge };
  }
});
