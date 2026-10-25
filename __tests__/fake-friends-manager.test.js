/**
 * Tests for keeping friends with a running join in the rendered list (B7)
 */

jest.mock("../src/core/app-state-manager.js", () => {
  const state = {};
  return {
    __esModule: true,
    default: {
      getState: jest.fn((key) => state[key]),
      setState: jest.fn((key, value) => {
        state[key] = value;
      }),
    },
  };
});
jest.mock("../src/utils/validators.js", () => ({
  __esModule: true,
  default: {
    validateSteamId: jest.fn((id) => /^\d{17}$/.test(id)),
    extractApiKeyOrToken: jest.fn((auth) => auth),
  },
}));
jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: {
    isActive: jest.fn(
      (state) =>
        Boolean(state) &&
        !state.cancelled &&
        ["waiting", "connecting", "missing"].includes(state.status)
    ),
    getJoinStates: jest.fn(() => ({})),
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
jest.mock("../src/utils/error-handler.js", () => ({
  __esModule: true,
  default: { logError: jest.fn() },
}));
jest.mock("../src/utils/dom-utils.js", () => ({
  __esModule: true,
  default: { getElementById: jest.fn(() => null) },
}));
jest.mock("../src/ui/tutorial/tutorial-manager.js", () => ({
  __esModule: true,
  default: { isActive: false },
}));
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/i18n/i18n-manager.js", () => ({
  __esModule: true,
  t: jest.fn((key) => key),
}));

import appStateManager from "../src/core/app-state-manager.js";
import joinManager from "../src/game/join-manager.js";
import UIManager from "../src/ui/ui-manager.js";
import SteamAPI from "../src/steam/steam-api.js";
import FakeFriendsManager from "../src/ui/fake-friends-manager.js";
import appFriendsManager from "../src/core/app-friends-manager.js";

const ALICE = "76561198000000001";
const BOB = "76561198000000002";
const FAKE = "76561198000000003";

const friend = (steamid, overrides = {}) => ({
  steamid,
  personaname: `name-${steamid}`,
  status: "",
  in_casual_mode: true,
  join_available: true,
  game_map: "de_dust2",
  game_score: "",
  game_server_id: "",
  connect: "",
  avatar: "",
  ...overrides,
});

const setFakeIds = (ids) =>
  appStateManager.setState("savedSettings", { fake_friend_ids: ids });

beforeEach(() => {
  jest.clearAllMocks();
  setFakeIds([]);
  appStateManager.setState("friendsData", undefined);
});

describe("FakeFriendsManager.withFakeFriends keep list", () => {
  test("keeps an entry that left casual, marked not in casual", () => {
    const kept = friend(BOB);

    const result = FakeFriendsManager.withFakeFriends([friend(ALICE)], [kept]);

    expect(result.map((f) => f.steamid)).toEqual([ALICE, BOB]);
    expect(result[1]).toMatchObject({
      steamid: BOB,
      personaname: kept.personaname,
      in_casual_mode: false,
      join_available: false,
    });
    // The previous snapshot is not mutated
    expect(kept.in_casual_mode).toBe(true);
  });

  test("fresh status wins over the kept entry", () => {
    const fresh = friend(BOB, {
      personaname: "renamed",
      in_casual_mode: false,
      join_available: false,
      status: "online",
    });

    const result = FakeFriendsManager.withFakeFriends(
      [friend(ALICE, { in_casual_mode: false }), fresh],
      [friend(BOB)]
    );

    expect(result).toEqual([fresh]);
  });

  test("does not duplicate supported friends or fake IDs", () => {
    setFakeIds([FAKE]);
    const fake = friend(FAKE, { in_casual_mode: false });

    const result = FakeFriendsManager.withFakeFriends(
      [friend(ALICE), fake],
      [friend(ALICE), friend(FAKE), friend(BOB)]
    );

    expect(result.map((f) => f.steamid)).toEqual([ALICE, FAKE, BOB]);
    expect(result[1]).toBe(fake);
  });

  test("applies the keep list when there are no fake IDs", () => {
    const result = FakeFriendsManager.withFakeFriends([], [friend(BOB)]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ steamid: BOB, in_casual_mode: false });
  });

  test("without a keep list returns only friends in casual", () => {
    const result = FakeFriendsManager.withFakeFriends([
      friend(ALICE),
      friend(BOB, { in_casual_mode: false }),
    ]);

    expect(result.map((f) => f.steamid)).toEqual([ALICE]);
  });
});

describe("FakeFriendsManager.splitFakeFriends", () => {
  test("puts manually tracked IDs in their own list", () => {
    setFakeIds([FAKE]);

    const { friends, fakeFriends } = FakeFriendsManager.splitFakeFriends([
      friend(ALICE),
      friend(FAKE),
      friend(BOB),
    ]);

    expect(friends.map((f) => f.steamid)).toEqual([ALICE, BOB]);
    expect(fakeFriends.map((f) => f.steamid)).toEqual([FAKE]);
  });

  test("tolerates a missing list", () => {
    expect(FakeFriendsManager.splitFakeFriends(undefined)).toEqual({
      friends: [],
      fakeFriends: [],
    });
  });
});

describe("FakeFriendsManager.removeId", () => {
  afterEach(() => {
    delete global.window.electronAPI;
  });

  test("removes the ID and keeps the rest of the settings", async () => {
    const save = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = {
      settings: {
        load: jest.fn().mockResolvedValue({
          steam_id: ALICE,
          auth: "token",
          fake_friend_ids: [FAKE, BOB],
        }),
        save,
      },
    };

    await expect(FakeFriendsManager.removeId(FAKE)).resolves.toBe(true);

    expect(save).toHaveBeenCalledWith({
      steam_id: ALICE,
      auth: "token",
      fake_friend_ids: [BOB],
    });
    expect(FakeFriendsManager.getIds()).toEqual([BOB]);
  });

  test("reports an ID that was not tracked", async () => {
    const save = jest.fn();
    global.window.electronAPI = {
      settings: {
        load: jest.fn().mockResolvedValue({ fake_friend_ids: [BOB] }),
        save,
      },
    };

    await expect(FakeFriendsManager.removeId(FAKE)).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("AppFriendsManager.getFriendsWithActiveJoins", () => {
  test("leaves out map and server attempts", () => {
    const result = appFriendsManager.getFriendsWithActiveJoins({
      "map-casual-de_dust2": { status: "waiting" },
      "srv-90071992547409921": { status: "connecting" },
    });

    expect(result).toEqual([]);
  });

  test("returns previous entries or placeholders for active joins only", () => {
    const previousBob = friend(BOB);
    appStateManager.setState("friendsData", [friend(ALICE), previousBob]);

    const result = appFriendsManager.getFriendsWithActiveJoins({
      [BOB]: { status: "missing" },
      [FAKE]: { status: "waiting", personaname: "Carol" },
      [ALICE]: { status: "cancelled", cancelled: true },
      "76561198000000004": { status: "joined" },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(previousBob);
    expect(result[1]).toMatchObject({
      steamid: FAKE,
      personaname: "Carol",
      in_casual_mode: false,
    });
  });

  test("placeholder keeps the Steam ID as name when none is known", () => {
    const result = appFriendsManager.getFriendsWithActiveJoins({
      [BOB]: { status: "connecting" },
    });

    expect(result).toEqual([FakeFriendsManager.createPlaceholder(BOB)]);
  });

  test("refresh keeps a friend who left casual while the join is running", async () => {
    appStateManager.setState("friendsData", [friend(ALICE), friend(BOB)]);
    const joinStates = { [BOB]: { status: "missing" } };
    joinManager.getJoinStates.mockReturnValue(joinStates);
    SteamAPI.getFriendsStatuses.mockResolvedValue([
      friend(ALICE),
      friend(BOB, { in_casual_mode: false, join_available: false }),
    ]);

    const result = await appFriendsManager.fetchAndRenderFriendsByIds(
      [ALICE, BOB],
      "key",
      true
    );

    expect(result.map((f) => f.steamid)).toEqual([ALICE, BOB]);
    expect(result[1].in_casual_mode).toBe(false);
    expect(appStateManager.getState("friendsData")).toBe(result);
    expect(UIManager.renderFriendsList).toHaveBeenCalledWith(
      result,
      joinStates
    );
  });
});
