/**
 * Jest tests for the friends auto-refresh: a fresh credential every round,
 * and no overlapping rounds when Steam is slow
 */

jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: {
    isActive: jest.fn(() => false),
    getJoinStates: jest.fn(() => ({})),
    resetAll: jest.fn(),
  },
}));
jest.mock("../src/ui/ui-manager.js", () => ({
  __esModule: true,
  default: {
    renderFriendsList: jest.fn(),
    renderFakeFriendsList: jest.fn(),
    showError: jest.fn(),
  },
}));
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { getFriendsStatuses: jest.fn() },
}));
jest.mock("../src/ui/tutorial/tutorial-manager.js", () => ({
  __esModule: true,
  default: { isActive: false },
}));

import appFriendsManager from "../src/core/app-friends-manager.js";
import appStateManager from "../src/core/app-state-manager.js";
import SteamAPI from "../src/steam/steam-api.js";
import { API_CONFIG } from "../src/shared/constants.js";

const FRIEND = "76561198000000002";

describe("startAutoRefresh", () => {
  let auth;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    auth = "token-1";
    appFriendsManager.setManagers({ getAuth: () => auth }, null, null);
    appStateManager.batchUpdate({
      savedFriendsIds: [FRIEND],
      usingSavedFriends: true,
      savedSettings: { fake_friend_ids: [] },
    });
    SteamAPI.getFriendsStatuses.mockResolvedValue([]);
  });

  afterEach(() => {
    appStateManager.clearRefreshInterval();
    jest.useRealTimers();
  });

  test("asks with the credential entered at the time of each round", async () => {
    await appFriendsManager.startAutoRefresh();
    expect(SteamAPI.getFriendsStatuses).toHaveBeenLastCalledWith([FRIEND], "token-1");

    // The old token expired; the user pasted a new one
    auth = "token-2";
    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS);

    expect(SteamAPI.getFriendsStatuses).toHaveBeenLastCalledWith([FRIEND], "token-2");
  });

  test("a slow round is not overlapped by the next ones", async () => {
    await appFriendsManager.startAutoRefresh();
    let finish;
    SteamAPI.getFriendsStatuses.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );

    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS * 3);
    expect(SteamAPI.getFriendsStatuses).toHaveBeenCalledTimes(2);

    finish([]);
    await jest.advanceTimersByTimeAsync(API_CONFIG.AUTO_REFRESH_INTERVAL_MS);
    expect(SteamAPI.getFriendsStatuses).toHaveBeenCalledTimes(3);
  });
});
