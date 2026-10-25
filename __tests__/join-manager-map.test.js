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

  test("waits while every known server of the map is full", async () => {
    SteamAPI.getPresence.mockResolvedValue(presenceMap(user(), presence(A), presence(B)));

    joinManager.startMapJoin(dustTarget());
    await jest.advanceTimersByTimeAsync(1000);

    expect(openExternal).not.toHaveBeenCalled();
    expect(joinManager.getJoinStates()[getMapJoinId("de_dust2")].status).toBe(
      STATUS_TYPES.WAITING
    );
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
