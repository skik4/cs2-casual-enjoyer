/**
 * Jest tests for JoinManager - stopping a join when the user's own game makes
 * it pointless: a Competitive or Premier match, or leaving CS2.
 *
 * The user's state comes from the same Steam snapshot as the friend's, one per
 * loop iteration (GSI is off here; join-manager-gsi.test.js covers CS2's own
 * reports). Steam reports Competitive and Premier through the one
 * inCompetitiveOrPremier flag - steam-api-join-snapshot.test.js covers how
 * rich presence maps onto it - so every scenario below covers both modes.
 */

// Mock modules before importing
jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/steam/steam-api.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import joinManager from "../src/game/join-manager.js";
import { API_CONFIG, STATUS_TYPES } from "../src/shared/constants.js";
import SteamAPI from "../src/steam/steam-api.js";
import DOMUtils from "../src/utils/dom-utils.js";
import ErrorHandler from "../src/utils/error-handler.js";
import Validators from "../src/utils/validators.js";

const { WAITING, CONNECTING, JOINED, CANCELLED } = STATUS_TYPES;

const USER_ID = "76561198000000002";
const FRIEND_ID = "76561198000000001";
const FRIEND_2_ID = "76561198000000003";
const AUTH = "ABCD1234EFGH5678IJKL9012MNOP3456";
const CONNECT = "+gcconnect0A1B2C3D4E5F60718293A4B5";
const CONNECT_2 = "+gcconnect0C0C0C0C0C0C0C0C0C0C0C0C";
const FRIEND_SERVER = "90071992547409921";
const FRIEND_2_SERVER = "90071992547409922";
const CASUAL_SERVER = "90071992547409930";
const MATCH_SERVER = "90071992547409940";

/** What the loop opens to join a friend */
const joinUrl = (friendId, connect) =>
  `steam://rungame/730/${friendId}/${connect}`;

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

/** The user's side of the snapshot wherever a scenario takes them */
const userIn = {
  menu: () => playerInfo({ personaname: "me" }),
  server: (serverId) =>
    playerInfo({ personaname: "me", inSupportedMode: true, serverId }),
  casual: () => userIn.server(CASUAL_SERVER),
  // A Competitive or Premier match - one flag for both
  match: () =>
    playerInfo({
      personaname: "me",
      inCompetitiveOrPremier: true,
      serverId: MATCH_SERVER,
    }),
  outsideCS2: () => playerInfo({ personaname: "me", inCS2: false }),
};

/** A friend on a full casual server: the attempt waits for a slot */
const friendOnFullServer = (overrides) =>
  playerInfo({
    personaname: "friend",
    inSupportedMode: true,
    serverId: FRIEND_SERVER,
    ...overrides,
  });

/** A friend whose server has a free slot: the attempt connects */
const friendWithFreeSlot = (overrides) =>
  friendOnFullServer({ connect: CONNECT, ...overrides });

describe("JoinManager - Competitive/Premier Mode Interruption", () => {
  let cs2;
  let openExternal;
  let onUpdateDot;
  let onUpdateJoinButton;
  /** What Steam reports; every snapshot reads it when it is taken */
  let steam;

  const state = (id = FRIEND_ID) => joinManager.getJoinStates()[id];
  const status = (id = FRIEND_ID) => state(id)?.status;
  const polls = (id = FRIEND_ID) =>
    SteamAPI.getJoinSnapshot.mock.calls.filter(([, friendId]) => friendId === id)
      .length;
  const connects = (id = FRIEND_ID) =>
    openExternal.mock.calls.filter(([url]) =>
      url.startsWith(`steam://rungame/730/${id}/`)
    ).length;
  /** Let every pending promise settle without moving the clock */
  const flush = () => jest.advanceTimersByTimeAsync(0);
  const advance = (ms) => jest.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();

    cs2 = {
      checkUserInCS2: jest.fn().mockResolvedValue(true),
      getGsiUserState: jest.fn(() => null),
    };
    joinManager.setCS2Manager(cs2);
    onUpdateDot = jest.fn();
    onUpdateJoinButton = jest.fn();
    joinManager.setUICallbacks(onUpdateDot, onUpdateJoinButton);
    joinManager.setCS2LaunchCallback(jest.fn().mockResolvedValue(true));

    DOMUtils.getElementById.mockImplementation(
      (id) =>
        ({ "steam-id": { value: USER_ID }, auth: { value: AUTH } })[id] || null
    );
    Validators.extractApiKeyOrToken.mockReturnValue(AUTH);

    openExternal = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = { shell: { openExternal } };

    steam = {
      user: userIn.menu(),
      friends: { [FRIEND_ID]: friendOnFullServer() },
    };
    SteamAPI.getJoinSnapshot.mockImplementation(async (_userId, friendId) => ({
      user: steam.user,
      friend: steam.friends[friendId] ?? null,
    }));
  });

  afterEach(() => {
    joinManager.resetAll();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.window.electronAPI;
  });

  describe("Join process interruption scenarios", () => {
    test("cancels on the next snapshot once the user is in a competitive or premier match", async () => {
      joinManager.startJoin(FRIEND_ID);
      await flush();
      expect(status()).toBe(WAITING);

      const asked = polls();
      steam.user = userIn.match();
      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      // Caught by the very next snapshot, which is also the last one
      expect(polls()).toBe(asked + 1);
      expect(status()).toBe(CANCELLED);
      expect(state().cancelled).toBe(true);
      expect(onUpdateDot).toHaveBeenLastCalledWith(FRIEND_ID, CANCELLED);
      expect(onUpdateJoinButton).toHaveBeenLastCalledWith(FRIEND_ID, CANCELLED);

      await advance(2000);
      expect(polls()).toBe(asked + 1);
    });

    test("keeps running while the user plays casual elsewhere", async () => {
      steam.user = userIn.casual();

      joinManager.startJoin(FRIEND_ID);
      await flush();
      const running = state();
      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS * 5);

      // A snapshot at the start and one per loop interval, all on one state
      expect(polls()).toBe(1 + 5);
      expect(state()).toBe(running);
      expect(joinManager.isActive(running)).toBe(true);
      expect(running.status).toBe(WAITING);
    });

    test("cancels between connect attempts, before the next connect", async () => {
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      joinManager.startJoin(FRIEND_ID);
      await flush();
      expect(status()).toBe(CONNECTING);
      expect(openExternal).toHaveBeenCalledWith(joinUrl(FRIEND_ID, CONNECT));

      await advance(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      expect(connects()).toBe(2);

      steam.user = userIn.match();
      await advance(API_CONFIG.JOIN_RETRY_INTERVAL_MS);

      expect(status()).toBe(CANCELLED);
      expect(state().cancelled).toBe(true);
      expect(connects()).toBe(2);

      await advance(2000);
      expect(connects()).toBe(2);
    });

    test("cancels on the next snapshot once the user leaves CS2", async () => {
      joinManager.startJoin(FRIEND_ID);
      await flush();
      expect(status()).toBe(WAITING);

      steam.user = userIn.outsideCS2();
      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(status()).toBe(CANCELLED);
      expect(state().cancelled).toBe(true);
    });

    test("works without a cs2Manager, still cancelling on a competitive or premier match", async () => {
      joinManager.setCS2Manager(null);
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      const attempt = joinManager.startJoin(FRIEND_ID);
      await flush();
      expect(status()).toBe(CONNECTING);
      expect(openExternal).toHaveBeenCalledWith(joinUrl(FRIEND_ID, CONNECT));

      steam.user = userIn.match();
      await advance(API_CONFIG.JOIN_RETRY_INTERVAL_MS);

      expect(status()).toBe(CANCELLED);
      await expect(attempt).resolves.toBeUndefined();
      expect(cs2.checkUserInCS2).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases and error handling", () => {
    test("a rejected snapshot does not cancel, and a match is still caught after it", async () => {
      SteamAPI.getJoinSnapshot.mockRejectedValueOnce(
        new Error("Steam API error")
      );

      joinManager.startJoin(FRIEND_ID);
      await flush();

      expect(ErrorHandler.logError).toHaveBeenCalledWith(
        "JoinManager.joinLoop",
        expect.any(Error),
        { join_id: FRIEND_ID, user_steam_id: USER_ID }
      );
      expect(joinManager.isActive(state())).toBe(true);

      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      expect(polls()).toBe(2);
      expect(status()).toBe(WAITING);

      steam.user = userIn.match();
      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      expect(status()).toBe(CANCELLED);
    });

    test("rapid mode switches: only the state a snapshot sees counts", async () => {
      const quarter = API_CONFIG.JOIN_LOOP_INTERVAL_MS / 4;
      steam.user = userIn.casual();

      joinManager.startJoin(FRIEND_ID);
      await flush();

      // Into a match and out again between two polls: no snapshot sees it
      await advance(quarter);
      steam.user = userIn.match();
      await advance(quarter);
      steam.user = userIn.casual();
      await advance(2 * quarter);
      expect(polls()).toBe(2);
      expect(joinManager.isActive(state())).toBe(true);

      // Flipping back and forth and ending in a match: the next poll sees it
      await advance(quarter);
      steam.user = userIn.match();
      await advance(quarter);
      steam.user = userIn.casual();
      await advance(quarter);
      steam.user = userIn.match();
      await advance(quarter);

      expect(polls()).toBe(3);
      expect(status()).toBe(CANCELLED);
    });
  });

  describe("Multiple friends join scenarios", () => {
    test("the user entering a competitive or premier match cancels every running attempt", async () => {
      steam.friends[FRIEND_2_ID] = friendOnFullServer({
        serverId: FRIEND_2_SERVER,
      });

      joinManager.startJoin(FRIEND_ID);
      joinManager.startJoin(FRIEND_2_ID);
      await flush();
      expect(status(FRIEND_ID)).toBe(WAITING);
      expect(status(FRIEND_2_ID)).toBe(WAITING);

      steam.user = userIn.match();
      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      for (const id of [FRIEND_ID, FRIEND_2_ID]) {
        expect(status(id)).toBe(CANCELLED);
        expect(onUpdateDot).toHaveBeenCalledWith(id, CANCELLED);
        expect(onUpdateJoinButton).toHaveBeenCalledWith(id, CANCELLED);
      }
    });

    test("one attempt cancelled by hand leaves the other running", async () => {
      steam.friends[FRIEND_2_ID] = friendOnFullServer({
        serverId: FRIEND_2_SERVER,
      });

      joinManager.startJoin(FRIEND_ID);
      joinManager.startJoin(FRIEND_2_ID);
      await flush();

      joinManager.cancelJoin(FRIEND_ID);
      const asked = polls(FRIEND_2_ID);
      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS * 3);

      expect(status(FRIEND_ID)).toBe(CANCELLED);
      expect(polls(FRIEND_ID)).toBe(1);
      expect(joinManager.isActive(state(FRIEND_2_ID))).toBe(true);
      expect(polls(FRIEND_2_ID)).toBe(asked + 3);

      // The other one still ends when the user enters a match
      steam.user = userIn.match();
      await advance(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      expect(status(FRIEND_2_ID)).toBe(CANCELLED);
    });

    test("joining one friend cancels the other attempts", async () => {
      steam.friends[FRIEND_ID] = friendWithFreeSlot();
      steam.friends[FRIEND_2_ID] = friendWithFreeSlot({
        serverId: FRIEND_2_SERVER,
        connect: CONNECT_2,
      });

      // Started a moment apart, so the two loops never poll at the same instant
      joinManager.startJoin(FRIEND_ID);
      await advance(API_CONFIG.JOIN_RETRY_INTERVAL_MS / 4);
      joinManager.startJoin(FRIEND_2_ID);
      await flush();

      // Both connect while the user is not on any server yet
      expect(status(FRIEND_ID)).toBe(CONNECTING);
      expect(status(FRIEND_2_ID)).toBe(CONNECTING);
      expect(openExternal).toHaveBeenCalledWith(joinUrl(FRIEND_ID, CONNECT));
      expect(openExternal).toHaveBeenCalledWith(joinUrl(FRIEND_2_ID, CONNECT_2));

      // The first friend's connect works
      steam.user = userIn.server(FRIEND_SERVER);
      await advance(API_CONFIG.JOIN_RETRY_INTERVAL_MS);

      expect(status(FRIEND_ID)).toBe(JOINED);
      expect(status(FRIEND_2_ID)).toBe(CANCELLED);
      expect(state(FRIEND_2_ID).cancelled).toBe(true);
      expect(onUpdateDot).toHaveBeenCalledWith(FRIEND_ID, JOINED);
      expect(onUpdateJoinButton).toHaveBeenCalledWith(FRIEND_ID, JOINED);
      expect(onUpdateDot).toHaveBeenCalledWith(FRIEND_2_ID, CANCELLED);
      expect(onUpdateJoinButton).toHaveBeenCalledWith(FRIEND_2_ID, CANCELLED);

      // No more connects for either, and the joined one resets after its display
      await advance(API_CONFIG.JOIN_SUCCESS_DISPLAY_MS);
      expect(connects(FRIEND_ID)).toBe(1);
      expect(connects(FRIEND_2_ID)).toBe(1);
      expect(status(FRIEND_ID)).toBe(CANCELLED);
    });
  });

  describe("Integration with existing join logic", () => {
    test("already in a competitive or premier match: cancelled on the first snapshot, never connects", async () => {
      steam.user = userIn.match();
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      joinManager.startJoin(FRIEND_ID);
      await advance(1000);

      expect(openExternal).not.toHaveBeenCalled();
      expect(polls()).toBe(1);
      expect(status()).toBe(CANCELLED);
      expect(state().cancelled).toBe(true);
    });
  });

  describe("Timing and performance", () => {
    test("the competitive check costs no extra request or wait: the first snapshot connects", async () => {
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      joinManager.startJoin(FRIEND_ID);
      // No fake time passes
      await flush();

      expect(SteamAPI.getJoinSnapshot).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledWith(joinUrl(FRIEND_ID, CONNECT));
    });
  });
});
