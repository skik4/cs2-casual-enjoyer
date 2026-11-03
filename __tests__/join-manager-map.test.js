/**
 * Jest tests for JoinManager joining a map or one server through the players
 * known to be there
 */

jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/steam/steam-api.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import joinManager, {
  getMapJoinId,
  getServerJoinId,
} from "../src/game/join-manager.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
import SteamAPI from "../src/steam/steam-api.js";
import DOMUtils from "../src/utils/dom-utils.js";
import Validators from "../src/utils/validators.js";

const USER = "76561198000000001";
const A = "76561198000000011";
const B = "76561198000000012";
const C = "76561198000000013";
const AUTH = "ABCD1234EFGH5678IJKL9012MNOP3456";
const DUST_1 = "90071992547409921";
const DUST_2 = "90071992547409922";
const CONNECT_B = "+gcconnect0B0B0B0B0B0B0B0B0B0B0B0B";
const CONNECT_C = "+gcconnect0C0C0C0C0C0C0C0C0C0C0C0C";

/** Presence on an official casual Dust II server */
const presence = (steamid, overrides = {}) => ({
  steamid,
  personaname: steamid,
  inCS2: true,
  inCompetitiveOrPremier: false,
  inSupportedMode: true,
  connect: null,
  serverId: DUST_1,
  mode: "casual",
  map: "de_dust2",
  score: "[ 1 : 1 ]",
  official: true,
  ...overrides,
});

const user = (overrides = {}) =>
  presence(USER, { inSupportedMode: false, serverId: null, mode: null, map: null, official: false, ...overrides });

const presenceMap = (...players) =>
  new Map(players.map((player) => [player.steamid, player]));

const dustTarget = (overrides = {}) => ({
  map: "de_dust2",
  serverId: null,
  label: "Dust II",
  getCandidateIds: () => [A, B, C],
  ...overrides,
});

describe("getMapJoinId / getServerJoinId", () => {
  test("build ids that never look like a SteamID64", () => {
    expect(getMapJoinId("de_dust2")).toBe("map-de_dust2");
    expect(getServerJoinId(DUST_1)).toBe(`srv-${DUST_1}`);
  });
});

describe("resolveMapTarget", () => {
  test("joins through the first candidate on the map that offers a connect", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        user(),
        presence(A),
        presence(B, { connect: CONNECT_B }),
        presence(C, { serverId: DUST_2, connect: CONNECT_C })
      )
    );

    const { user: userInfo, target } = await joinManager.resolveMapTarget(
      dustTarget(),
      USER,
      AUTH
    );

    expect(SteamAPI.getPresence).toHaveBeenCalledWith([USER, A, B, C], AUTH);
    expect(userInfo.steamid).toBe(USER);
    expect(target).toMatchObject({
      personaname: "Dust II",
      inSupportedMode: true,
      connect: CONNECT_B,
      joinAs: B,
    });
  });

  test("takes its status from the candidate it joins through", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(user(), presence(B, { connect: CONNECT_B, statusKey: "round 3" }))
    );
    const first = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);

    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(user(), presence(B, { connect: CONNECT_B, statusKey: "round 4" }))
    );
    const second = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);

    SteamAPI.getPresence.mockResolvedValue(presenceMap(user(), presence(B)));
    const full = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);

    expect(first.target.statusKey).toBe(`${B}\nround 3`);
    expect(second.target.statusKey).toBe(`${B}\nround 4`);
    expect(full.target.statusKey).toBeNull();
  });

  test("ignores candidates who moved to another map, a match or a community server", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        user(),
        presence(A, { map: "de_mirage", connect: CONNECT_B }),
        presence(B, { mode: "competitive", official: false, inSupportedMode: false, connect: CONNECT_B }),
        presence(C, { official: false, connect: CONNECT_C })
      )
    );

    const { target } = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);

    expect(target).toMatchObject({ inSupportedMode: false, connect: null, joinAs: null });
  });

  test("sticks to the chosen server", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(user(), presence(B, { connect: CONNECT_B }), presence(C, { serverId: DUST_2 }))
    );

    const { target } = await joinManager.resolveMapTarget(
      dustTarget({ serverId: DUST_2 }),
      USER,
      AUTH
    );

    expect(target).toMatchObject({ inSupportedMode: true, connect: null });
  });

  test("reports Steam not answering for the user as unknown", async () => {
    SteamAPI.getPresence.mockResolvedValue(presenceMap(presence(A)));

    await expect(
      joinManager.resolveMapTarget(dustTarget(), USER, AUTH)
    ).resolves.toEqual({ user: null, target: null });
  });

  test("a map join succeeds on any server of the map", async () => {
    SteamAPI.getPresence.mockResolvedValue(presenceMap(user(), presence(A)));
    const { target } = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);

    expect(target.isJoined(user({ serverId: DUST_1 }))).toBe(true);
    // A Dust II server none of the candidates is on any more
    expect(
      target.isJoined(
        user({ serverId: DUST_2, official: true, mode: "casual", map: "de_dust2" })
      )
    ).toBe(true);
    expect(
      target.isJoined(user({ serverId: DUST_2, official: true, mode: "casual", map: "de_mirage" }))
    ).toBe(false);
    expect(target.isJoined(user())).toBe(false);
  });

  test("skips a finished match and the user's own server", async () => {
    const DUST_3 = "90071992547409923";
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        user({ serverId: DUST_1, official: true, mode: "casual", map: "de_dust2" }),
        presence(A, { connect: CONNECT_B }),
        presence(B, { serverId: DUST_2, score: "[ 8 : 2 ]", connect: CONNECT_B }),
        presence(C, { serverId: DUST_3, connect: CONNECT_C })
      )
    );

    const { target } = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);

    expect(target).toMatchObject({ inSupportedMode: true, connect: CONNECT_C, joinAs: C });
  });

  test("a map join goes by the map CS2 shows, not the one Steam still shows", async () => {
    let gsi = null;
    joinManager.setCS2Manager({ getGsiUserState: () => gsi });
    try {
      SteamAPI.getPresence.mockResolvedValue(presenceMap(user(), presence(A)));
      const { target } = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);
      const onDust = user({ serverId: DUST_1, official: true, mode: "casual", map: "de_dust2" });
      const inMatch = (mapName, phase) => ({ inMatch: true, mode: "casual", mapName, phase });

      // As seen live: the match ended and the server loaded Inferno while
      // Steam still showed Dust II
      gsi = inMatch("de_inferno", "warmup");
      expect(target.isJoined(onDust)).toBe(false);
      gsi = inMatch("de_dust2", "gameover");
      expect(target.isJoined(onDust)).toBe(false);
      gsi = inMatch("de_dust2", "live");
      expect(target.isJoined(user())).toBe(true);
    } finally {
      joinManager.setCS2Manager(null);
    }
  });

  test("a map join does not count a match on the map in another mode", async () => {
    // GSI cannot tell a deathmatch on Dust II from a casual match there by
    // the map alone; only a casual match is what the attempt joins
    let gsi = null;
    joinManager.setCS2Manager({ getGsiUserState: () => gsi });
    try {
      SteamAPI.getPresence.mockResolvedValue(presenceMap(user(), presence(A)));
      const { target } = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);
      const inMatch = (mode) => ({ inMatch: true, mode, mapName: "de_dust2", phase: "live" });

      gsi = inMatch("deathmatch");
      expect(target.isJoined(user())).toBe(false);
      gsi = inMatch("casual");
      expect(target.isJoined(user())).toBe(true);
    } finally {
      joinManager.setCS2Manager(null);
    }
  });

  test("without CS2's state, a finished match on the user's own server is not a join", async () => {
    // GSI is off until CS2 is restarted after the first run. Steam alone
    // then shows the user on a Dust II server whose match is over - the one
    // they are about to be moved off, not one the attempt joined
    const DUST_3 = "90071992547409923";
    const over = user({
      serverId: DUST_1,
      official: true,
      inSupportedMode: true,
      mode: "casual",
      map: "de_dust2",
      score: "[ 8 : 2 ]",
    });
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(over, presence(A, { score: "[ 8 : 2 ]" }), presence(C, { serverId: DUST_3, connect: CONNECT_C }))
    );

    const { user: userInfo, target } = await joinManager.resolveMapTarget(dustTarget(), USER, AUTH);

    expect(target).toMatchObject({ inSupportedMode: true, connect: CONNECT_C, joinAs: C });
    expect(target.isJoined(userInfo)).toBe(false);
    // Landing on the other server counts, as does any running Dust II match
    expect(target.isJoined(user({ serverId: DUST_3 }))).toBe(true);
    expect(target.isJoined({ ...over, serverId: DUST_3, score: "[ 0 : 0 ]" })).toBe(true);
  });

  test("a join of several maps takes a server of any of them", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        user(),
        presence(A, { map: "de_inferno", connect: CONNECT_B }),
        presence(B, { serverId: DUST_2, map: "de_mirage", connect: CONNECT_C })
      )
    );

    const { target } = await joinManager.resolveMapTarget(
      {
        joinId: "maps-pinned",
        maps: () => ["de_dust2", "de_mirage"],
        label: () => "Dust II / Mirage",
        getCandidateIds: () => [A, B],
      },
      USER,
      AUTH
    );

    expect(target).toMatchObject({
      personaname: "Dust II / Mirage",
      inSupportedMode: true,
      connect: CONNECT_C,
      joinAs: B,
    });
    const onMap = (map) => user({ serverId: DUST_1, official: true, mode: "casual", map });
    expect(target.isJoined(onMap("de_mirage"))).toBe(true);
    expect(target.isJoined(onMap("de_inferno"))).toBe(false);
  });

  test("a server join succeeds on that server only", async () => {
    SteamAPI.getPresence.mockResolvedValue(presenceMap(user(), presence(A)));
    const { target } = await joinManager.resolveMapTarget(
      dustTarget({ serverId: DUST_1 }),
      USER,
      AUTH
    );

    expect(target.isJoined(user({ serverId: DUST_1 }))).toBe(true);
    expect(
      target.isJoined(user({ serverId: DUST_2, official: true, mode: "casual", map: "de_dust2" }))
    ).toBe(false);
  });
});

describe("startMapJoin", () => {
  let openExternal;
  let updateDot;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    joinManager.setCS2Manager({
      checkUserInCS2: jest.fn().mockResolvedValue(true),
      getGsiUserState: () => null,
    });
    updateDot = jest.fn();
    joinManager.setUICallbacks(updateDot, jest.fn());
    DOMUtils.getElementById.mockImplementation(
      (id) => ({ "steam-id": { value: USER }, auth: { value: AUTH } })[id] || null
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

  test("connects through a candidate and finishes once on the map", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(user(), presence(A), presence(B, { connect: CONNECT_B }))
    );
    const joinId = getMapJoinId("de_dust2");

    joinManager.startMapJoin(dustTarget());
    await jest.advanceTimersByTimeAsync(100);

    expect(openExternal).toHaveBeenCalledWith(`steam://rungame/730/${B}/${CONNECT_B}`);
    expect(joinManager.getJoinStates()[joinId].status).toBe(STATUS_TYPES.CONNECTING);
    expect(updateDot).toHaveBeenCalledWith(joinId, STATUS_TYPES.CONNECTING);

    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(user({ serverId: DUST_1 }), presence(A), presence(B))
    );
    await jest.advanceTimersByTimeAsync(600);

    expect(joinManager.getJoinStates()[joinId].status).toBe(STATUS_TYPES.JOINED);
  });

  test("a server of the map the user just left does not count while CS2 shows the menu", async () => {
    // As seen live: Steam kept showing the old server after CS2 was back in
    // the menu, and a new attempt ended as joined at once
    joinManager.setCS2Manager({
      checkUserInCS2: jest.fn().mockResolvedValue(true),
      getGsiUserState: () => ({
        inMatch: false,
        inMenu: true,
        mode: null,
        inCompetitiveOrPremier: false,
        mapLoadedAt: 0,
      }),
    });
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        user({ serverId: DUST_1, official: true, mode: "casual", map: "de_dust2" }),
        presence(A)
      )
    );

    joinManager.startMapJoin(dustTarget());
    await jest.advanceTimersByTimeAsync(1000);

    expect(joinManager.getJoinStates()[getMapJoinId("de_dust2")].status).toBe(
      STATUS_TYPES.WAITING
    );
    expect(openExternal).not.toHaveBeenCalled();
  });

  test("without CS2's state the user's finished match does not end the attempt", async () => {
    const DUST_3 = "90071992547409923";
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        user({
          serverId: DUST_1,
          official: true,
          inSupportedMode: true,
          mode: "casual",
          map: "de_dust2",
          score: "[ 8 : 2 ]",
        }),
        presence(C, { serverId: DUST_3, connect: CONNECT_C })
      )
    );

    joinManager.startMapJoin(dustTarget());
    await jest.advanceTimersByTimeAsync(1000);

    expect(updateDot).not.toHaveBeenCalledWith(getMapJoinId("de_dust2"), STATUS_TYPES.JOINED);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(`steam://rungame/730/${C}/${CONNECT_C}`);
    expect(joinManager.getJoinStates()[getMapJoinId("de_dust2")].status).toBe(
      STATUS_TYPES.CONNECTING
    );
  });

  test("a server and its map joined at once through one player send one connect", async () => {
    // As seen live on 2026-11-03: both attempts sent the same connect in the
    // same second, and the second could only be turned away
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(user(), presence(B, { connect: CONNECT_B }))
    );

    joinManager.startMapJoin(dustTarget({ serverId: DUST_1 }));
    joinManager.startMapJoin(dustTarget());
    await jest.advanceTimersByTimeAsync(1000);

    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(`steam://rungame/730/${B}/${CONNECT_B}`);
  });

  test("waits while every known server of the map is full", async () => {
    SteamAPI.getPresence.mockResolvedValue(presenceMap(user(), presence(A), presence(B)));

    joinManager.startMapJoin(dustTarget());
    await jest.advanceTimersByTimeAsync(1000);

    expect(openExternal).not.toHaveBeenCalled();
    expect(joinManager.getJoinStates()[getMapJoinId("de_dust2")].status).toBe(
      STATUS_TYPES.WAITING
    );
  });

  test("an attempt is named after its label before Steam answers", async () => {
    // The join bar shows the attempt from its first moment; a server join
    // would otherwise read "srv-9007..." until the first snapshot is in
    SteamAPI.getPresence.mockReturnValue(new Promise(() => {}));

    joinManager.startMapJoin(dustTarget({ serverId: DUST_2, label: "Dust II 3 : 1" }));
    await jest.advanceTimersByTimeAsync(0);

    const state = joinManager.getJoinStates()[getServerJoinId(DUST_2)];
    expect(state.status).toBe(STATUS_TYPES.WAITING);
    expect(state.personaname).toBe("Dust II 3 : 1");
  });

  test("a server join is tracked under its own id", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(user(), presence(C, { serverId: DUST_2, connect: CONNECT_C }))
    );

    joinManager.startMapJoin(dustTarget({ serverId: DUST_2 }));
    await jest.advanceTimersByTimeAsync(100);

    expect(openExternal).toHaveBeenCalledWith(`steam://rungame/730/${C}/${CONNECT_C}`);
    expect(joinManager.getJoinStates()[getServerJoinId(DUST_2)].status).toBe(
      STATUS_TYPES.CONNECTING
    );
  });
});
