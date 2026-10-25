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
      activity: "menu",
      inCompetitiveOrPremier: false,
    });
  });

  test("reads a casual match", () => {
    expect(interpretGsiPayload(matchPayload("casual"))).toMatchObject({
      inMatch: true,
      inMenu: false,
      mode: "casual",
      mapName: "de_dust2",
      phase: "live",
      inCompetitiveOrPremier: false,
    });
  });

  test.each(["competitive", "premier"])(
    "a %s match counts as competitive",
    (mode) => {
      expect(
        interpretGsiPayload(matchPayload(mode)).inCompetitiveOrPremier
      ).toBe(true);
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

    expect(gsiManager.getUserState(1000 + GSI_CONFIG.FRESH_MS)).toMatchObject(
      { inMenu: true }
    );
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
