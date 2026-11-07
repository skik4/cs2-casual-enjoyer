/**
 * Regression tests for the join loop: it acts only for its own, still running
 * attempt (checked after every await), reads one Steam snapshot per iteration,
 * and treats Steam not answering as unknown rather than as a reason to cancel.
 * The user's state comes from the snapshot here - the GSI and map suites cover
 * CS2's own reports and map joins.
 */

jest.mock("../src/steam/steam-api.js");
jest.mock("../src/utils/error-handler.js");
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import joinManager from "../src/game/join-manager.js";
import joinJournal from "../src/game/join-journal.js";
import cs2Process from "../src/game/cs2-process.js";
import steamLog from "../src/game/steam-log.js";
import { API_CONFIG, STATUS_TYPES } from "../src/shared/constants.js";
import SteamAPI from "../src/steam/steam-api.js";
import logger from "../src/utils/logger.js";

const { WAITING, CONNECTING, JOINED, CANCELLED, MISSING } = STATUS_TYPES;

const USER_ID = "76561198000000001";
const FRIEND_ID = "76561198000000002";
const FRIEND_B_ID = "76561198000000003";
const AUTH = "ABCD1234EFGH5678IJKL9012MNOP3456";
const CONNECT = "+gcconnect0A1B2C3D4E5F60718293A4B5";
const CONNECT_B = "+gcconnect0B0B0B0B0B0B0B0B0B0B0B0B";
const FRIEND_SERVER = "90071992547409921";
const FRIEND_B_SERVER = "90071992547409922";
const OTHER_SERVER = "90071992547409999";

/** What the loop opens to join a friend */
const joinUrl = (friendId, connect) =>
  `steam://rungame/730/${friendId}/${connect}`;

/** Join-relevant info for one side of the snapshot */
const playerInfo = (overrides = {}) => ({
  personaname: "",
  inCS2: true,
  inProtectedMatch: false,
  inSupportedMode: false,
  connect: null,
  serverId: null,
  ...overrides,
});

const userInfo = (overrides) => playerInfo({ personaname: "me", ...overrides });

/** The friend on a casual server with a free slot */
const friendInfo = (overrides) =>
  playerInfo({
    personaname: "friend",
    inSupportedMode: true,
    connect: CONNECT,
    serverId: FRIEND_SERVER,
    ...overrides,
  });

/** A promise the test settles by hand, to keep a request in flight */
function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** The automocked SteamAPI methods, by name */
function steamApiMocks() {
  return Object.entries(Object.getOwnPropertyDescriptors(SteamAPI))
    .filter(([, { value }]) => jest.isMockFunction(value))
    .map(([name, { value }]) => [name, value]);
}

describe("JoinManager join loop", () => {
  let cs2;
  let openExternal;
  let onUpdateDot;
  let onUpdateJoinButton;
  let onRequestCS2Launch;
  /** What Steam reports; a request is answered from it when it is answered */
  let steam;
  /** Friends whose snapshot requests stay out until the test answers them */
  let held;
  /** Held requests not answered yet, oldest first */
  let inFlight;

  const state = (id = FRIEND_ID) => joinManager.getJoinStates()[id];
  const status = (id = FRIEND_ID) => state(id)?.status;
  const polls = (id = FRIEND_ID) =>
    SteamAPI.getJoinSnapshot.mock.calls.filter(
      ([, friendId]) => friendId === id
    ).length;
  const openedUrls = () => openExternal.mock.calls.map(([url]) => url);
  /** Statuses a UI callback got for an attempt, from its call number `from` on */
  const reported = (callback, id = FRIEND_ID, from = 0) =>
    callback.mock.calls
      .slice(from)
      .filter(([joinId]) => joinId === id)
      .map(([, reportedStatus]) => reportedStatus);
  /** Let every pending promise settle without moving the clock */
  const flush = () => jest.advanceTimersByTimeAsync(0);
  const snapshotFor = (id) => ({
    user: steam.user,
    friend: steam.friends[id] ?? null,
  });

  /** Answer the oldest held request for a friend with what Steam reports now */
  const answer = async (id = FRIEND_ID) => {
    const index = inFlight.findIndex((request) => request.friendId === id);
    if (index === -1)
      throw new Error(`No snapshot request in flight for ${id}`);
    const [request] = inFlight.splice(index, 1);
    request.resolve(snapshotFor(id));
    await flush();
  };

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
    onRequestCS2Launch = jest.fn().mockResolvedValue(true);
    joinManager.setCS2LaunchCallback(onRequestCS2Launch);

    joinManager.configure({
      getCredentials: () => ({ steamId: USER_ID, auth: AUTH }),
    });

    openExternal = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = { shell: { openExternal } };

    steam = { user: userInfo(), friends: { [FRIEND_ID]: friendInfo() } };
    held = new Set();
    inFlight = [];
    SteamAPI.getJoinSnapshot.mockImplementation((_userId, friendId) => {
      if (!held.has(friendId)) return Promise.resolve(snapshotFor(friendId));
      const request = deferred();
      inFlight.push({ friendId, resolve: request.resolve });
      return request.promise;
    });
  });

  afterEach(() => {
    joinManager.resetAll();
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.window.electronAPI;
  });

  describe("one connect per join token", () => {
    // Steam's game log as the main process reads it: the changes of server
    // a test logs, or none to read at all
    let logged;
    let logUsable;

    /** Steam logs CS2 changing game server now, to the second */
    const logServerChange = () =>
      logged.push(Math.floor(Date.now() / 1000) * 1000);
    const CONNECT_C = "+gcconnect0C0C0C0C0C0C0C0C0C0C0C0C";

    beforeEach(() => {
      logged = [];
      logUsable = true;
      joinManager.steamLog = {
        serverChangesSince: jest.fn(async (since) => ({
          usable: logUsable,
          changes: logUsable
            ? logged.filter((at) => at >= Math.floor(since / 1000) * 1000)
            : [],
        })),
      };
    });

    afterEach(() => {
      joinManager.steamLog = steamLog;
    });

    test("an unchanged token gets a single connect, however long it lasts", async () => {
      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(10000);

      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
      expect(status()).toBe(CONNECTING);
      expect(polls()).toBeGreaterThan(10);
    });

    test("a connect CS2 never acts on turns into waiting for a slot, and a new status with the same token sends nothing", async () => {
      // As on 2026-11-04: CS2 answered "Game is full", stayed in the menu, and
      // the friend kept the same join token for over a minute
      joinManager.startJoin(FRIEND_ID);
      await flush();
      expect(status()).toBe(CONNECTING);

      await jest.advanceTimersByTimeAsync(
        API_CONFIG.JOIN_LOAD_WINDOW_MS - 1000
      );
      expect(status()).toBe(CONNECTING);

      await jest.advanceTimersByTimeAsync(1000);
      expect(status()).toBe(WAITING);
      // The row heard it too: the start, the connect, then the wait
      expect(
        reported(onUpdateDot).filter((seen, i, all) => seen !== all[i - 1])
      ).toEqual([WAITING, CONNECTING, WAITING]);

      // The round ended, and nobody came or left: the token CS2 turned away
      // is not sent again
      steam.friends[FRIEND_ID] = friendInfo({ statusKey: "score 1:0" });
      await jest.advanceTimersByTimeAsync(5000);

      expect(status()).toBe(WAITING);
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
    });

    test("a token renewed by someone else after the connect gets a connect at once", async () => {
      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(20000);

      // Someone arrived or left; Steam logged no change of server for CS2
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(status()).toBe(CONNECTING);
      expect(openedUrls()).toEqual([
        joinUrl(FRIEND_ID, CONNECT),
        joinUrl(FRIEND_ID, CONNECT_B),
      ]);
    });

    test("the user's own arrival: Steam logs the change of server, and the token it renews gets no connect", async () => {
      joinManager.startJoin(FRIEND_ID);
      await flush();

      // As on 2026-11-05: Steam logged CS2's change of server 0-3 s after
      // the connect, the friend's token changed after that, and Steam then
      // showed the user on the server
      await jest.advanceTimersByTimeAsync(1000);
      logServerChange();
      await jest.advanceTimersByTimeAsync(800);
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      await jest.advanceTimersByTimeAsync(1300);
      expect(status()).toBe(CONNECTING);
      steam.user = userInfo({ inSupportedMode: true, serverId: FRIEND_SERVER });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(status()).toBe(JOINED);
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
    });

    test("without Steam's game log every new token gets a connect, the user's own arrival's too", async () => {
      // The user's choice: a "server full" message to close beats a slot missed
      logUsable = false;
      joinManager.startJoin(FRIEND_ID);
      await flush();
      await jest.advanceTimersByTimeAsync(1800);
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(openedUrls()).toEqual([
        joinUrl(FRIEND_ID, CONNECT),
        joinUrl(FRIEND_ID, CONNECT_B),
      ]);
    });

    test("only the first new token after a connect can be the user's own arrival", async () => {
      joinManager.startJoin(FRIEND_ID);
      await flush();
      await jest.advanceTimersByTimeAsync(1000);
      logServerChange();
      await jest.advanceTimersByTimeAsync(1000);
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);

      // The change of server was not the join after all (the user left a
      // match by hand), and the next token is someone else's
      await jest.advanceTimersByTimeAsync(20000);
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_C });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(openedUrls()).toEqual([
        joinUrl(FRIEND_ID, CONNECT),
        joinUrl(FRIEND_ID, CONNECT_C),
      ]);
    });

    test("a token never goes out twice, not even from a new attempt", async () => {
      // As on 2026-11-04: Cancel and Join again, three times in a minute,
      // each on the same token CS2 had turned away
      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(5000);
      joinManager.cancelJoin(FRIEND_ID);
      joinManager.startJoin(FRIEND_ID);
      await flush();

      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
      // Waits for a slot as soon as CS2 has had the time to act on the first
      expect(status()).toBe(CONNECTING);
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOAD_WINDOW_MS);
      expect(status()).toBe(WAITING);
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);

      // A new token is taken at once
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      expect(openedUrls()).toEqual([
        joinUrl(FRIEND_ID, CONNECT),
        joinUrl(FRIEND_ID, CONNECT_B),
      ]);
    });

    test("a link that goes away and comes back gets a connect on its new token", async () => {
      joinManager.startJoin(FRIEND_ID);
      await flush();
      // The server fills up, then someone leaves
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      expect(status()).toBe(WAITING);

      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(openedUrls()).toEqual([
        joinUrl(FRIEND_ID, CONNECT),
        joinUrl(FRIEND_ID, CONNECT_B),
      ]);
    });

    test("a Steam log that missed a join is not trusted until it logs one", async () => {
      // A join Steam's log should hold, and does not
      joinManager.startJoin(FRIEND_ID);
      await flush();
      steam.user = userInfo({ inSupportedMode: true, serverId: FRIEND_SERVER });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      expect(status()).toBe(JOINED);
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_SUCCESS_DISPLAY_MS);

      // The next attempt: a change of server logged, then a new token. The
      // log is not trusted, so the token is taken for someone else's.
      steam.user = userInfo();
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      joinManager.startJoin(FRIEND_ID);
      await flush();
      await jest.advanceTimersByTimeAsync(1000);
      logServerChange();
      await jest.advanceTimersByTimeAsync(1000);
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_C });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(openedUrls()).toEqual([
        joinUrl(FRIEND_ID, CONNECT),
        joinUrl(FRIEND_ID, CONNECT_B),
        joinUrl(FRIEND_ID, CONNECT_C),
      ]);
    });

    test("a join Steam's log holds keeps it trusted", async () => {
      joinManager.startJoin(FRIEND_ID);
      await flush();
      logServerChange();
      steam.user = userInfo({ inSupportedMode: true, serverId: FRIEND_SERVER });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      expect(status()).toBe(JOINED);
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_SUCCESS_DISPLAY_MS);

      steam.user = userInfo();
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
      joinManager.startJoin(FRIEND_ID);
      await flush();
      await jest.advanceTimersByTimeAsync(1000);
      logServerChange();
      await jest.advanceTimersByTimeAsync(1000);
      steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_C });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(openedUrls()).toEqual([
        joinUrl(FRIEND_ID, CONNECT),
        joinUrl(FRIEND_ID, CONNECT_B),
      ]);
    });
  });

  describe("join journal", () => {
    let journal;

    beforeEach(() => {
      journal = {
        record: jest.fn(),
        attemptStarted: jest.fn(),
        attemptEnded: jest.fn(),
      };
      joinManager.journal = journal;
    });

    afterEach(() => {
      joinManager.journal = joinJournal;
    });

    test("notes the attempt, what Steam showed, each connect and how it ended", async () => {
      joinManager.startJoin(FRIEND_ID);
      await flush();
      steam.user = userInfo({ serverId: FRIEND_SERVER });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_RETRY_INTERVAL_MS);

      expect(journal.attemptStarted).toHaveBeenCalledWith(FRIEND_ID);
      expect(journal.record).toHaveBeenCalledWith(
        "snapshot",
        expect.objectContaining({
          join: FRIEND_ID,
          connect: CONNECT,
          userServer: null,
        })
      );
      expect(journal.record).toHaveBeenCalledWith("connect", {
        join: FRIEND_ID,
        joinAs: FRIEND_ID,
        connect: CONNECT,
        why: "start",
      });
      // Only what changed is noted again
      expect(journal.record).toHaveBeenLastCalledWith("snapshot", {
        join: FRIEND_ID,
        userServer: FRIEND_SERVER,
      });
      expect(journal.attemptEnded).toHaveBeenCalledWith(FRIEND_ID, "joined");
    });

    test("notes why each connect went out, and a token taken for the user's own arrival", async () => {
      const CONNECT_C = "+gcconnect0C0C0C0C0C0C0C0C0C0C0C0C";
      const changes = [];
      joinManager.steamLog = {
        serverChangesSince: async () => ({ usable: true, changes }),
      };
      try {
        steam.friends[FRIEND_ID] = friendInfo({ connect: null });
        joinManager.startJoin(FRIEND_ID);
        await flush();
        // The link shows up
        steam.friends[FRIEND_ID] = friendInfo();
        await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
        // Someone else renews the token
        await jest.advanceTimersByTimeAsync(20000);
        steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_B });
        await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
        // Then the user arrives: Steam logs it, and the token changes again
        await jest.advanceTimersByTimeAsync(1000);
        changes.push(Math.floor(Date.now() / 1000) * 1000);
        await jest.advanceTimersByTimeAsync(1000);
        steam.friends[FRIEND_ID] = friendInfo({ connect: CONNECT_C });
        await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      } finally {
        joinManager.steamLog = steamLog;
      }

      expect(
        journal.record.mock.calls
          .filter(([event]) => event === "connect")
          .map(([, data]) => data.why)
      ).toEqual(["link", "token"]);
      expect(journal.record).toHaveBeenCalledWith("skip", {
        join: FRIEND_ID,
        joinAs: FRIEND_ID,
        connect: CONNECT_C,
        why: "own-arrival",
      });
      expect(journal.record).toHaveBeenCalledWith("steam-log", {
        state: "usable",
      });
    });

    test("a cancel is noted with its reason", async () => {
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });
      joinManager.startJoin(FRIEND_ID);
      await flush();

      joinManager.cancelJoin(FRIEND_ID);
      expect(journal.attemptEnded).toHaveBeenCalledWith(FRIEND_ID, "cancelled");
    });
  });

  describe("acting only for its own attempt", () => {
    test.each([
      [CONNECTING, {}],
      [WAITING, { connect: null }],
      [MISSING, { inSupportedMode: false, connect: null }],
    ])(
      "an answer that would show %s, arriving after a cancel, is ignored",
      async (_wouldShow, friend) => {
        held.add(FRIEND_ID);
        joinManager.startJoin(FRIEND_ID);
        await flush();
        expect(inFlight).toHaveLength(1);

        const dotCalls = onUpdateDot.mock.calls.length;
        const buttonCalls = onUpdateJoinButton.mock.calls.length;
        joinManager.cancelJoin(FRIEND_ID);

        steam.friends[FRIEND_ID] = friendInfo(friend);
        await answer();
        await jest.advanceTimersByTimeAsync(2000);

        expect(openExternal).not.toHaveBeenCalled();
        // Nothing but the cancel itself reached the UI after it
        const stillRunning = (reportedStatus) => reportedStatus !== CANCELLED;
        expect(
          reported(onUpdateDot, FRIEND_ID, dotCalls).filter(stillRunning)
        ).toEqual([]);
        expect(
          reported(onUpdateJoinButton, FRIEND_ID, buttonCalls).filter(
            stillRunning
          )
        ).toEqual([]);
        expect(status()).toBe(CANCELLED);
        expect(polls()).toBe(1);
      }
    );

    test("cancel and start again while the old snapshot is out: the old loop never acts", async () => {
      held.add(FRIEND_ID);
      joinManager.startJoin(FRIEND_ID);
      await flush();
      const oldState = state();

      joinManager.cancelJoin(FRIEND_ID);
      joinManager.startJoin(FRIEND_ID);
      await flush();
      const newState = state();
      expect(newState).not.toBe(oldState);
      expect(inFlight).toHaveLength(2);

      // The old request comes back offering a free slot
      const [oldRequest] = inFlight.splice(0, 1);
      oldRequest.resolve(snapshotFor(FRIEND_ID));
      await jest.advanceTimersByTimeAsync(2000);

      expect(openExternal).not.toHaveBeenCalled();
      expect(newState.status).toBe(WAITING);
      // The old loop did not ask again; the new one still waits for its answer
      expect(polls()).toBe(2);
      expect(inFlight).toHaveLength(1);

      await answer();
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
      expect(newState.status).toBe(CONNECTING);

      // Only one loop polls from here on
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      expect(polls()).toBe(3);
      expect(inFlight).toHaveLength(1);

      // Cancelling the new attempt stops everything
      joinManager.cancelJoin(FRIEND_ID);
      await answer();
      await jest.advanceTimersByTimeAsync(2000);

      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(polls()).toBe(3);
      expect(inFlight).toHaveLength(0);
      expect(status()).toBe(CANCELLED);
    });

    test("friend A joined while friend B's snapshot is out: B's answer opens nothing", async () => {
      steam.friends[FRIEND_B_ID] = friendInfo({
        connect: CONNECT_B,
        serverId: FRIEND_B_SERVER,
      });
      held.add(FRIEND_B_ID);

      joinManager.startJoin(FRIEND_ID);
      joinManager.startJoin(FRIEND_B_ID);
      await flush();
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
      expect(inFlight.map(({ friendId }) => friendId)).toEqual([FRIEND_B_ID]);

      // The connect works: the user is on A's server at A's next poll
      steam.user = userInfo({ inSupportedMode: true, serverId: FRIEND_SERVER });
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      expect(status(FRIEND_ID)).toBe(JOINED);
      expect(status(FRIEND_B_ID)).toBe(CANCELLED);

      // B's answer arrives late, offering a free slot on B's server
      await answer(FRIEND_B_ID);
      await jest.advanceTimersByTimeAsync(
        API_CONFIG.JOIN_SUCCESS_DISPLAY_MS + 1000
      );

      expect(
        openedUrls().filter((url) =>
          url.startsWith(`steam://rungame/730/${FRIEND_B_ID}/`)
        )
      ).toEqual([]);
      expect(polls(FRIEND_B_ID)).toBe(1);
      expect(status(FRIEND_B_ID)).toBe(CANCELLED);
    });

    test("the end of a JOINED display does not cancel a newer attempt for the friend", async () => {
      steam.user = userInfo({ inSupportedMode: true, serverId: FRIEND_SERVER });
      joinManager.startJoin(FRIEND_ID);
      await flush();
      expect(status()).toBe(JOINED);

      // Cancelled and started again while JOINED is still on screen
      joinManager.cancelJoin(FRIEND_ID);
      steam.user = userInfo();
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });
      joinManager.startJoin(FRIEND_ID);
      await flush();
      const newer = state();

      await jest.advanceTimersByTimeAsync(
        API_CONFIG.JOIN_SUCCESS_DISPLAY_MS + 1000
      );

      expect(state()).toBe(newer);
      expect(joinManager.isActive(newer)).toBe(true);
      expect(newer.status).toBe(WAITING);
    });
  });

  describe("Steam not answering", () => {
    test.each([
      ["the user", () => ({ user: null, friend: friendInfo() })],
      ["the friend", () => ({ user: userInfo(), friend: null })],
      ["either side", () => ({ user: null, friend: null })],
    ])(
      "for %s does not cancel and sends nothing to the game",
      async (_side, snapshot) => {
        SteamAPI.getJoinSnapshot.mockImplementation(async () => snapshot());
        // Half the failure budget
        const outage = API_CONFIG.MISSING_TIMEOUT_MS / 2;

        joinManager.startJoin(FRIEND_ID);
        await jest.advanceTimersByTimeAsync(outage);

        expect(joinManager.isActive(state())).toBe(true);
        expect(status()).toBe(WAITING);
        expect(openExternal).not.toHaveBeenCalled();
        // It keeps asking, once per loop interval
        expect(polls()).toBe(
          Math.floor(outage / API_CONFIG.JOIN_LOOP_INTERVAL_MS) + 1
        );
      }
    );

    test("for longer than MISSING_TIMEOUT_MS in a row cancels the attempt", async () => {
      SteamAPI.getJoinSnapshot.mockImplementation(async () => ({
        user: null,
        friend: null,
      }));

      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(API_CONFIG.MISSING_TIMEOUT_MS - 1000);
      expect(joinManager.isActive(state())).toBe(true);

      await jest.advanceTimersByTimeAsync(2000);
      expect(status()).toBe(CANCELLED);
      expect(onUpdateDot).toHaveBeenLastCalledWith(FRIEND_ID, CANCELLED);
      expect(onUpdateJoinButton).toHaveBeenLastCalledWith(FRIEND_ID, CANCELLED);

      const asked = polls();
      await jest.advanceTimersByTimeAsync(5000);
      expect(polls()).toBe(asked);
    });

    test("a real answer in between starts the failure budget over", async () => {
      let steamDown = true;
      SteamAPI.getJoinSnapshot.mockImplementation(async () =>
        steamDown
          ? { user: null, friend: null }
          : { user: userInfo(), friend: friendInfo({ connect: null }) }
      );

      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(API_CONFIG.MISSING_TIMEOUT_MS - 1000);
      steamDown = false;
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      steamDown = true;
      await jest.advanceTimersByTimeAsync(API_CONFIG.MISSING_TIMEOUT_MS - 1000);

      // Down for longer than the budget in total, but never that long in a row
      expect(joinManager.isActive(state())).toBe(true);
    });
  });

  describe("CS2 closing, as Steam's game log has it", () => {
    // What the log says: open, closed, or null when it cannot tell
    let open;
    let journal;

    beforeEach(() => {
      open = true;
      joinManager.cs2Process = {
        isOpen: jest.fn(() => open),
        check: jest.fn(async () => open),
      };
      journal = {
        record: jest.fn(),
        attemptStarted: jest.fn(),
        attemptEnded: jest.fn(),
      };
      joinManager.journal = journal;
    });

    afterEach(() => {
      joinManager.cs2Process = cs2Process;
      joinManager.journal = joinJournal;
    });

    test("ends a waiting join at once, though CS2's last state is still fresh, and sends nothing", async () => {
      // CS2 in the menu, the friend's server full
      cs2.getGsiUserState.mockReturnValue({
        inMatch: false,
        inMenu: true,
        mode: null,
        mapLoadedAt: 0,
      });
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });
      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(1000);
      expect(status()).toBe(WAITING);

      // The user closes CS2, and a slot opens just then
      open = false;
      steam.friends[FRIEND_ID] = friendInfo();
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

      expect(status()).toBe(CANCELLED);
      expect(openExternal).not.toHaveBeenCalled();
      expect(journal.attemptEnded).toHaveBeenCalledWith(
        FRIEND_ID,
        "cs2-closed"
      );
    });

    test("a CS2 that closes between the snapshot and the connect gets no connect", async () => {
      // Open as the iteration starts, closed by the read right before the connect
      joinManager.cs2Process.check = jest.fn(async () => false);

      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(1000);

      expect(status()).toBe(CANCELLED);
      expect(openExternal).not.toHaveBeenCalled();
      expect(journal.attemptEnded).toHaveBeenCalledWith(
        FRIEND_ID,
        "cs2-closed"
      );
    });

    test("with CS2 open by the log, Steam not showing the user in CS2 does not end the join", async () => {
      // Steam's copy lags, or the user hides their game from Steam
      steam.user = userInfo({ inCS2: false });
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });

      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(5000);

      expect(joinManager.isActive(state())).toBe(true);
    });

    test("without the log, Steam not showing the user in CS2 ends the join, as before", async () => {
      open = null;
      steam.user = userInfo({ inCS2: false });

      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(1000);

      expect(status()).toBe(CANCELLED);
      expect(openExternal).not.toHaveBeenCalled();
      expect(journal.attemptEnded).toHaveBeenCalledWith(FRIEND_ID, "left-cs2");
    });
  });

  describe("starting an attempt", () => {
    test("Steam not answering the CS2 check goes ahead without offering a launch", async () => {
      cs2.checkUserInCS2.mockResolvedValue(null);

      joinManager.startJoin(FRIEND_ID);
      await flush();

      expect(onRequestCS2Launch).not.toHaveBeenCalled();
      expect(polls()).toBe(1);
      expect(joinManager.isActive(state())).toBe(true);
    });

    test("a user out of CS2 is offered a launch, and declining it aborts the join", async () => {
      cs2.checkUserInCS2.mockResolvedValue(false);
      onRequestCS2Launch.mockResolvedValue(false);

      await joinManager.startJoin(FRIEND_ID);

      expect(onRequestCS2Launch).toHaveBeenCalledTimes(1);
      expect(onRequestCS2Launch).toHaveBeenCalledWith(FRIEND_ID);
      expect(state()).toBeUndefined();
      expect(SteamAPI.getJoinSnapshot).not.toHaveBeenCalled();
      expect(onUpdateDot).not.toHaveBeenCalled();
      expect(onUpdateJoinButton).not.toHaveBeenCalled();
    });

    test("accepting the offered launch goes on with the join", async () => {
      cs2.checkUserInCS2.mockResolvedValue(false);
      onRequestCS2Launch.mockResolvedValue(true);

      joinManager.startJoin(FRIEND_ID);
      await flush();

      expect(onRequestCS2Launch).toHaveBeenCalledWith(FRIEND_ID);
      expect(polls()).toBe(1);
      expect(joinManager.isActive(state())).toBe(true);
    });

    test("a second click while the CS2 check is out does not start a second loop", async () => {
      const check = deferred();
      cs2.checkUserInCS2.mockReturnValue(check.promise);
      held.add(FRIEND_ID);

      joinManager.startJoin(FRIEND_ID);
      const second = joinManager.startJoin(FRIEND_ID);
      check.resolve(true);
      await second;
      await flush();

      expect(cs2.checkUserInCS2).toHaveBeenCalledTimes(2);
      expect(inFlight).toHaveLength(1);
      expect(reported(onUpdateDot)).toEqual([WAITING]);

      steam.friends[FRIEND_ID] = friendInfo({ connect: null });
      await answer();
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      expect(polls()).toBe(2);
      expect(inFlight).toHaveLength(1);
    });

    test("a start that fails before its attempt exists leaves the running one alone", async () => {
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });
      joinManager.startJoin(FRIEND_ID);
      await flush();
      const running = state();

      // The fields are empty by the time Join is clicked again
      joinManager.configure({
        getCredentials: () => ({ steamId: "", auth: "" }),
      });
      await joinManager.startJoin(FRIEND_ID);

      expect(logger.error).toHaveBeenCalledWith(
        "JoinManager",
        expect.any(String),
        { join_id: FRIEND_ID, error: "Steam ID and API auth are required" }
      );
      expect(state()).toBe(running);
      expect(joinManager.isActive(running)).toBe(true);

      const asked = polls();
      await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      expect(polls()).toBe(asked + 1);
    });
  });

  describe("one snapshot per iteration", () => {
    test("already on the friend's server: JOINED on the first snapshot, without a connect", async () => {
      steam.user = userInfo({ inSupportedMode: true, serverId: FRIEND_SERVER });

      joinManager.startJoin(FRIEND_ID);
      await flush();

      expect(status()).toBe(JOINED);
      expect(onUpdateDot).toHaveBeenCalledWith(FRIEND_ID, JOINED);
      expect(onUpdateJoinButton).toHaveBeenCalledWith(FRIEND_ID, JOINED);

      // Shown for JOIN_SUCCESS_DISPLAY_MS, then reset
      await jest.advanceTimersByTimeAsync(
        API_CONFIG.JOIN_SUCCESS_DISPLAY_MS - 1
      );
      expect(status()).toBe(JOINED);
      await jest.advanceTimersByTimeAsync(1);
      expect(status()).toBe(CANCELLED);

      await jest.advanceTimersByTimeAsync(2000);
      expect(openExternal).not.toHaveBeenCalled();
      expect(polls()).toBe(1);
    });

    test("on another server while the friend's has a free slot: opens the join URL", async () => {
      steam.user = userInfo({ inSupportedMode: true, serverId: OTHER_SERVER });

      joinManager.startJoin(FRIEND_ID);
      await flush();

      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
      expect(status()).toBe(CONNECTING);
    });

    test("neither side reporting a server does not count as joined", async () => {
      steam.friends[FRIEND_ID] = friendInfo({ serverId: null });

      joinManager.startJoin(FRIEND_ID);
      await flush();

      expect(status()).toBe(CONNECTING);
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
    });

    test("no connect while the friend is in a supported mode: WAITING, nothing opened", async () => {
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });

      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(2000);

      expect(status()).toBe(WAITING);
      expect(openExternal).not.toHaveBeenCalled();
      expect(new Set(reported(onUpdateDot))).toEqual(new Set([WAITING]));
      expect(polls()).toBeGreaterThan(1);
    });

    test("each iteration asks Steam exactly once, through getJoinSnapshot only", async () => {
      held.add(FRIEND_ID);
      joinManager.startJoin(FRIEND_ID);
      await flush();
      expect(SteamAPI.getJoinSnapshot).toHaveBeenCalledTimes(1);

      // A waiting, a missing and a connecting iteration, each with its pause
      const iterations = [
        [friendInfo({ connect: null }), API_CONFIG.JOIN_LOOP_INTERVAL_MS],
        [
          friendInfo({ inSupportedMode: false, connect: null }),
          API_CONFIG.JOIN_LOOP_INTERVAL_MS,
        ],
        [friendInfo(), API_CONFIG.JOIN_RETRY_INTERVAL_MS],
      ];
      for (const [friend, pause] of iterations) {
        const asked = SteamAPI.getJoinSnapshot.mock.calls.length;
        steam.friends[FRIEND_ID] = friend;
        await answer();
        expect(SteamAPI.getJoinSnapshot).toHaveBeenCalledTimes(asked);
        await jest.advanceTimersByTimeAsync(pause);
        expect(SteamAPI.getJoinSnapshot).toHaveBeenCalledTimes(asked + 1);
      }

      // Joined: the attempt ends without asking again
      steam.user = userInfo({ inSupportedMode: true, serverId: FRIEND_SERVER });
      await answer();
      await jest.advanceTimersByTimeAsync(
        API_CONFIG.JOIN_SUCCESS_DISPLAY_MS + 1000
      );
      expect(status()).toBe(CANCELLED);
      expect(SteamAPI.getJoinSnapshot).toHaveBeenCalledTimes(4);

      for (const args of SteamAPI.getJoinSnapshot.mock.calls) {
        expect(args).toEqual([USER_ID, FRIEND_ID, AUTH]);
      }
      const others = steamApiMocks().filter(
        ([name]) => name !== "getJoinSnapshot"
      );
      // The facade's other methods are mocked too, so the check below means something
      expect(others.map(([name]) => name)).toEqual(
        expect.arrayContaining([
          "getPresence",
          "getFriendsStatuses",
          "isPlayerInCS2",
        ])
      );
      expect(
        others
          .filter(([, mock]) => mock.mock.calls.length > 0)
          .map(([name]) => name)
      ).toEqual([]);
    });
  });

  describe("cancelJoin and resetAll", () => {
    test("cancelJoin paints CANCELLED once, with no delayed repaint", async () => {
      steam.friends[FRIEND_ID] = friendInfo({ connect: null });
      joinManager.startJoin(FRIEND_ID);
      await jest.advanceTimersByTimeAsync(500);

      onUpdateDot.mockClear();
      onUpdateJoinButton.mockClear();
      joinManager.cancelJoin(FRIEND_ID);

      expect(onUpdateDot.mock.calls).toEqual([[FRIEND_ID, CANCELLED]]);
      expect(onUpdateJoinButton.mock.calls).toEqual([[FRIEND_ID, CANCELLED]]);

      await jest.advanceTimersByTimeAsync(400);
      expect(onUpdateDot).toHaveBeenCalledTimes(1);
      expect(onUpdateJoinButton).toHaveBeenCalledTimes(1);

      // Nor when the attempt's periodic UI refresh would have run
      await jest.advanceTimersByTimeAsync(2000);
      expect(onUpdateDot).toHaveBeenCalledTimes(1);
      expect(onUpdateJoinButton).toHaveBeenCalledTimes(1);
    });

    test("resetAll paints every attempt CANCELLED and stops the loops", async () => {
      steam.friends[FRIEND_B_ID] = friendInfo({
        connect: CONNECT_B,
        serverId: FRIEND_B_SERVER,
      });
      held.add(FRIEND_B_ID);

      joinManager.startJoin(FRIEND_ID);
      joinManager.startJoin(FRIEND_B_ID);
      await flush();
      // A connected and pauses before its next try; B's snapshot is still out
      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
      expect(inFlight).toHaveLength(1);

      const dotCalls = onUpdateDot.mock.calls.length;
      const buttonCalls = onUpdateJoinButton.mock.calls.length;
      const asked = SteamAPI.getJoinSnapshot.mock.calls.length;
      joinManager.resetAll();

      const cancelledBoth = [
        [FRIEND_ID, CANCELLED],
        [FRIEND_B_ID, CANCELLED],
      ];
      for (const [callback, from] of [
        [onUpdateDot, dotCalls],
        [onUpdateJoinButton, buttonCalls],
      ]) {
        const calls = callback.mock.calls.slice(from);
        expect(calls).toHaveLength(2);
        expect(calls).toEqual(expect.arrayContaining(cancelledBoth));
      }
      expect(joinManager.getJoinStates()).toEqual({});

      await answer(FRIEND_B_ID);
      await jest.advanceTimersByTimeAsync(3000);

      expect(openedUrls()).toEqual([joinUrl(FRIEND_ID, CONNECT)]);
      expect(SteamAPI.getJoinSnapshot).toHaveBeenCalledTimes(asked);
      expect(onUpdateDot.mock.calls.slice(dotCalls)).toHaveLength(2);
      expect(onUpdateJoinButton.mock.calls.slice(buttonCalls)).toHaveLength(2);
    });
  });
});
