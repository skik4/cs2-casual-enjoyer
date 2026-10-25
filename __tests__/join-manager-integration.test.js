/**
 * Jest integration tests for JoinManager - real-world competitive/premier
 * scenarios played out over time against a Steam that takes a moment to answer.
 *
 * Every loop iteration asks for one snapshot of the user and the friend, and
 * the answer reflects what Steam knows when it answers - so a test can change
 * the user's game while a request is out, as happens for real. GSI is off
 * here (see join-manager-gsi.test.js). Steam reports Competitive and Premier
 * through one flag, so each scenario covers both modes.
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

const { WAITING, CONNECTING, CANCELLED } = STATUS_TYPES;

const FRIEND_ID = "76561198123456789";
const USER_ID = "76561198987654321";
const AUTH = "ABCD1234EFGH5678IJKL9012MNOP3456";
const CONNECT = "+gcconnect0A1B2C3D4E5F60718293A4B5";
const FRIEND_SERVER = "90071992547409921";
const CASUAL_SERVER = "90071992547409930";
const ARMS_RACE_SERVER = "90071992547409935";
const MATCH_SERVER = "90071992547409940";

/** How long Steam takes to answer a snapshot request */
const STEAM_LATENCY_MS = 100;
/** How long the CS2 check before an attempt takes - a Steam round trip too */
const CS2_CHECK_MS = 50;

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
  // Steam counts competitive only once a match runs, so queueing for one
  // from the menu still reads as the menu
  menu: () => playerInfo({ personaname: "me" }),
  casual: () =>
    playerInfo({ personaname: "me", inSupportedMode: true, serverId: CASUAL_SERVER }),
  // Another mode that is not competitive and not joinable either
  armsRace: () =>
    playerInfo({
      personaname: "me",
      serverId: ARMS_RACE_SERVER,
    }),
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
    personaname: "CompetitiveFriend",
    inSupportedMode: true,
    serverId: FRIEND_SERVER,
    ...overrides,
  });

/** A friend whose server has a free slot: the attempt connects */
const friendWithFreeSlot = (overrides) =>
  friendOnFullServer({ connect: CONNECT, ...overrides });

describe("JoinManager - Real-world Competitive/Premier Scenarios", () => {
  const realWindowOpen = global.window.open;
  let cs2;
  let openExternal;
  let onUpdateDot;
  let onUpdateJoinButton;
  /** What Steam knows when it answers, and whether it is failing */
  let steam;
  /** Every snapshot request: when it was sent and when Steam answered it */
  let requests;

  const state = () => joinManager.getJoinStates()[FRIEND_ID];
  const status = () => state()?.status;
  const answered = () =>
    requests.filter(({ answeredAt }) => answeredAt !== null).length;
  const advance = (ms) => jest.advanceTimersByTimeAsync(ms);

  /**
   * Let fake time run until Steam has answered `count` more requests; the loop
   * has acted on the last answer when this returns
   */
  async function untilSteamAnswers(count = 1) {
    const target = answered() + count;
    for (let step = 0; answered() < target; step += 1) {
      if (step === 1000) {
        throw new Error(`Steam answered fewer than ${count} more requests`);
      }
      await jest.advanceTimersToNextTimerAsync();
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();

    cs2 = {
      checkUserInCS2: jest.fn(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(true), CS2_CHECK_MS))
      ),
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
      failing: false,
    };
    requests = [];
    SteamAPI.getJoinSnapshot.mockImplementation((_userId, friendId) => {
      const request = { sentAt: Date.now(), answeredAt: null };
      requests.push(request);
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          request.answeredAt = Date.now();
          if (steam.failing) {
            reject(new Error("Steam API temporarily unavailable"));
          } else {
            resolve({ user: steam.user, friend: steam.friends[friendId] ?? null });
          }
        }, STEAM_LATENCY_MS);
      });
    });
  });

  afterEach(() => {
    joinManager.resetAll();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.window.electronAPI;
    global.window.open = realWindowOpen;
  });

  describe("Scenario 1: User switches to competitive mid-join", () => {
    test("playing casual elsewhere, then a competitive or premier match: cancelled and the UI updated", async () => {
      steam.user = userIn.casual();

      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(2);
      expect(status()).toBe(WAITING);

      steam.user = userIn.match();
      await untilSteamAnswers(1);

      expect(status()).toBe(CANCELLED);
      expect(state().cancelled).toBe(true);
      expect(onUpdateDot).toHaveBeenLastCalledWith(FRIEND_ID, CANCELLED);
      expect(onUpdateJoinButton).toHaveBeenLastCalledWith(FRIEND_ID, CANCELLED);

      // Nothing more is asked or sent
      await advance(5000);
      expect(requests).toHaveLength(3);
      expect(openExternal).not.toHaveBeenCalled();
    });
  });

  describe("Scenario 2: User is already in competitive when trying to join", () => {
    test("cancelled on the first snapshot: the UI goes WAITING then CANCELLED and the game gets nothing", async () => {
      steam.user = userIn.match();
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(1);
      await advance(5000);

      expect(status()).toBe(CANCELLED);
      expect(requests).toHaveLength(1);
      expect(openExternal).not.toHaveBeenCalled();
      for (const callback of [onUpdateDot, onUpdateJoinButton]) {
        expect(callback.mock.calls).toEqual([
          [FRIEND_ID, WAITING],
          [FRIEND_ID, CANCELLED],
        ]);
      }
    });
  });

  describe("Scenario 3: Connection attempts during mode transitions", () => {
    test("a match starting while a request is out stops the connects when Steam answers", async () => {
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(1);
      expect(status()).toBe(CONNECTING);
      expect(openExternal).toHaveBeenCalledTimes(1);

      // The next request goes out after the retry pause...
      await advance(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      expect(requests).toHaveLength(2);
      expect(requests[1].answeredAt).toBeNull();
      // ...and the match starts before Steam answers it
      steam.user = userIn.match();
      await untilSteamAnswers(1);

      expect(status()).toBe(CANCELLED);
      expect(openExternal).toHaveBeenCalledTimes(1);

      await advance(5000);
      expect(openExternal).toHaveBeenCalledTimes(1);
    });

    test("without the Electron bridge it connects through window.open, then stops on a match", async () => {
      delete global.window.electronAPI;
      global.window.open = jest.fn();
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(1);
      expect(global.window.open).toHaveBeenCalledWith(
        joinUrl(FRIEND_ID, CONNECT),
        "_self"
      );

      steam.user = userIn.match();
      await untilSteamAnswers(1);

      expect(status()).toBe(CANCELLED);
      expect(global.window.open).toHaveBeenCalledTimes(1);
    });
  });

  describe("Scenario 4: Multiple rapid mode changes", () => {
    test("hopping between casual and arms race on every poll keeps the attempt; a match then ends it", async () => {
      joinManager.startJoin(FRIEND_ID);

      for (const user of [
        userIn.casual(),
        userIn.armsRace(),
        userIn.casual(),
        userIn.armsRace(),
        userIn.menu(),
        userIn.casual(),
      ]) {
        steam.user = user;
        await untilSteamAnswers(1);
        expect(joinManager.isActive(state())).toBe(true);
      }
      expect(status()).toBe(WAITING);

      steam.user = userIn.match();
      await untilSteamAnswers(1);
      expect(status()).toBe(CANCELLED);
    });
  });

  describe("Scenario 5: Performance and timing", () => {
    test.each([
      ["a full server", API_CONFIG.JOIN_LOOP_INTERVAL_MS, friendOnFullServer],
      ["a free slot", API_CONFIG.JOIN_RETRY_INTERVAL_MS, friendWithFreeSlot],
    ])(
      "one request at a time: after an answer about %s the next request waits %i ms",
      async (_label, pause, friend) => {
        steam.friends[FRIEND_ID] = friend();

        joinManager.startJoin(FRIEND_ID);
        await untilSteamAnswers(5);

        // Each request leaves only once the one before it was answered
        expect(requests).toHaveLength(5);
        const gaps = requests
          .slice(1)
          .map(({ sentAt }, i) => sentAt - requests[i].answeredAt);
        expect(gaps).toEqual([pause, pause, pause, pause]);
      }
    );

    test("the first connect goes out one CS2 check and one Steam round trip after the click", async () => {
      const connectedAt = [];
      openExternal.mockImplementation(async () => {
        connectedAt.push(Date.now());
        return true;
      });
      steam.friends[FRIEND_ID] = friendWithFreeSlot();

      const clickedAt = Date.now();
      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(1);

      expect(connectedAt).toEqual([clickedAt + CS2_CHECK_MS + STEAM_LATENCY_MS]);
    });
  });

  describe("Scenario 6: Error handling", () => {
    test("Steam failing once mid-join does not cancel; the attempt connects once Steam answers again", async () => {
      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(1);
      expect(status()).toBe(WAITING);

      steam.failing = true;
      await untilSteamAnswers(1);
      expect(ErrorHandler.logError).toHaveBeenCalledWith(
        "JoinManager.joinLoop",
        expect.any(Error),
        { join_id: FRIEND_ID, user_steam_id: USER_ID }
      );
      expect(joinManager.isActive(state())).toBe(true);

      // Steam is back, and a slot opened on the friend's server
      steam.failing = false;
      steam.friends[FRIEND_ID] = friendWithFreeSlot();
      await untilSteamAnswers(1);

      expect(status()).toBe(CONNECTING);
      expect(openExternal).toHaveBeenCalledWith(joinUrl(FRIEND_ID, CONNECT));
    });

    test("Steam failing keeps the attempt until MISSING_TIMEOUT_MS of failures in a row", async () => {
      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(1);

      steam.failing = true;
      await advance(API_CONFIG.MISSING_TIMEOUT_MS - 1000);
      expect(joinManager.isActive(state())).toBe(true);

      await advance(2000);
      expect(status()).toBe(CANCELLED);

      const asked = requests.length;
      await advance(5000);
      expect(requests).toHaveLength(asked);
    });

    test("a CS2 check that throws is logged and no attempt starts", async () => {
      cs2.checkUserInCS2.mockRejectedValue(new Error("CS2 check failed"));
      steam.failing = true;

      await expect(joinManager.startJoin(FRIEND_ID)).resolves.toBeUndefined();

      expect(ErrorHandler.logError).toHaveBeenCalledWith(
        "JoinManager.startJoin",
        expect.any(Error),
        { join_id: FRIEND_ID }
      );
      expect(state()).toBeUndefined();
      expect(requests).toHaveLength(0);
      expect(onUpdateDot).not.toHaveBeenCalled();
      expect(onUpdateJoinButton).not.toHaveBeenCalled();
    });
  });

  describe("Scenario 7: Real-world user behavior patterns", () => {
    test("queueing for competitive from the menu keeps the attempt; the match starting cancels it", async () => {
      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(3);
      expect(joinManager.isActive(state())).toBe(true);

      // A match is found and starts while the next request is out
      setTimeout(() => {
        steam.user = userIn.match();
      }, API_CONFIG.JOIN_LOOP_INTERVAL_MS + STEAM_LATENCY_MS / 2);
      await untilSteamAnswers(1);

      expect(status()).toBe(CANCELLED);
      expect(state().cancelled).toBe(true);
    });

    test("leaving CS2 ends the attempt for good: coming back does not resume it", async () => {
      joinManager.startJoin(FRIEND_ID);
      await untilSteamAnswers(1);

      steam.user = userIn.outsideCS2();
      await untilSteamAnswers(1);
      expect(status()).toBe(CANCELLED);

      // Back in CS2, with a free slot on the friend's server
      steam.user = userIn.menu();
      steam.friends[FRIEND_ID] = friendWithFreeSlot();
      const asked = requests.length;
      await advance(5000);

      expect(status()).toBe(CANCELLED);
      expect(requests).toHaveLength(asked);
      expect(openExternal).not.toHaveBeenCalled();
    });
  });
});
