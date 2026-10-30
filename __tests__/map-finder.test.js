/**
 * Jest tests for MapFinder - finding official servers by map through players
 */

jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { getPresence: jest.fn(), getFriendIdsOf: jest.fn() },
}));
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import mapFinder, {
  mapLabel,
  compareServers,
  buildServers,
} from "../src/game/map-finder.js";
import gsiManager from "../src/game/gsi-manager.js";
import SteamAPI from "../src/steam/steam-api.js";
import { MAP_FINDER_CONFIG } from "../src/shared/constants.js";

const USER = "76561198000000001";
const A = "76561198000000011";
const B = "76561198000000012";
const C = "76561198000000013";
const D = "76561198000000014";
const E = "76561198000000015";
const DUST_SERVER = "90071992547409921";
const MIRAGE_SERVER = "90071992547409922";
const COMMUNITY_SERVER = "85568392920039425";
const CONNECT = "+gcconnect0A1B2C3D4E5F60718293A4B5";

/** Presence of a player on an official casual Dust II server */
const presence = (steamid, overrides = {}) => ({
  steamid,
  personaname: `player-${steamid.slice(-2)}`,
  inCS2: true,
  inCompetitiveOrPremier: false,
  inSupportedMode: true,
  connect: null,
  serverId: DUST_SERVER,
  mode: "casual",
  map: "de_dust2",
  score: "[ 3 : 1 ]",
  official: true,
  ...overrides,
});

const presenceMap = (...players) =>
  new Map(players.map((player) => [player.steamid, player]));

const configure = (overrides = {}) =>
  mapFinder.configure({
    getAuth: () => "token",
    getUserId: () => USER,
    getFriendIds: () => [],
    getRealFriendIds: () => [],
    getFofKey: () => "",
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mapFinder.reset();
  gsiManager.reset();
  mapFinder.journal = { record: jest.fn() };
  SteamAPI.getPresence.mockResolvedValue(new Map());
  SteamAPI.getFriendIdsOf.mockResolvedValue([]);
});

afterEach(() => {
  mapFinder.reset();
  gsiManager.reset();
  delete global.window.electronAPI;
});

describe("helpers", () => {
  test("mapLabel names known maps and tidies unknown ones", () => {
    expect(mapLabel("de_dust2")).toBe("Dust II");
    expect(mapLabel("cs_office")).toBe("Office");
    expect(mapLabel("de_newmap")).toBe("Newmap");
  });

  test("compareServers puts a free slot first, then the freshest match", () => {
    const servers = [
      { serverId: "full-fresh", freeSlot: false, rounds: 1 },
      { serverId: "free-late", freeSlot: true, rounds: 12 },
      { serverId: "free-fresh", freeSlot: true, rounds: 2 },
    ].sort(compareServers);

    expect(servers.map((s) => s.serverId)).toEqual([
      "free-fresh",
      "free-late",
      "full-fresh",
    ]);
  });

  test("buildServers groups official players and keeps the latest score", () => {
    const servers = buildServers([
      presence(A, { score: "[ 3 : 1 ]" }),
      presence(B, { score: "[ 3 : 2 ]", connect: CONNECT }),
      presence(C, { serverId: MIRAGE_SERVER, map: "de_mirage", score: null }),
      presence(D, { official: false, serverId: COMMUNITY_SERVER }),
      presence(E, { serverId: null }),
    ]);

    expect(servers).toHaveLength(2);
    expect(servers[0]).toMatchObject({
      serverId: DUST_SERVER,
      map: "de_dust2",
      score: "[ 3 : 2 ]",
      rounds: 5,
      freeSlot: true,
    });
    expect(servers[0].players.map((p) => p.steamid)).toEqual([A, B]);
    expect(servers[1]).toMatchObject({ map: "de_mirage", rounds: null, freeSlot: false });
  });
});

describe("refresh", () => {
  test("lists maps and remembers official players in the pool", async () => {
    configure({ getFriendIds: () => [A, B, C, D] });
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        presence(A, { connect: CONNECT }),
        presence(B),
        presence(C, { serverId: MIRAGE_SERVER, map: "de_mirage" }),
        presence(D, { official: false, serverId: COMMUNITY_SERVER })
      )
    );

    await mapFinder.refresh();

    expect(mapFinder.getMaps()).toEqual([
      { map: "de_dust2", label: "Dust II", servers: 1, freeServers: 1 },
      { map: "de_mirage", label: "Mirage", servers: 1, freeServers: 0 },
    ]);
    expect([...mapFinder.pool.keys()].sort()).toEqual([A, B, C].sort());
    expect(mapFinder.getCandidateIds("de_dust2")).toEqual([A, B]);
    expect(mapFinder.getCandidateIds("de_dust2", MIRAGE_SERVER)).toEqual([]);
  });

  test("asks about friends, the pool and seeds, never the user", async () => {
    configure({ getFriendIds: () => [A, USER, "not-an-id"] });
    mapFinder.pool.set(B, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.seeds.add(C);

    await mapFinder.refresh();

    const asked = SteamAPI.getPresence.mock.calls[0][0];
    expect(asked.sort()).toEqual([A, B, C].sort());
    expect(SteamAPI.getPresence.mock.calls[0][1]).toBe("token");
  });

  test("a seed Steam answered about is looked at once", async () => {
    configure();
    mapFinder.seeds.add(C);
    SteamAPI.getPresence.mockResolvedValueOnce(
      presenceMap(presence(C, { official: false, inCS2: false }))
    );

    await mapFinder.refresh();
    expect(mapFinder.seeds.size).toBe(0);

    await mapFinder.refresh();
    expect(SteamAPI.getPresence.mock.calls[1][0]).toEqual([]);
  });

  test("a seed Steam did not answer about is asked about again", async () => {
    configure();
    mapFinder.seeds.add(C);

    await mapFinder.refresh();
    await mapFinder.refresh();

    expect(SteamAPI.getPresence.mock.calls[1][0]).toEqual([C]);
  });

  test("a seed is asked about even when friends and the pool fill every slot", async () => {
    configure({ getFriendIds: () => [A] });
    const now = Date.now();
    for (let i = 0; i < MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH; i++) {
      const id = String(76561198200000000n + BigInt(i));
      mapFinder.pool.set(id, { lastSeen: now, map: "de_dust2" });
    }
    mapFinder.seeds.add(C);
    SteamAPI.getPresence.mockResolvedValueOnce(presenceMap(presence(C)));

    await mapFinder.refresh();

    const asked = SteamAPI.getPresence.mock.calls[0][0];
    expect(asked).toHaveLength(MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH);
    expect(asked).toContain(C);
    expect(mapFinder.seeds.size).toBe(0);
  });

  test("friends of friends take the room left, a different slice each time", async () => {
    configure({ getFriendIds: () => [A] });
    const fof = Array.from({ length: MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH + 10 }, (_, i) =>
      String(76561198100000000n + BigInt(i))
    );
    mapFinder.fof = { ids: fof, fetchedAt: Date.now(), friendsCount: 1 };

    await mapFinder.refresh();
    await mapFinder.refresh();

    const first = SteamAPI.getPresence.mock.calls[0][0];
    const second = SteamAPI.getPresence.mock.calls[1][0];
    expect(first).toHaveLength(MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH);
    expect(first[0]).toBe(A);
    expect(first[1]).toBe(fof[0]);
    expect(second[1]).toBe(fof[MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH - 1]);
  });

  test("does nothing without auth", async () => {
    configure({ getAuth: () => "" });

    await mapFinder.refresh();

    expect(SteamAPI.getPresence).not.toHaveBeenCalled();
  });

  test("a refresh asked for during another one runs right after it", async () => {
    configure({ getFriendIds: () => [A] });
    let finish;
    SteamAPI.getPresence.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve))
    );

    const first = mapFinder.refresh();
    await mapFinder.refresh();
    finish(new Map());
    await first;

    expect(SteamAPI.getPresence).toHaveBeenCalledTimes(2);
  });

  test("drops pool entries past their time and keeps the newest", async () => {
    configure();
    const now = Date.now();
    mapFinder.pool.set(A, { lastSeen: now - MAP_FINDER_CONFIG.POOL_TTL_MS - 1, map: "de_dust2" });
    mapFinder.pool.set(B, { lastSeen: now - 1000, map: "de_dust2" });

    await mapFinder.refresh();

    expect([...mapFinder.pool.keys()]).toEqual([B]);
  });

  test("the player the user spectates becomes a seed", () => {
    configure();
    gsiManager.handlePayload({
      provider: { steamid: USER },
      map: { mode: "casual", name: "de_dust2" },
      player: { steamid: E, activity: "playing" },
    });

    expect(mapFinder.seeds.has(E)).toBe(true);
  });

  test("every player CS2 lists becomes a seed", () => {
    configure();
    gsiManager.handlePayload({
      provider: { steamid: USER },
      map: { mode: "casual", name: "de_dust2" },
      player: { steamid: USER, activity: "playing" },
      allplayers: { [USER]: {}, [D]: {}, [E]: {} },
    });

    expect([...mapFinder.seeds].sort()).toEqual([D, E].sort());
  });
});

describe("players seen in the user's match", () => {
  /** CS2 reporting a casual match on Dust II with everyone listed */
  const matchWith = (...ids) =>
    gsiManager.handlePayload({
      provider: { steamid: USER },
      map: { mode: "casual", name: "de_dust2" },
      player: { steamid: USER, activity: "playing" },
      allplayers: Object.fromEntries([USER, ...ids].map((id) => [id, {}])),
    });
  /** Let the check that a GSI state started run to its end */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    configure();
  });

  test("are asked about at once, with no refresh, and the official ones join the pool", async () => {
    const save = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn().mockResolvedValue({
          pool: { [A]: { lastSeen: Date.now(), map: "de_mirage" } },
        }),
        save,
      },
    };
    SteamAPI.getPresence.mockResolvedValueOnce(
      presenceMap(presence(D), presence(E, { official: false, inCS2: false }))
    );

    matchWith(D, E);
    await settle();

    expect(SteamAPI.getPresence).toHaveBeenCalledWith(
      expect.arrayContaining([D, E]),
      "token"
    );
    // The pool on disk was read first, so it keeps what it had
    expect([...mapFinder.pool.keys()].sort()).toEqual([A, D].sort());
    expect(mapFinder.seeds.size).toBe(0);
    expect(mapFinder.journal.record).toHaveBeenCalledWith("seeds", {
      asked: 2,
      answered: 2,
      pooled: 1,
      notInGame: 1,
      other: 0,
    });
  });

  test("in another mode are not asked about", async () => {
    gsiManager.handlePayload({
      provider: { steamid: USER },
      map: { mode: "competitive", name: "de_dust2" },
      player: { steamid: E, activity: "playing" },
      allplayers: { [USER]: {}, [D]: {}, [E]: {} },
    });
    await settle();

    expect(mapFinder.seeds.size).toBe(0);
    expect(SteamAPI.getPresence).not.toHaveBeenCalled();
  });

  test("a player answered about once is not asked about again", async () => {
    SteamAPI.getPresence.mockResolvedValueOnce(
      presenceMap(presence(D, { official: false, inCS2: false }))
    );

    matchWith(D);
    await settle();
    matchWith(D);
    await settle();

    expect(SteamAPI.getPresence).toHaveBeenCalledTimes(1);
  });
});

describe("friends of friends", () => {
  const FRIEND_1 = "76561198000000021";
  const FRIEND_2 = "76561198000000022";

  test("reads friends' lists, leaving out the user and their friends", async () => {
    configure({
      getRealFriendIds: () => [FRIEND_1, FRIEND_2],
      getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
    });
    SteamAPI.getFriendIdsOf
      .mockResolvedValueOnce([USER, FRIEND_2, A, B])
      .mockResolvedValueOnce([A, C]);

    await mapFinder._crawlFof();

    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledWith(
      FRIEND_1,
      "ABCDEF0123456789ABCDEF0123456789"
    );
    expect(mapFinder.fof.ids.sort()).toEqual([A, B, C].sort());
    expect(mapFinder.fof.friendsCount).toBe(2);
    expect(mapFinder.getStatus().fof).toBe("ready");
  });

  test("not one readable list counts as an error and is retried later", async () => {
    configure({
      getRealFriendIds: () => [FRIEND_1, FRIEND_2],
      getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
    });

    await mapFinder._crawlFof();

    expect(mapFinder.getStatus().fof).toBe("error");
    expect(mapFinder.fof.fetchedAt).toBe(0);
    expect(mapFinder._fofDue()).toBe(true);
  });

  test("is not due without a key, and due again a day later", () => {
    configure({ getRealFriendIds: () => [FRIEND_1] });
    expect(mapFinder._fofDue()).toBe(false);
    expect(mapFinder.getStatus().fof).toBe("no-key");

    configure({
      getRealFriendIds: () => [FRIEND_1],
      getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
    });
    mapFinder.fof = { ids: [A], fetchedAt: Date.now(), friendsCount: 1 };
    expect(mapFinder._fofDue()).toBe(false);

    mapFinder.fof.fetchedAt = Date.now() - MAP_FINDER_CONFIG.FOF_REFRESH_MS;
    expect(mapFinder._fofDue()).toBe(true);
  });

  test("after the key is deleted, friends of friends read before stay in use", async () => {
    configure({ getFriendIds: () => [], getRealFriendIds: () => [FRIEND_1] });
    mapFinder.fof = { ids: [A, B], fetchedAt: 1, friendsCount: 1 };

    expect(mapFinder._fofDue()).toBe(false);
    expect(mapFinder.getStatus()).toMatchObject({ fof: "ready", fofSize: 2 });

    await mapFinder.refresh();
    expect(SteamAPI.getPresence.mock.calls[0][0].sort()).toEqual([A, B].sort());
  });
});

describe("store", () => {
  test("loads valid pool entries and friends of friends from disk", async () => {
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn().mockResolvedValue({
          pool: {
            [A]: { lastSeen: Date.now(), map: "de_dust2" },
            "not-an-id": { lastSeen: Date.now() },
            [B]: { map: "de_dust2" },
          },
          fof: { ids: [C, "junk"], fetchedAt: 123, friendsCount: 4 },
        }),
        save: jest.fn().mockResolvedValue(true),
      },
    };

    await mapFinder._load();

    expect([...mapFinder.pool.keys()]).toEqual([A]);
    expect(mapFinder.fof).toEqual({ ids: [C], fetchedAt: 123, friendsCount: 4 });
  });

  test("saves once shortly after changes", async () => {
    jest.useFakeTimers();
    const save = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = { mapFinder: { save } };
    configure({ getFriendIds: () => [A] });
    SteamAPI.getPresence.mockResolvedValue(presenceMap(presence(A)));

    await mapFinder.refresh();
    await mapFinder.refresh();
    jest.advanceTimersByTime(2000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].pool[A]).toMatchObject({ map: "de_dust2" });
    jest.useRealTimers();
  });
});
