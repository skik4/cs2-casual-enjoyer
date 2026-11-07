/**
 * Jest tests for GSIManager - reading CS2 Game State Integration posts
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

import gsiManager, { interpretGsiPayload } from "../src/game/gsi-manager.js";
import cs2Process from "../src/game/cs2-process.js";
import { GSI_CONFIG, GSI_SETUP } from "../src/shared/constants.js";

const USER_ID = "76561198000000002";
const OTHER_ID = "76561198000000003";

const provider = (steamid) => ({
  name: "Counter-Strike 2",
  appid: 730,
  version: 14000,
  steamid,
  timestamp: 1761400000,
});

const menuPayload = (steamid = USER_ID) => ({
  provider: provider(steamid),
  player: { steamid, name: "me", activity: "menu" },
});

const matchPayload = (mode, name = "de_dust2", steamid = USER_ID) => ({
  provider: provider(steamid),
  map: { mode, name, phase: "live", round: 3 },
  player: { steamid, name: "me", activity: "playing" },
});

describe("interpretGsiPayload", () => {
  test("reads the main menu from a state without a map", () => {
    expect(interpretGsiPayload(menuPayload())).toEqual({
      steamId: USER_ID,
      inMatch: false,
      inMenu: true,
      mode: null,
      mapName: null,
      phase: null,
      score: null,
      activity: "menu",
      inProtectedMatch: false,
    });
  });

  test("reads the rounds each side has won, when CS2 gives them", () => {
    const payload = matchPayload("casual");
    expect(interpretGsiPayload(payload).score).toBeNull();

    payload.map.team_ct = { score: 7, consecutive_round_losses: 0 };
    payload.map.team_t = { score: 5, consecutive_round_losses: 1 };
    expect(interpretGsiPayload(payload).score).toEqual({ ct: 7, t: 5 });
  });

  test("reads a casual match", () => {
    expect(interpretGsiPayload(matchPayload("casual"))).toMatchObject({
      inMatch: true,
      inMenu: false,
      mode: "casual",
      mapName: "de_dust2",
      phase: "live",
      inProtectedMatch: false,
    });
  });

  test.each(["competitive", "premier", "scrimcomp2v2", "rush", "custom"])(
    "a %s match is one a join must not interrupt",
    (mode) => {
      expect(interpretGsiPayload(matchPayload(mode)).inProtectedMatch).toBe(
        true
      );
    }
  );

  test.each(["casual", "deathmatch"])(
    "a %s match may be left for a join",
    (mode) => {
      expect(interpretGsiPayload(matchPayload(mode)).inProtectedMatch).toBe(
        false
      );
    }
  );

  test("the pause menu on a server still counts as a match", () => {
    const payload = matchPayload("casual");
    payload.player.activity = "menu";
    expect(interpretGsiPayload(payload)).toMatchObject({
      inMatch: true,
      inMenu: false,
      activity: "menu",
    });
  });

  test("tolerates missing blocks", () => {
    expect(interpretGsiPayload({})).toMatchObject({
      steamId: null,
      inMatch: false,
      inMenu: true,
      activity: null,
    });
  });
});

describe("GSIManager", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    gsiManager.reset();
    gsiManager.getExpectedSteamId = () => USER_ID;
  });

  afterEach(() => {
    gsiManager.reset();
    gsiManager.listeners.clear();
    jest.useRealTimers();
    delete global.window.electronAPI;
  });

  test("has no state before CS2 posted anything", () => {
    expect(gsiManager.getUserState()).toBeNull();
  });

  test("keeps the state while fresh and drops it once CS2 goes quiet", () => {
    gsiManager.handlePayload(menuPayload(), 1000);

    expect(gsiManager.getUserState(1000 + GSI_CONFIG.FRESH_MS)).toMatchObject({
      inMenu: true,
    });
    expect(gsiManager.getUserState(1000 + GSI_CONFIG.FRESH_MS + 1)).toBeNull();
  });

  test("ignores a state from another Steam account", () => {
    gsiManager.handlePayload(menuPayload(OTHER_ID));

    expect(gsiManager.getUserState()).toBeNull();
    expect(gsiManager.getIndicatorState()).toBe("other-account");
  });

  test("skips the account check while no valid SteamID64 is entered", () => {
    gsiManager.getExpectedSteamId = () => "";
    gsiManager.handlePayload(menuPayload(OTHER_ID));

    expect(gsiManager.getUserState()).toMatchObject({ inMenu: true });
  });

  test("lists every player CS2 reports, the user left out", () => {
    const third = "76561198000000004";
    gsiManager.handlePayload(
      {
        ...matchPayload("casual"),
        allplayers: {
          [USER_ID]: { name: "me", team: "CT" },
          [OTHER_ID]: { name: "other", team: "T" },
          [third]: { name: "third", team: "CT" },
          "not-an-id": { name: "bot" },
        },
      },
      1000
    );

    expect(gsiManager.getListedPlayerIds(1000).sort()).toEqual(
      [OTHER_ID, third].sort()
    );
    expect(
      gsiManager.getListedPlayerIds(1000 + GSI_CONFIG.FRESH_MS + 1)
    ).toEqual([]);
  });

  test("lists nobody when CS2 sends no player list", () => {
    gsiManager.handlePayload(matchPayload("casual"), 1000);

    expect(gsiManager.getListedPlayerIds(1000)).toEqual([]);
  });

  test("records when a map loads and keeps it while the map stays", () => {
    gsiManager.handlePayload(menuPayload(), 1000);
    expect(gsiManager.getUserState(1000).mapLoadedAt).toBe(0);

    gsiManager.handlePayload(matchPayload("casual", "de_dust2"), 2000);
    expect(gsiManager.getUserState(2000).mapLoadedAt).toBe(2000);

    gsiManager.handlePayload(matchPayload("casual", "de_dust2"), 3000);
    expect(gsiManager.getUserState(3000).mapLoadedAt).toBe(2000);

    gsiManager.handlePayload(matchPayload("casual", "de_mirage"), 4000);
    expect(gsiManager.getUserState(4000).mapLoadedAt).toBe(4000);

    gsiManager.handlePayload(menuPayload(), 5000);
    gsiManager.handlePayload(matchPayload("casual", "de_mirage"), 6000);
    expect(gsiManager.getUserState(6000).mapLoadedAt).toBe(6000);
  });

  test("a map reported after CS2 went quiet counts as a new load", () => {
    gsiManager.handlePayload(matchPayload("casual"), 1000);
    const later = 1000 + GSI_CONFIG.FRESH_MS + 1;
    gsiManager.handlePayload(matchPayload("casual"), later);

    expect(gsiManager.getUserState(later).mapLoadedAt).toBe(later);
  });

  test("ignores payloads that are not objects", () => {
    gsiManager.handlePayload(null);
    gsiManager.handlePayload("state");

    expect(gsiManager.getUserState()).toBeNull();
  });

  test("notifies listeners on every state and once CS2 goes quiet", () => {
    const listener = jest.fn();
    const unsubscribe = gsiManager.onChange(listener);

    gsiManager.handlePayload(menuPayload());
    expect(listener).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(GSI_CONFIG.FRESH_MS + 1);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(gsiManager.getUserState()).toBeNull();

    unsubscribe();
    gsiManager.handlePayload(menuPayload());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("a failing listener does not stop the others", () => {
    const failing = jest.fn(() => {
      throw new Error("boom");
    });
    const listener = jest.fn();
    gsiManager.onChange(failing);
    gsiManager.onChange(listener);

    gsiManager.handlePayload(menuPayload());

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("the indicator follows the setup status until CS2 posts", () => {
    gsiManager.setupStatus = { setup: GSI_SETUP.READY, changed: true };
    expect(gsiManager.getIndicatorState()).toBe("restart");

    gsiManager.setupStatus = { setup: GSI_SETUP.READY, changed: false };
    expect(gsiManager.getIndicatorState()).toBe("waiting");

    gsiManager.setupStatus = { setup: GSI_SETUP.CS2_NOT_FOUND };
    expect(gsiManager.getIndicatorState()).toBe("unavailable");

    gsiManager.setupStatus = { setup: GSI_SETUP.ERROR };
    expect(gsiManager.getIndicatorState()).toBe("error");

    gsiManager.handlePayload(menuPayload());
    expect(gsiManager.getIndicatorState()).toBe("active");
  });

  test("after CS2 has posted once, quiet means waiting rather than restart", () => {
    gsiManager.setupStatus = { setup: GSI_SETUP.READY, changed: true };
    gsiManager.handlePayload(menuPayload());
    jest.advanceTimersByTime(GSI_CONFIG.FRESH_MS + 1);

    expect(gsiManager.getIndicatorState()).toBe("waiting");
  });

  test("initialize subscribes to the bridge and reads the setup status", async () => {
    let push;
    global.window.electronAPI = {
      gsi: {
        onState: jest.fn((callback) => {
          push = callback;
          return jest.fn();
        }),
        getStatus: jest
          .fn()
          .mockResolvedValue({ setup: GSI_SETUP.READY, changed: false }),
      },
    };
    const listener = jest.fn();
    gsiManager.onChange(listener);

    await gsiManager.initialize(() => USER_ID);

    expect(gsiManager.getIndicatorState()).toBe("waiting");
    expect(listener).toHaveBeenCalled();

    push(matchPayload("casual"));
    expect(gsiManager.getUserState()).toMatchObject({
      inMatch: true,
      mode: "casual",
    });
  });

  test("initialize without the bridge leaves GSI unavailable", async () => {
    await gsiManager.initialize(() => USER_ID);

    expect(gsiManager.getIndicatorState()).toBe("unavailable");
    expect(gsiManager.getUserState()).toBeNull();
  });
});

describe("GSIManager and Steam's game log", () => {
  // What the main process says of CS2's process, and its pushes
  let cs2State;
  let pushCs2;
  const closed = {
    usable: true,
    seen: true,
    running: false,
    fromAppStart: false,
    startedAt: 0,
    exitedAt: 0,
  };
  const at = (seconds, ms = 0) =>
    new Date(2026, 10, 7, 20, 0, seconds, ms).getTime();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(at(0));
    gsiManager.reset();
    cs2Process.reset();
    cs2State = { ...closed };
    global.window.electronAPI = {
      gsi: {
        onState: jest.fn(() => jest.fn()),
        getStatus: jest
          .fn()
          .mockResolvedValue({ setup: GSI_SETUP.READY, changed: true }),
      },
      steamLog: {
        cs2State: jest.fn(async () => cs2State),
        onCs2State: jest.fn((callback) => {
          pushCs2 = (state) => {
            cs2State = state;
            callback(state);
          };
          return jest.fn();
        }),
      },
    };
  });

  afterEach(() => {
    gsiManager.reset();
    gsiManager.listeners.clear();
    cs2Process.reset();
    jest.useRealTimers();
    delete global.window.electronAPI;
  });

  test("a new cfg asks for a restart only while the CS2 open at the app's start still is", async () => {
    cs2State = {
      ...closed,
      running: true,
      fromAppStart: true,
      startedAt: at(-600),
    };
    await gsiManager.initialize(() => USER_ID);
    expect(gsiManager.getIndicatorState()).toBe("restart");

    // The user closes it: a CS2 started from now on reads the new cfg
    const listener = jest.fn();
    gsiManager.onChange(listener);
    pushCs2({ ...closed, exitedAt: at(5) });
    expect(gsiManager.getIndicatorState()).toBe("waiting");
    expect(listener).toHaveBeenCalled();

    // The new one starting does not bring the call back
    pushCs2({ ...closed, running: true, startedAt: at(9), exitedAt: at(5) });
    expect(gsiManager.getIndicatorState()).toBe("waiting");
  });

  test("a new cfg with CS2 closed waits for CS2, with no call for a restart", async () => {
    await gsiManager.initialize(() => USER_ID);

    expect(gsiManager.getIndicatorState()).toBe("waiting");
  });

  test("a new cfg with a CS2 started after the app's start waits for its first state", async () => {
    cs2State = { ...closed, running: true, startedAt: at(0) };
    await gsiManager.initialize(() => USER_ID);

    expect(gsiManager.getIndicatorState()).toBe("waiting");
  });

  test("without the log a new cfg asks for the restart, as before", async () => {
    cs2State = { usable: false };
    await gsiManager.initialize(() => USER_ID);

    expect(gsiManager.getIndicatorState()).toBe("restart");
  });

  test("CS2's last state stops counting the moment the log has CS2 closed", async () => {
    cs2State = { ...closed, running: true, startedAt: at(-600) };
    await gsiManager.initialize(() => USER_ID);
    jest.setSystemTime(at(1, 400));
    gsiManager.handlePayload(menuPayload());
    expect(gsiManager.getUserState()).not.toBeNull();

    const listener = jest.fn();
    gsiManager.onChange(listener);
    pushCs2({ ...closed, exitedAt: at(3) });

    // Long before the FRESH_MS a silent CS2 is given
    expect(gsiManager.getUserState()).toBeNull();
    expect(gsiManager.getIndicatorState()).toBe("waiting");
    expect(listener).toHaveBeenCalled();
  });

  test("a CS2 closed in the very second it posted counts as closed after posting", async () => {
    cs2State = { ...closed, running: true, startedAt: at(-600) };
    await gsiManager.initialize(() => USER_ID);
    jest.setSystemTime(at(1, 900));
    gsiManager.handlePayload(menuPayload());

    pushCs2({ ...closed, exitedAt: at(1) });

    expect(gsiManager.getUserState()).toBeNull();
  });
});
