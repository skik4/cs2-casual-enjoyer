/**
 * Jest tests for JoinManager reading the user's own state from CS2 Game
 * State Integration while the friend's state still comes from Steam
 */

jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/steam/steam-api.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import joinManager from "../src/game/join-manager.js";
import { API_CONFIG, STATUS_TYPES } from "../src/shared/constants.js";
import SteamAPI from "../src/steam/steam-api.js";
import DOMUtils from "../src/utils/dom-utils.js";
import Validators from "../src/utils/validators.js";

const USER_ID = "76561198000000001";
const FRIEND_ID = "76561198000000002";
const AUTH = "ABCD1234EFGH5678IJKL9012MNOP3456";
const CONNECT = "+gcconnect0A1B2C3D4E5F60718293A4B5";
const FRIEND_SERVER = "90071992547409921";
const JOIN_URL = `steam://rungame/730/${FRIEND_ID}/${CONNECT}`;

/** Join-relevant info for one side of the snapshot */
const playerInfo = (overrides = {}) => ({
  personaname: "",
  inCS2: true,
  inCompetitiveOrPremier: false,
  inSupportedMode: false,
  connect: null,
  serverId: null,
  ...overrides,
});

const userInfo = (overrides) => playerInfo({ personaname: "me", ...overrides });
const friendInfo = (overrides) =>
  playerInfo({
    personaname: "friend",
    inSupportedMode: true,
    connect: CONNECT,
    serverId: FRIEND_SERVER,
    ...overrides,
  });

/** What CS2 reports about the user's game */
const gsiMenu = () => ({
  inMatch: false,
  inMenu: true,
  mode: null,
  inCompetitiveOrPremier: false,
  mapLoadedAt: 0,
});
const gsiMatch = (mode, mapLoadedAt) => ({
  inMatch: true,
  inMenu: false,
  mode,
  inCompetitiveOrPremier: mode === "competitive" || mode === "premier",
  mapLoadedAt,
});

describe("JoinManager with CS2 Game State Integration", () => {
  let cs2;
  let openExternal;

  const joinCalls = () =>
    openExternal.mock.calls.filter(([url]) => url === JOIN_URL).length;
  const status = () => joinManager.getJoinStates()[FRIEND_ID]?.status;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    cs2 = {
      gsiState: null,
      checkUserInCS2: jest.fn().mockResolvedValue(true),
      getGsiUserState: jest.fn(() => cs2.gsiState),
    };
    joinManager.setCS2Manager(cs2);
    joinManager.setUICallbacks(jest.fn(), jest.fn());

    DOMUtils.getElementById.mockImplementation(
      (id) =>
        ({ "steam-id": { value: USER_ID }, auth: { value: AUTH } })[id] || null
    );
    Validators.extractApiKeyOrToken.mockReturnValue(AUTH);

    openExternal = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = { shell: { openExternal } };
  });

  afterEach(() => {
    joinManager.resetAll();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.window.electronAPI;
  });

  test("keeps joining while CS2 reports itself though Steam lags behind", async () => {
    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo({ inCS2: false }),
      friend: friendInfo(),
    });
    cs2.gsiState = gsiMenu();

    joinManager.startJoin(FRIEND_ID);
    await jest.advanceTimersByTimeAsync(1000);

    expect(joinCalls()).toBeGreaterThan(0);
    expect(status()).toBe(STATUS_TYPES.CONNECTING);
  });

  test("without GSI, Steam saying the user left CS2 still cancels", async () => {
    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo({ inCS2: false }),
      friend: friendInfo(),
    });

    joinManager.startJoin(FRIEND_ID);
    await jest.advanceTimersByTimeAsync(1000);

    expect(joinCalls()).toBe(0);
    expect(status()).toBe(STATUS_TYPES.CANCELLED);
  });

  test("cancels as soon as CS2 reports a competitive match", async () => {
    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo(),
      friend: friendInfo(),
    });
    cs2.gsiState = gsiMatch("competitive", Date.now());

    joinManager.startJoin(FRIEND_ID);
    await jest.advanceTimersByTimeAsync(1000);

    expect(joinCalls()).toBe(0);
    expect(status()).toBe(STATUS_TYPES.CANCELLED);
  });

  test("a casual state from CS2 outweighs a stale competitive one from Steam", async () => {
    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo({ inCompetitiveOrPremier: true }),
      friend: friendInfo(),
    });
    cs2.gsiState = gsiMenu();

    joinManager.startJoin(FRIEND_ID);
    await jest.advanceTimersByTimeAsync(1000);

    expect(joinCalls()).toBeGreaterThan(0);
  });

  test("holds connects once CS2 loads a map, until Steam confirms the server", async () => {
    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo(),
      friend: friendInfo(),
    });

    joinManager.startJoin(FRIEND_ID);
    await jest.advanceTimersByTimeAsync(100);
    expect(joinCalls()).toBe(1);

    // CS2 loads the friend's map; Steam does not show the server yet
    cs2.gsiState = gsiMatch("casual", Date.now());
    await jest.advanceTimersByTimeAsync(5000);

    expect(joinCalls()).toBe(1);
    expect(status()).toBe(STATUS_TYPES.CONNECTING);

    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo({ serverId: FRIEND_SERVER }),
      friend: friendInfo(),
    });
    await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

    expect(status()).toBe(STATUS_TYPES.JOINED);
    expect(joinCalls()).toBe(1);
  });

  test("resumes connecting when Steam never confirms within the grace period", async () => {
    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo(),
      friend: friendInfo(),
    });

    joinManager.startJoin(FRIEND_ID);
    await jest.advanceTimersByTimeAsync(100);
    cs2.gsiState = gsiMatch("casual", Date.now());

    await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_GSI_CONFIRM_MS - 500);
    expect(joinCalls()).toBe(1);

    await jest.advanceTimersByTimeAsync(2000);
    expect(joinCalls()).toBeGreaterThan(1);
  });

  test("a map loaded before the first connect does not hold anything", async () => {
    SteamAPI.getJoinSnapshot.mockResolvedValue({
      user: userInfo({ serverId: "90071992547409999" }),
      friend: friendInfo(),
    });
    // Already playing elsewhere and switching to the friend's server
    cs2.gsiState = gsiMatch("casual", Date.now() - 60000);

    joinManager.startJoin(FRIEND_ID);
    await jest.advanceTimersByTimeAsync(2000);

    expect(joinCalls()).toBeGreaterThan(1);
  });

  describe("isAwaitingJoinConfirmation", () => {
    const now = 100000;

    test.each([
      ["no GSI state", null, now - 1000, false],
      ["no connect sent yet", gsiMatch("casual", now - 500), null, false],
      ["the menu", gsiMenu(), now - 1000, false],
      ["a map loaded before the connect", gsiMatch("casual", now - 2000), now - 1000, false],
      ["a map loaded after the connect", gsiMatch("casual", now - 500), now - 1000, true],
      [
        "a map loaded too long ago",
        gsiMatch("casual", now - API_CONFIG.JOIN_GSI_CONFIRM_MS),
        now - API_CONFIG.JOIN_GSI_CONFIRM_MS - 1,
        false,
      ],
    ])("%s", (_name, gsiState, firstConnectAt, expected) => {
      expect(
        joinManager.isAwaitingJoinConfirmation(gsiState, firstConnectAt, now)
      ).toBe(expected);
    });
  });
});
