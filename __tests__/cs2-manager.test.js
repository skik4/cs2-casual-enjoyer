/**
 * Jest tests for CS2Manager - launch deadline and unknown Steam results
 */

// Mock modules before importing
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { isPlayerInCS2: jest.fn() },
}));
jest.mock("../src/utils/validators.js", () => ({
  __esModule: true,
  default: {
    extractApiKeyOrToken: jest.fn((auth) => auth),
    validateSteamId: jest.fn((id) => /^\d{17}$/.test(id)),
  },
}));
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import cs2Manager from "../src/game/cs2-manager.js";
import gsiManager from "../src/game/gsi-manager.js";
import SteamAPI from "../src/steam/steam-api.js";
import { GSI_CONFIG } from "../src/shared/constants.js";

const TEST_STEAM_ID = "76561198000000002";
const TEST_AUTH = "test_api_key";
const POLL_MS = 3000;
const TIMEOUT_MS = 10000;

/**
 * Track whether a promise has settled, without awaiting it
 * @param {Promise} promise - Promise to observe
 * @returns {{settled: boolean, value: any}} - Live settle state
 */
function observe(promise) {
  const state = { settled: false, value: undefined };
  promise.then((value) => {
    state.settled = true;
    state.value = value;
  });
  return state;
}

describe("CS2Manager", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    SteamAPI.isPlayerInCS2.mockReset();
    SteamAPI.isPlayerInCS2.mockResolvedValue(false);

    global.window.electronAPI = { shell: { openExternal: jest.fn() } };

    cs2Manager.initialize({
      getSteamId: () => TEST_STEAM_ID,
      getAuth: () => TEST_AUTH,
    });
  });

  afterEach(() => {
    // The manager is a singleton: never let a wait leak into the next test.
    cs2Manager.cancelLaunchOperations();
    jest.useRealTimers();
    delete global.window.electronAPI;
  });

  describe("launchAndWaitForLobby", () => {
    test("resolves false and reports timeout when the lobby is never reached", async () => {
      const onProgress = jest.fn();
      const wait = observe(
        cs2Manager.launchAndWaitForLobby(onProgress, TIMEOUT_MS)
      );

      expect(window.electronAPI.shell.openExternal).toHaveBeenCalledWith(
        "steam://run/730/"
      );
      expect(onProgress).toHaveBeenCalledWith("launching");

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
      expect(wait.settled).toBe(false);
      expect(onProgress).not.toHaveBeenCalledWith("timeout");

      await jest.advanceTimersByTimeAsync(1);
      expect(wait).toEqual({ settled: true, value: false });
      expect(onProgress).toHaveBeenLastCalledWith("timeout");
      expect(cs2Manager.isMonitoring).toBe(false);
      expect(jest.getTimerCount()).toBe(0);

      // Polling really stopped
      const callsAtTimeout = SteamAPI.isPlayerInCS2.mock.calls.length;
      await jest.advanceTimersByTimeAsync(POLL_MS * 3);
      expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledTimes(callsAtTimeout);
    });

    test("treats an unknown (null) lobby check as not ready", async () => {
      SteamAPI.isPlayerInCS2.mockResolvedValue(null);
      const onProgress = jest.fn();
      const wait = observe(
        cs2Manager.launchAndWaitForLobby(onProgress, TIMEOUT_MS)
      );

      await jest.advanceTimersByTimeAsync(POLL_MS * 3);
      expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledTimes(3);
      expect(wait.settled).toBe(false);

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS - POLL_MS * 3);
      expect(wait).toEqual({ settled: true, value: false });
      expect(onProgress).not.toHaveBeenCalledWith("ready");
    });

    test("resolves true when the lobby is detected before the deadline", async () => {
      SteamAPI.isPlayerInCS2
        .mockResolvedValueOnce(false)
        .mockResolvedValue(true);
      const onProgress = jest.fn();
      const wait = observe(
        cs2Manager.launchAndWaitForLobby(onProgress, TIMEOUT_MS)
      );

      await jest.advanceTimersByTimeAsync(POLL_MS * 2);
      expect(wait).toEqual({ settled: true, value: true });
      expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledWith(
        TEST_STEAM_ID,
        TEST_AUTH,
        true
      );
      expect(onProgress).toHaveBeenLastCalledWith("ready");
      expect(cs2Manager.isMonitoring).toBe(false);
      expect(jest.getTimerCount()).toBe(0);

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS * 2);
      expect(onProgress).not.toHaveBeenCalledWith("timeout");
    });

    test("cancelLaunchOperations resolves false and clears the deadline", async () => {
      const onProgress = jest.fn();
      const wait = observe(
        cs2Manager.launchAndWaitForLobby(onProgress, TIMEOUT_MS)
      );

      await jest.advanceTimersByTimeAsync(POLL_MS);
      cs2Manager.cancelLaunchOperations();
      await jest.advanceTimersByTimeAsync(0);

      expect(wait).toEqual({ settled: true, value: false });
      expect(cs2Manager.isMonitoring).toBe(false);
      expect(jest.getTimerCount()).toBe(0);

      await jest.advanceTimersByTimeAsync(TIMEOUT_MS * 2);
      expect(onProgress).not.toHaveBeenCalledWith("timeout");
    });

    test("a stale check from a cancelled wait does not settle or stop a new wait", async () => {
      let finishStaleCheck;
      SteamAPI.isPlayerInCS2.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishStaleCheck = resolve;
          })
      );

      const first = observe(cs2Manager.launchAndWaitForLobby(null, TIMEOUT_MS));
      // First poll starts and hangs on Steam
      await jest.advanceTimersByTimeAsync(POLL_MS);
      expect(finishStaleCheck).toEqual(expect.any(Function));

      cs2Manager.cancelLaunchOperations();
      await jest.advanceTimersByTimeAsync(0);
      expect(first).toEqual({ settled: true, value: false });

      const onProgress = jest.fn();
      const second = observe(
        cs2Manager.launchAndWaitForLobby(onProgress, TIMEOUT_MS)
      );

      // The old check now reports "in lobby"
      finishStaleCheck(true);
      await jest.advanceTimersByTimeAsync(0);

      expect(second.settled).toBe(false);
      expect(onProgress).not.toHaveBeenCalledWith("ready");
      expect(cs2Manager.isMonitoring).toBe(true);

      // The new wait still runs on its own deadline
      await jest.advanceTimersByTimeAsync(TIMEOUT_MS);
      expect(second).toEqual({ settled: true, value: false });
      expect(onProgress).toHaveBeenLastCalledWith("timeout");
    });
  });

  describe.each(["checkUserInCS2", "checkUserInCS2AndLobby"])(
    "%s",
    (method) => {
      test("returns null when Steam cannot be asked", async () => {
        SteamAPI.isPlayerInCS2.mockRejectedValue(new Error("network down"));
        await expect(cs2Manager[method]()).resolves.toBeNull();
      });

      test("passes a null Steam result through", async () => {
        SteamAPI.isPlayerInCS2.mockResolvedValue(null);
        await expect(cs2Manager[method]()).resolves.toBeNull();
      });

      test("passes a boolean Steam result through", async () => {
        SteamAPI.isPlayerInCS2.mockResolvedValue(true);
        await expect(cs2Manager[method]()).resolves.toBe(true);
      });

      test("returns false when steamId or auth is missing", async () => {
        cs2Manager.initialize({ getSteamId: () => "", getAuth: () => TEST_AUTH });
        await expect(cs2Manager[method]()).resolves.toBe(false);
        expect(SteamAPI.isPlayerInCS2).not.toHaveBeenCalled();
      });
    }
  );

  describe("with CS2 Game State Integration", () => {
    const OTHER_STEAM_ID = "76561198000000003";

    const menuPayload = (steamid = TEST_STEAM_ID) => ({
      provider: { appid: 730, steamid },
      player: { steamid, activity: "menu" },
    });
    const matchPayload = (mode) => ({
      provider: { appid: 730, steamid: TEST_STEAM_ID },
      map: { mode, name: "de_dust2", phase: "live" },
      player: { steamid: TEST_STEAM_ID, activity: "playing" },
    });

    beforeEach(() => {
      gsiManager.reset();
      gsiManager.getExpectedSteamId = () => TEST_STEAM_ID;
    });

    afterEach(() => {
      gsiManager.reset();
    });

    test("checkUserInCS2 answers from a fresh state without asking Steam", async () => {
      gsiManager.handlePayload(matchPayload("casual"));

      await expect(cs2Manager.checkUserInCS2()).resolves.toBe(true);
      expect(SteamAPI.isPlayerInCS2).not.toHaveBeenCalled();
    });

    test("checkUserInCS2AndLobby is true in the menu and false in a match", async () => {
      gsiManager.handlePayload(menuPayload());
      await expect(cs2Manager.checkUserInCS2AndLobby()).resolves.toBe(true);

      gsiManager.handlePayload(matchPayload("casual"));
      await expect(cs2Manager.checkUserInCS2AndLobby()).resolves.toBe(false);

      expect(SteamAPI.isPlayerInCS2).not.toHaveBeenCalled();
    });

    test("asks Steam again once CS2 has gone quiet", async () => {
      gsiManager.handlePayload(menuPayload());
      await jest.advanceTimersByTimeAsync(GSI_CONFIG.FRESH_MS + 1);

      await expect(cs2Manager.checkUserInCS2()).resolves.toBe(false);
      expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledTimes(1);
    });

    test("asks Steam when CS2 runs on another account", async () => {
      gsiManager.handlePayload(menuPayload(OTHER_STEAM_ID));

      await expect(cs2Manager.checkUserInCS2()).resolves.toBe(false);
      expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledTimes(1);
    });

    test("launchAndWaitForLobby resolves the moment CS2 reports the menu", async () => {
      const onProgress = jest.fn();
      const wait = observe(
        cs2Manager.launchAndWaitForLobby(onProgress, TIMEOUT_MS)
      );

      await jest.advanceTimersByTimeAsync(100);
      expect(wait.settled).toBe(false);

      gsiManager.handlePayload(menuPayload());
      await jest.advanceTimersByTimeAsync(0);

      expect(wait).toEqual({ settled: true, value: true });
      expect(onProgress).toHaveBeenLastCalledWith("ready");
      expect(SteamAPI.isPlayerInCS2).not.toHaveBeenCalled();
      expect(cs2Manager.isMonitoring).toBe(false);
      expect(gsiManager.listeners.size).toBe(0);
    });

    test("a state from a match does not end the launch wait", async () => {
      const wait = observe(cs2Manager.launchAndWaitForLobby(null, TIMEOUT_MS));

      gsiManager.handlePayload(matchPayload("casual"));
      await jest.advanceTimersByTimeAsync(POLL_MS);

      expect(wait.settled).toBe(false);
      expect(cs2Manager.isMonitoring).toBe(true);
    });

    test("cancelling the launch stops listening to GSI", async () => {
      const wait = observe(cs2Manager.launchAndWaitForLobby(null, TIMEOUT_MS));
      expect(gsiManager.listeners.size).toBe(1);

      cs2Manager.cancelLaunchOperations();
      await jest.advanceTimersByTimeAsync(0);

      expect(wait).toEqual({ settled: true, value: false });
      expect(gsiManager.listeners.size).toBe(0);
    });
  });
});
