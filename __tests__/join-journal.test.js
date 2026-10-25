/**
 * Jest tests for the join journal - what the renderer notes about join
 * attempts and hands to the main process to write
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import joinJournal from "../src/game/join-journal.js";
import gsiManager from "../src/game/gsi-manager.js";
import { JOIN_JOURNAL_CONFIG } from "../src/shared/constants.js";

const USER = "76561198000000001";
const OTHER = "76561198000000002";

const menuState = () => ({
  provider: { steamid: USER },
  player: { steamid: USER, activity: "menu" },
});

const matchState = (extra = {}) => ({
  provider: { steamid: USER },
  map: { name: "de_dust2", mode: "casual", phase: "live", round: 3 },
  player: { steamid: USER, activity: "playing", team: "CT" },
  ...extra,
});

describe("join journal", () => {
  let append;

  /** Every event handed to the main process so far */
  const written = () =>
    append.mock.calls.flatMap(([lines]) => lines).map((line) => JSON.parse(line));
  const gsiEvents = () => written().filter(({ event }) => event === "gsi");

  beforeEach(() => {
    jest.useFakeTimers();
    joinJournal.reset();
    gsiManager.reset();
    append = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = { joinJournal: { append } };
  });

  afterEach(() => {
    joinJournal.reset();
    gsiManager.reset();
    gsiManager.listeners.clear();
    jest.useRealTimers();
    delete global.window.electronAPI;
  });

  test("buffers events and hands them over in one batch", async () => {
    joinJournal.record("connect", { join: OTHER });
    joinJournal.record("snapshot", { join: OTHER });
    expect(append).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(JOIN_JOURNAL_CONFIG.FLUSH_MS);

    expect(append).toHaveBeenCalledTimes(1);
    expect(written().map(({ event }) => event)).toEqual(["connect", "snapshot"]);
    expect(written()[0]).toEqual({ t: expect.any(Number), event: "connect", join: OTHER });
  });

  test("a full buffer is handed over at once", async () => {
    for (let i = 0; i < JOIN_JOURNAL_CONFIG.MAX_LINES_PER_APPEND; i++) {
      joinJournal.record("snapshot", { i });
    }
    await jest.advanceTimersByTimeAsync(0);

    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0][0]).toHaveLength(JOIN_JOURNAL_CONFIG.MAX_LINES_PER_APPEND);
  });

  test("without the bridge nothing is written and nothing piles up", async () => {
    delete global.window.electronAPI;
    joinJournal.record("connect", { join: OTHER });

    await expect(joinJournal.flush()).resolves.toBeUndefined();
    expect(joinJournal.buffer).toEqual([]);
  });

  test("an attempt is noted as ended once, whatever ends it later", async () => {
    joinJournal.attemptStarted(OTHER);
    joinJournal.attemptEnded(OTHER, "joined");
    joinJournal.attemptEnded(OTHER, "cancelled");
    joinJournal.attemptEnded("never-started", "cancelled");
    await joinJournal.flush();

    expect(written().map(({ event, reason }) => [event, reason])).toEqual([
      ["attempt-start", undefined],
      ["attempt-end", "joined"],
    ]);
  });

  test("notes CS2's states while an attempt runs and for a while after", async () => {
    joinJournal.initialize();
    gsiManager.handlePayload(menuState());

    joinJournal.attemptStarted(OTHER);
    jest.advanceTimersByTime(1000);
    gsiManager.handlePayload(matchState());
    joinJournal.attemptEnded(OTHER, "joined");

    jest.advanceTimersByTime(JOIN_JOURNAL_CONFIG.TRAIL_MS - 1000);
    gsiManager.handlePayload(matchState());
    jest.advanceTimersByTime(2000);
    gsiManager.handlePayload(matchState());
    await joinJournal.flush();

    expect(gsiEvents()).toHaveLength(2);
    expect(gsiEvents()[0]).toMatchObject({
      map: "de_dust2",
      mode: "casual",
      phase: "live",
      round: 3,
      activity: "playing",
      player: USER,
      team: "CT",
      listed: 0,
    });
  });

  test("outside attempts notes only a change in how many players CS2 lists", async () => {
    joinJournal.initialize();
    const listing = (...ids) =>
      matchState({ allplayers: Object.fromEntries(ids.map((id) => [id, {}])) });

    for (const state of [
      matchState(),
      listing(USER, OTHER),
      listing(USER, OTHER),
      matchState(),
    ]) {
      jest.advanceTimersByTime(500);
      gsiManager.handlePayload(state);
    }
    await joinJournal.flush();

    expect(gsiEvents().map(({ listed }) => listed)).toEqual([2, 0]);
  });

  test("CS2 going quiet is not a new state", async () => {
    joinJournal.attemptStarted(OTHER);
    gsiManager.handlePayload(menuState());

    // The stale timer tells listeners that CS2 stopped posting
    jest.advanceTimersByTime(60000);
    await joinJournal.flush();

    expect(gsiEvents()).toHaveLength(1);
  });
});
