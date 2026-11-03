/**
 * @jest-environment jsdom
 *
 * Jest tests for what the tutorial tells the app: when it starts and stops
 */

jest.mock("../src/ui/tutorial/tutorial-templates.js", () => ({
  __esModule: true,
  TUTORIAL_TEMPLATES: {
    getSteps: () =>
      Array.from({ length: 10 }, (_, i) => ({
        title: `step ${i}`,
        content: "",
        target: null,
        icon: "",
      })),
    MODAL_CONTENT: () => "",
  },
}));
jest.mock("../src/ui/account-view.js", () => ({
  __esModule: true,
  default: { open: jest.fn(), close: jest.fn() },
}));
jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: { getJoinStates: jest.fn(() => ({})), isActive: () => false },
}));
jest.mock("../src/game/map-keeper.js", () => ({
  __esModule: true,
  default: { getLabel: () => "", userCancelled: jest.fn() },
}));
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

import tutorialManager from "../src/ui/tutorial/tutorial-manager.js";

let off;

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  off = [];
});

afterEach(() => {
  tutorialManager.stop();
  off.forEach((unsubscribe) => unsubscribe());
  jest.useRealTimers();
});

/** Hear the tutorial for the rest of the test */
function listen(listener) {
  const heard = [];
  off.push(
    tutorialManager.onChange((active) => {
      heard.push(active);
      if (listener) listener(active);
    })
  );
  return heard;
}

test("tells its listeners true when it starts and false when it stops", async () => {
  const heard = listen();

  await tutorialManager.start();
  expect(tutorialManager.isActive).toBe(true);
  expect(heard).toEqual([true]);

  tutorialManager.stop();
  expect(tutorialManager.isActive).toBe(false);
  expect(heard).toEqual([true, false]);
});

test("says nothing on a start while running or a stop while stopped", async () => {
  const heard = listen();

  await tutorialManager.start();
  await tutorialManager.start();
  tutorialManager.stop();
  tutorialManager.stop();

  expect(heard).toEqual([true, false]);
});

test("a failing listener does not stop the others", async () => {
  off.push(
    tutorialManager.onChange(() => {
      throw new Error("boom");
    })
  );
  const heard = listen();

  await tutorialManager.start();

  expect(heard).toEqual([true]);
});
