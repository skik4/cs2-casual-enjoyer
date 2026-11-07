/**
 * Jest tests for the app's one answer to whether CS2 is open: Steam's game
 * log as the main process reads it, trusted until CS2 posts a state while
 * the log has it closed
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import cs2Process from "../src/game/cs2-process.js";

const at = (seconds, ms = 0) =>
  new Date(2026, 10, 7, 20, 0, seconds, ms).getTime();
const closed = {
  usable: true,
  seen: true,
  running: false,
  fromAppStart: false,
  startedAt: 0,
  exitedAt: 0,
};

let cs2State;
let push;

beforeEach(() => {
  cs2Process.reset();
  cs2State = { ...closed };
  push = null;
  global.window.electronAPI = {
    steamLog: {
      cs2State: jest.fn(async () => cs2State),
      onCs2State: jest.fn((callback) => {
        push = (state) => {
          cs2State = state;
          callback(state);
        };
        return jest.fn();
      }),
    },
  };
});

afterEach(() => {
  cs2Process.reset();
  delete global.window.electronAPI;
});

test("answers from the log once started, and follows what the main process tells", async () => {
  cs2State = { ...closed, running: true, fromAppStart: true, startedAt: at(0) };
  await cs2Process.start();
  expect(cs2Process.isOpen()).toBe(true);
  expect(cs2Process.openSinceAppStart()).toBe(true);

  const listener = jest.fn();
  cs2Process.onChange(listener);
  push({ ...closed, exitedAt: at(30) });

  expect(listener).toHaveBeenCalledTimes(1);
  expect(cs2Process.isOpen()).toBe(false);
  expect(cs2Process.openSinceAppStart()).toBe(false);
});

test("a state told twice is one change", async () => {
  await cs2Process.start();
  const listener = jest.fn();
  cs2Process.onChange(listener);

  push({ ...closed, running: true, startedAt: at(5) });
  push({ ...closed, running: true, startedAt: at(5) });

  expect(listener).toHaveBeenCalledTimes(1);
});

test("check reads the log at once, for an answer that cannot wait", async () => {
  await cs2Process.start();
  cs2State = { ...closed, running: true, startedAt: at(5) };

  await expect(cs2Process.check()).resolves.toBe(true);
  expect(window.electronAPI.steamLog.cs2State).toHaveBeenCalledTimes(2);
});

test("closedSince: closed in or after the second of a moment, and not open again", async () => {
  await cs2Process.start();
  push({ ...closed, exitedAt: at(10) });

  expect(cs2Process.closedSince(at(9, 500))).toBe(true);
  // A CS2 that closed posts nothing more: the same second came before
  expect(cs2Process.closedSince(at(10, 900))).toBe(true);
  expect(cs2Process.closedSince(at(11))).toBe(false);

  push({ ...closed, running: true, startedAt: at(20), exitedAt: at(10) });
  expect(cs2Process.closedSince(at(9))).toBe(false);
});

test("a log never seen closing has no close to tell", async () => {
  await cs2Process.start();

  expect(cs2Process.isOpen()).toBe(false);
  expect(cs2Process.closedSince(0)).toBe(false);
});

test("a log that has never shown CS2 tells nothing", async () => {
  cs2State = { ...closed, seen: false };
  await cs2Process.start();

  expect(cs2Process.isOpen()).toBeNull();
  expect(cs2Process.openSinceAppStart()).toBeNull();
});

test("without the log nothing is known", async () => {
  cs2State = { usable: false };
  await cs2Process.start();

  expect(cs2Process.isOpen()).toBeNull();
  expect(cs2Process.openSinceAppStart()).toBeNull();
  expect(cs2Process.closedSince(0)).toBe(false);
});

test("without the bridge, as in tests, nothing is known", async () => {
  delete global.window.electronAPI;
  await cs2Process.start();

  expect(cs2Process.isOpen()).toBeNull();
});

describe("CS2 posting while the log has it closed", () => {
  test("the log missed a start and is not used again this run", async () => {
    await cs2Process.start();
    push({ ...closed, exitedAt: at(10) });
    const listener = jest.fn();
    cs2Process.onChange(listener);

    await cs2Process.noteGameState(at(40));

    expect(cs2Process.isOpen()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    // Later states it tells change nothing
    push({ ...closed, running: true, startedAt: at(50), exitedAt: at(10) });
    expect(cs2Process.isOpen()).toBeNull();
  });

  test("a start the last look had not read yet clears it", async () => {
    await cs2Process.start();
    // The start is in the log, the push for it still to come
    cs2State = { ...closed, running: true, startedAt: at(30) };

    await cs2Process.noteGameState(at(40));

    expect(cs2Process.isOpen()).toBe(true);
  });

  test("a state from the second CS2 closed in came before the close", async () => {
    await cs2Process.start();
    push({ ...closed, exitedAt: at(10) });

    await cs2Process.noteGameState(at(10, 700));

    expect(cs2Process.isOpen()).toBe(false);
  });
});
