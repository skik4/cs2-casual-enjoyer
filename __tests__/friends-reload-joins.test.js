/**
 * @jest-environment jsdom
 *
 * Jest tests for reloading the friends list while joins run: a reload of the
 * same account keeps them, so a join waiting for a slot outlives a refresh;
 * another account or credential ends them, as each attempt goes on with the
 * ones it started with
 */

jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: {
    isActive: jest.fn(),
    getJoinStates: jest.fn(),
    resetAll: jest.fn(),
  },
}));
jest.mock("../src/ui/friends-renderer.js", () => ({
  __esModule: true,
  default: { renderFriendsList: jest.fn(), renderFakeFriendsList: jest.fn() },
}));
jest.mock("../src/ui/notification-manager.js", () => ({
  __esModule: true,
  default: { showError: jest.fn(), hideNotification: jest.fn() },
}));
jest.mock("../src/ui/account-view.js", () => ({
  __esModule: true,
  default: { close: jest.fn() },
}));
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: {
    getFriendsList: jest.fn(),
    getFriendsStatuses: jest.fn(),
    getPresence: jest.fn(),
  },
}));
jest.mock("../src/ui/tutorial/tutorial-manager.js", () => ({
  __esModule: true,
  default: { isActive: false },
}));

import appFriendsManager from "../src/core/app-friends-manager.js";
import appStateManager from "../src/core/app-state-manager.js";
import joinManager from "../src/game/join-manager.js";
import FriendsRenderer from "../src/ui/friends-renderer.js";
import SteamAPI from "../src/steam/steam-api.js";
import { STATUS_TYPES } from "../src/shared/constants.js";

const USER = "76561198000000001";
const OTHER_USER = "76561198000000009";
const FRIEND = "76561198000000002";
const WAITED_FRIEND = "76561198000000003";
const KEY = "ABCDEF0123456789ABCDEF0123456789";
const OTHER_KEY = "0123456789ABCDEF0123456789ABCDEF";

/** A friend in a casual match */
const casualFriend = (steamid) => ({
  steamid,
  personaname: steamid,
  in_casual_mode: true,
  join_available: true,
});

/** The join to the second friend waits for a slot */
const RUNNING = { [WAITED_FRIEND]: { status: STATUS_TYPES.WAITING } };

/** Reload with the saved account set to `saved` */
async function reloadWithSaved(saved) {
  appStateManager.batchUpdate({
    savedSettings: { fake_friend_ids: [], ...saved },
    friendsData: [casualFriend(FRIEND), casualFriend(WAITED_FRIEND)],
  });
  await appFriendsManager.updateFriendsList();
}

beforeEach(() => {
  jest.clearAllMocks();
  appFriendsManager.setInputManager({
    getSteamId: () => USER,
    getAuth: () => KEY,
    validateInputs: jest.fn(),
  });
  jest.spyOn(appFriendsManager, "startAutoRefresh").mockResolvedValue();
  window.electronAPI = {
    settings: {
      update: jest.fn(async (fields) => ({ fake_friend_ids: [], ...fields })),
    },
  };

  joinManager.getJoinStates.mockReturnValue(RUNNING);
  joinManager.isActive.mockImplementation(
    (state) => state?.status === STATUS_TYPES.WAITING
  );
  // The waited-for friend has left casual for now; the join waits on
  SteamAPI.getFriendsList.mockResolvedValue([FRIEND, WAITED_FRIEND]);
  SteamAPI.getFriendsStatuses.mockResolvedValue([
    casualFriend(FRIEND),
    { ...casualFriend(WAITED_FRIEND), in_casual_mode: false },
  ]);
  SteamAPI.getPresence.mockResolvedValue(new Map());
});

afterEach(() => {
  delete window.electronAPI;
});

test("a reload of the same account keeps the running join and its row", async () => {
  await reloadWithSaved({ steam_id: USER, auth: KEY });

  expect(joinManager.resetAll).not.toHaveBeenCalled();
  const [list, states] = FriendsRenderer.renderFriendsList.mock.calls.at(-1);
  expect(list.map((friend) => friend.steamid)).toEqual([FRIEND, WAITED_FRIEND]);
  expect(states).toEqual(RUNNING);
});

test("a reload for another account ends the running joins", async () => {
  await reloadWithSaved({ steam_id: OTHER_USER, auth: KEY });

  expect(joinManager.resetAll).toHaveBeenCalledTimes(1);
});

test("a reload with another credential ends the running joins", async () => {
  await reloadWithSaved({ steam_id: USER, auth: OTHER_KEY });

  expect(joinManager.resetAll).toHaveBeenCalledTimes(1);
});
