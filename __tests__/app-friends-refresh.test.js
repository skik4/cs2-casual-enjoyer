/**
 * Jest tests for the friends auto-refresh: a fresh credential every round,
 * no overlapping rounds when Steam is slow, and none while the window is
 * minimized
 */

jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: {
    isActive: jest.fn(() => false),
    getJoinStates: jest.fn(() => ({})),
    resetAll: jest.fn(),
  },
}));
jest.mock("../src/ui/friends-renderer.js", () => ({
  __esModule: true,
  default: { renderFriendsList: jest.fn(), renderFakeFriendsList: jest.fn() },
}));
jest.mock("../src/ui/notification-manager.js", () => ({
  __esModule: true,
  default: { showError: jest.fn() },
}));
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { getFriendsStatuses: jest.fn(), getPresence: jest.fn() },
}));
jest.mock("../src/ui/tutorial/tutorial-manager.js", () => ({
  __esModule: true,
  default: { isActive: false },
}));

import appFriendsManager from "../src/core/app-friends-manager.js";
import appStateManager from "../src/core/app-state-manager.js";
import userLocation from "../src/game/user-location.js";
import SteamAPI from "../src/steam/steam-api.js";
import credentialState from "../src/steam/credential-state.js";
import { API_CONFIG } from "../src/shared/constants.js";

const USER = "76561198000000001";
const FRIEND = "76561198000000002";

// The preload's window bridge, with the main process played by the test.
// The window's state is followed from the first refresh on, so the bridge
// is there before any test.
const minimizedListeners = [];
const reportMinimized = (minimized) =>
  minimizedListeners.forEach((callback) => callback(minimized));

beforeAll(() => {
  global.window.electronAPI = {
    window: {
      isMinimized: jest.fn(async () => false),
      onMinimized: jest.fn((callback) => {
        minimizedListeners.push(callback);
        return () => {};
      }),
    },
  };
});

afterAll(() => {
  delete global.window.electronAPI;
});

describe("startAutoRefresh", () => {
  let auth;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    auth = "token-1";
    appFriendsManager.setInputManager({ getAuth: () => auth });
    appStateManager.batchUpdate({
      savedFriendsIds: [FRIEND],
      usingSavedFriends: true,
      savedSettings: { fake_friend_ids: [] },
    });
    SteamAPI.getFriendsStatuses.mockResolvedValue([]);
    SteamAPI.getPresence.mockResolvedValue(new Map());
  });

  afterEach(() => {
    userLocation.reset();
    appStateManager.clearRefreshInterval();
    jest.useRealTimers();
  });

  test("pauses while Steam turns the credential down, and goes on with a new one", async () => {
    await appFriendsManager.startAutoRefresh();
    credentialState.reject("token-1");
    SteamAPI.getFriendsStatuses.mockClear();

    await jest.advanceTimersByTimeAsync(
      API_CONFIG.AUTO_REFRESH_INTERVAL_MS * 3
    );
    expect(SteamAPI.getFriendsStatuses).not.toHaveBeenCalled();

    // The user pasted a fresh token
    auth = "token-2";
    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS);

    expect(SteamAPI.getFriendsStatuses).toHaveBeenLastCalledWith(
      [FRIEND],
      "token-2"
    );
    credentialState.reset();
  });

  test("asks with the credential entered at the time of each round", async () => {
    await appFriendsManager.startAutoRefresh();
    expect(SteamAPI.getFriendsStatuses).toHaveBeenLastCalledWith(
      [FRIEND],
      "token-1"
    );

    // The old token expired; the user pasted a new one
    auth = "token-2";
    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS);

    expect(SteamAPI.getFriendsStatuses).toHaveBeenLastCalledWith(
      [FRIEND],
      "token-2"
    );
  });

  test("a slow round is not overlapped by the next ones", async () => {
    await appFriendsManager.startAutoRefresh();
    let finish;
    SteamAPI.getFriendsStatuses.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );

    await jest.advanceTimersByTimeAsync(
      API_CONFIG.AUTO_REFRESH_INTERVAL_MS * 3
    );
    expect(SteamAPI.getFriendsStatuses).toHaveBeenCalledTimes(2);

    finish([]);
    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS);
    expect(SteamAPI.getFriendsStatuses).toHaveBeenCalledTimes(3);
  });

  test("asks where the user is in the same round, to spot friends beside them", async () => {
    const SERVER = "90071992547409921";
    appStateManager.setState("savedSettings", {
      fake_friend_ids: [],
      steam_id: USER,
    });
    SteamAPI.getPresence.mockResolvedValue(
      new Map([[USER, { steamid: USER, inCS2: true, serverId: SERVER }]])
    );

    await appFriendsManager.startAutoRefresh();

    expect(SteamAPI.getPresence).toHaveBeenCalledWith([USER], "token-1");
    expect(userLocation.getServerId()).toBe(SERVER);
  });
});

describe("while the window is minimized", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    appFriendsManager.setInputManager({ getAuth: () => "token-1" });
    appStateManager.batchUpdate({
      savedFriendsIds: [FRIEND],
      usingSavedFriends: true,
      savedSettings: { fake_friend_ids: [] },
    });
    SteamAPI.getFriendsStatuses.mockResolvedValue([]);
    SteamAPI.getPresence.mockResolvedValue(new Map());
  });

  afterEach(() => {
    reportMinimized(false);
    userLocation.reset();
    appStateManager.clearRefreshInterval();
    jest.useRealTimers();
  });

  test("no round goes out, and the list catches up the moment the window is back", async () => {
    await appFriendsManager.startAutoRefresh();
    SteamAPI.getFriendsStatuses.mockClear();

    reportMinimized(true);
    await jest.advanceTimersByTimeAsync(
      API_CONFIG.AUTO_REFRESH_INTERVAL_MS * 5
    );
    expect(SteamAPI.getFriendsStatuses).not.toHaveBeenCalled();

    reportMinimized(false);
    await jest.advanceTimersByTimeAsync(0);
    expect(SteamAPI.getFriendsStatuses).toHaveBeenCalledTimes(1);

    // Then every round as before
    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS);
    expect(SteamAPI.getFriendsStatuses).toHaveBeenCalledTimes(2);
  });

  test("a restore while the auto-refresh is stopped asks nothing", async () => {
    await appFriendsManager.startAutoRefresh();
    appFriendsManager.stopAutoRefresh();
    SteamAPI.getFriendsStatuses.mockClear();

    reportMinimized(true);
    reportMinimized(false);
    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS);

    expect(SteamAPI.getFriendsStatuses).not.toHaveBeenCalled();
  });
});
