/**
 * Jest tests for MapFinder - finding official servers by map through players
 */

jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { getPresence: jest.fn(), getFriendIdsOf: jest.fn() },
}));
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import mapFinder, {
  compareServers,
  buildServers,
  bestPrimeCheck,
  FRIEND_CHECKS_PER_REFRESH,
  FRIEND_LISTS_MAX_IDS,
} from "../src/game/map-finder.js";
import gsiManager from "../src/game/gsi-manager.js";
import userLocation from "../src/game/user-location.js";
import SteamAPI from "../src/steam/steam-api.js";
import credentialState from "../src/steam/credential-state.js";
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
  inProtectedMatch: false,
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
    expect(servers[1]).toMatchObject({
      map: "de_mirage",
      rounds: null,
      freeSlot: false,
    });
  });

  test("buildServers marks a match that has ended", () => {
    const [server] = buildServers([presence(A, { score: "[ 8 : 2 ]" })]);

    expect(server).toMatchObject({
      score: "[ 8 : 2 ]",
      rounds: 10,
      over: true,
    });
  });

  test("after a match a server's next map wins over players still showing the last one", () => {
    // As seen live: the server kept its id, loaded Inferno, and the final
    // score of the Dust II match outweighed everything else
    const since = { [A]: 1000, [B]: 2000 };
    const players = [
      presence(A, { score: "[ 8 : 2 ]", connect: CONNECT }),
      presence(B, { map: "de_inferno", score: null }),
    ];

    const [server] = buildServers(players, (id) => since[id]);

    expect(server).toMatchObject({
      map: "de_inferno",
      score: null,
      rounds: null,
      over: false,
      freeSlot: false,
    });
    expect(server.players.map((p) => p.steamid)).toEqual([B]);
  });

  test("without a history a running match wins over a finished one", () => {
    const [server] = buildServers([
      presence(A, { score: "[ 8 : 2 ]" }),
      presence(B, { map: "de_inferno", score: "[ 0 : 0 ]" }),
    ]);

    expect(server).toMatchObject({ map: "de_inferno", over: false });
  });

  test("compareServers puts finished matches last", () => {
    const running = { freeSlot: false, rounds: 3, over: false };
    const finished = { freeSlot: true, rounds: 10, over: true };

    expect([finished, running].sort(compareServers)).toEqual([
      running,
      finished,
    ]);
  });
});

describe("a credential Steam turned down", () => {
  afterEach(() => credentialState.reset());

  test("refreshes nothing and keeps the servers known until it is taken again", async () => {
    configure({ getFriendIds: () => [A] });
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(presence(A, { connect: CONNECT }))
    );
    await mapFinder.refresh();
    expect(mapFinder.getCandidateIds("de_dust2")).toEqual([A]);

    credentialState.reject("token");
    SteamAPI.getPresence.mockClear();
    await mapFinder.refresh();

    expect(SteamAPI.getPresence).not.toHaveBeenCalled();
    expect(mapFinder.getCandidateIds("de_dust2")).toEqual([A]);

    credentialState.accept("token");
    await mapFinder.refresh();
    expect(SteamAPI.getPresence).toHaveBeenCalledTimes(1);
  });
});

describe("finished matches and the user's own server", () => {
  const OTHER_DUST = "90071992547409923";

  beforeEach(() => {
    configure({ getFriendIds: () => [A, B, C] });
  });

  afterEach(() => {
    userLocation.reset();
  });

  test("offer nothing to join", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        presence(A, { score: "[ 8 : 2 ]", connect: CONNECT }),
        presence(B, { serverId: OTHER_DUST, connect: CONNECT }),
        presence(C, {
          serverId: MIRAGE_SERVER,
          map: "de_mirage",
          connect: CONNECT,
        })
      )
    );
    userLocation.setSteamPresence(presence(USER, { serverId: OTHER_DUST }));

    await mapFinder.refresh();

    expect(mapFinder.getCandidateIds("de_dust2")).toEqual([]);
    expect(mapFinder.getCandidateIds("de_mirage")).toEqual([C]);
    expect(mapFinder.getMaps().find((m) => m.map === "de_dust2")).toMatchObject(
      {
        servers: 2,
        freeServers: 0,
      }
    );
  });

  test("the user's server follows CS2 when it moves on to its next map", async () => {
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(presence(A, { score: "[ 8 : 2 ]", connect: CONNECT }))
    );
    userLocation.setSteamPresence(presence(USER));
    gsiManager.handlePayload({
      provider: { steamid: USER },
      map: { mode: "casual", name: "de_inferno", phase: "warmup" },
      player: { steamid: USER, activity: "playing" },
    });

    await mapFinder.refresh();

    expect(mapFinder.getServers("de_dust2")).toEqual([]);
    expect(mapFinder.getServers("de_inferno")).toEqual([
      expect.objectContaining({
        serverId: DUST_SERVER,
        over: false,
        score: null,
        players: [],
      }),
    ]);
  });
});

describe("refresh", () => {
  test("lists maps, and the friends on them do not join the pool", async () => {
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
      {
        map: "de_dust2",
        label: "Dust II",
        servers: 1,
        freeServers: 1,
        primeServers: 0,
      },
      {
        map: "de_mirage",
        label: "Mirage",
        servers: 1,
        freeServers: 0,
        primeServers: 0,
      },
    ]);
    // The pool keeps to the user's own matches
    expect(mapFinder.pool.size).toBe(0);
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
    const fof = Array.from(
      { length: MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH + 10 },
      (_, i) => String(76561198100000000n + BigInt(i))
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

  test("a refresh Steam did not answer at all keeps the servers known", async () => {
    jest.useFakeTimers();
    try {
      configure({ getFriendIds: () => [A] });
      SteamAPI.getPresence.mockResolvedValueOnce(
        presenceMap(presence(A, { connect: CONNECT }))
      );
      await mapFinder.refresh();
      const { lastRefreshAt } = mapFinder.getStatus();

      // Every request failed - Steam down, the token expired, the daily limit
      // reached - so not one id was answered about. A join under way would
      // otherwise lose its candidates and the list go blank.
      jest.advanceTimersByTime(MAP_FINDER_CONFIG.REFRESH_INTERVAL_MS);
      SteamAPI.getPresence.mockResolvedValueOnce(new Map());
      await mapFinder.refresh();

      expect(mapFinder.getCandidateIds("de_dust2")).toEqual([A]);
      expect(mapFinder.getStatus()).toMatchObject({
        lastRefreshAt,
        refreshing: false,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("only the user's own matches add to the pool: friends, friends of pool players and friends of friends feed the list alone", async () => {
    const X = "76561198000000031";
    const Y = "76561198000000032";
    configure({ getFriendIds: () => [A] });
    mapFinder.seeds.add(D);
    mapFinder.poolFriends = { ids: [X], crawled: {} };
    mapFinder.fof = { ids: [Y], fetchedAt: Date.now(), friendsCount: 1 };
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(presence(A), presence(D), presence(X), presence(Y))
    );

    await mapFinder.refresh();

    expect([...mapFinder.pool.keys()]).toEqual([D]);
    expect(mapFinder.getServers("de_dust2")).toHaveLength(1);
    expect(mapFinder.getCandidateIds("de_dust2").sort()).toEqual(
      [A, D, X, Y].sort()
    );
  });

  test("a pool player seen on an official server again stays another two weeks", async () => {
    configure();
    const old = Date.now() - MAP_FINDER_CONFIG.POOL_TTL_MS + 60000;
    mapFinder.pool.set(B, { lastSeen: old, map: "de_dust2" });
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(presence(B, { serverId: MIRAGE_SERVER, map: "de_mirage" }))
    );

    await mapFinder.refresh();

    expect(mapFinder.pool.get(B).lastSeen).toBeGreaterThan(old);
    expect(mapFinder.pool.get(B).map).toBe("de_mirage");
  });

  test("drops pool entries past their time and keeps the newest", async () => {
    configure();
    const now = Date.now();
    mapFinder.pool.set(A, {
      lastSeen: now - MAP_FINDER_CONFIG.POOL_TTL_MS - 1,
      map: "de_dust2",
    });
    mapFinder.pool.set(B, { lastSeen: now - 1000, map: "de_dust2" });
    // Steam answers about both: neither is in CS2 right now
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        presence(A, { official: false, inCS2: false }),
        presence(B, { official: false, inCS2: false })
      )
    );

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
    expect(mapFinder.getStatus().fof).toBe("idle");
  });

  test("not one readable list counts as an error, and what was read before stays", async () => {
    jest.useFakeTimers();
    try {
      configure({
        getRealFriendIds: () => [FRIEND_1, FRIEND_2],
        getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
      });
      mapFinder.fof = { ids: [A], fetchedAt: 123, friendsCount: 2 };

      const crawl = mapFinder._crawlFof();
      await jest.advanceTimersByTimeAsync(
        MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS * 2
      );
      await crawl;

      expect(mapFinder.getStatus().fof).toBe("error");
      expect(mapFinder.fof).toEqual({
        ids: [A],
        fetchedAt: 123,
        friendsCount: 2,
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test("are read only when the user asks, and only with a key", async () => {
    configure({ getRealFriendIds: () => [FRIEND_1] });
    expect(mapFinder.readFof()).toBe(false);

    // The periodic step reads no list, key or not
    configure({
      getRealFriendIds: () => [FRIEND_1],
      getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
    });
    mapFinder._tick();
    await Promise.resolve();
    expect(SteamAPI.getFriendIdsOf).not.toHaveBeenCalled();

    SteamAPI.getFriendIdsOf.mockResolvedValue([A]);
    expect(mapFinder.readFof()).toBe(true);
    // One read at a time
    expect(mapFinder.readFof()).toBe(false);
    expect(mapFinder.getStatus().fofProgress).toEqual({ done: 0, total: 1 });
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledWith(
      FRIEND_1,
      "ABCDEF0123456789ABCDEF0123456789"
    );
  });

  test("clearing them stops a read under way, which then adds nothing", async () => {
    configure({
      getRealFriendIds: () => [FRIEND_1],
      getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
    });
    mapFinder.fof = { ids: [A], fetchedAt: 1, friendsCount: 1 };
    let answer;
    SteamAPI.getFriendIdsOf.mockImplementation(
      () => new Promise((resolve) => (answer = resolve))
    );

    mapFinder.readFof();
    mapFinder.clearFof();
    answer([B, C]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mapFinder.fof.ids).toEqual([]);
    expect(mapFinder.getStatus()).toMatchObject({ fof: "idle", fofSize: 0 });
  });

  test("after the key is deleted, friends of friends read before stay in use", async () => {
    configure({ getFriendIds: () => [], getRealFriendIds: () => [FRIEND_1] });
    mapFinder.fof = { ids: [A, B], fetchedAt: 1, friendsCount: 1 };

    expect(mapFinder.readFof()).toBe(false);
    expect(mapFinder.getStatus()).toMatchObject({ fof: "idle", fofSize: 2 });

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
    expect(mapFinder.fof).toEqual({
      ids: [C],
      fetchedAt: 123,
      friendsCount: 4,
    });
  });

  test("a load asked for while the first is still reading waits for its data", async () => {
    let deliver;
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn(() => new Promise((resolve) => (deliver = resolve))),
        save: jest.fn().mockResolvedValue(true),
      },
    };

    const first = mapFinder._load();
    let secondDone = false;
    const second = mapFinder._load().then(() => {
      secondDone = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Whoever asked second - seeds checked as the app starts, the view
    // opening - would otherwise go on with an empty pool and empty lists
    expect(secondDone).toBe(false);
    deliver({ pool: { [A]: { lastSeen: Date.now(), map: "de_dust2" } } });
    await Promise.all([first, second]);

    expect(mapFinder.pool.has(A)).toBe(true);
    expect(global.window.electronAPI.mapFinder.load).toHaveBeenCalledTimes(1);
  });

  test("saves once shortly after changes", async () => {
    jest.useFakeTimers();
    const save = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = { mapFinder: { save } };
    configure();
    mapFinder.seeds.add(A);
    SteamAPI.getPresence.mockResolvedValue(presenceMap(presence(A)));

    await mapFinder.refresh();
    await mapFinder.refresh();
    jest.advanceTimersByTime(MAP_FINDER_CONFIG.SAVE_DEBOUNCE_MS);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].pool[A]).toMatchObject({ map: "de_dust2" });
    jest.useRealTimers();
  });

  test("a load tells the view, so it shows the pool read even with no refresh after", async () => {
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn().mockResolvedValue({
          pool: { [A]: { lastSeen: Date.now(), map: "de_dust2" } },
        }),
        save: jest.fn().mockResolvedValue(true),
      },
    };
    const listener = jest.fn(() => mapFinder.getStatus().poolSize);
    const unsubscribe = mapFinder.onChange(listener);

    await mapFinder._load();
    unsubscribe();

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.results.at(-1).value).toBe(1);
  });
});

describe("setNeed", () => {
  test("polls while anything needs fresh servers and stops when nothing does", () => {
    const start = jest.spyOn(mapFinder, "start").mockResolvedValue();
    const stop = jest.spyOn(mapFinder, "stop");
    try {
      mapFinder.setNeed("view", true);
      mapFinder.setNeed("join", true);
      // The Maps view closed, but a join still waits for a slot
      mapFinder.setNeed("view", false);
      expect(stop).not.toHaveBeenCalled();

      mapFinder.setNeed("join", false);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(3);
    } finally {
      start.mockRestore();
      stop.mockRestore();
    }
  });
});

describe("friends of pool players", () => {
  const KEY = "ABCDEF0123456789ABCDEF0123456789";
  const X = "76561198000000031";
  const Y = "76561198000000032";
  const Z = "76561198000000033";

  test("are read on the user's word, the most recently seen pool player first, once a day", async () => {
    jest.useFakeTimers();
    try {
      configure({ getFofKey: () => KEY });
      mapFinder.pool.set(B, { lastSeen: Date.now() - 60000, map: "de_dust2" });
      mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
      SteamAPI.getFriendIdsOf.mockImplementation(async (id) =>
        id === A ? [X, Y, USER, B] : [Y, Z]
      );

      expect(mapFinder.getStatus().poolFriendsDue).toBe(2);
      expect(mapFinder.readPoolFriends()).toBe(true);
      expect(mapFinder.getStatus().poolFriendsProgress).toEqual({
        done: 0,
        total: 2,
      });
      await jest.advanceTimersByTimeAsync(
        MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS * 2
      );

      expect(SteamAPI.getFriendIdsOf.mock.calls.map(([id]) => id)).toEqual([
        A,
        B,
      ]);
      expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledWith(A, KEY);
      // Neither the user nor someone already in the pool
      expect(mapFinder.poolFriends.ids).toEqual([X, Y, Z]);
      expect(mapFinder.getStatus()).toMatchObject({
        poolFriends: "idle",
        poolFriendsDue: 0,
      });
      expect(mapFinder.readPoolFriends()).toBe(false);

      jest.advanceTimersByTime(MAP_FINDER_CONFIG.FOF_REFRESH_MS);
      expect(mapFinder.getStatus().poolFriendsDue).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("are not read without a key, nor by the periodic step", async () => {
    configure();
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
    expect(mapFinder.readPoolFriends()).toBe(false);

    configure({ getFofKey: () => KEY });
    mapFinder._tick();
    await Promise.resolve();
    expect(SteamAPI.getFriendIdsOf).not.toHaveBeenCalled();
  });

  test("past the limit the oldest go", () => {
    const limit = MAP_FINDER_CONFIG.POOL_FRIENDS_MAX_IDS;
    MAP_FINDER_CONFIG.POOL_FRIENDS_MAX_IDS = 2;
    try {
      mapFinder._addPoolFriends([X, Y], USER);
      mapFinder._addPoolFriends([Z], USER);

      expect(mapFinder.poolFriends.ids).toEqual([Y, Z]);
    } finally {
      MAP_FINDER_CONFIG.POOL_FRIENDS_MAX_IDS = limit;
    }
  });

  test("are polled in turn after the pool, which is polled every round", async () => {
    const cap = MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH;
    MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH = 3;
    try {
      configure();
      mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
      mapFinder.poolFriends = { ids: [X, Y], crawled: {} };
      mapFinder.fof = { ids: [Z, C], fetchedAt: Date.now(), friendsCount: 0 };

      await mapFinder.refresh();
      await mapFinder.refresh();

      expect(SteamAPI.getPresence.mock.calls[0][0]).toEqual([A, X, Y]);
      expect(SteamAPI.getPresence.mock.calls[1][0]).toEqual([A, Z, C]);
    } finally {
      MAP_FINDER_CONFIG.MAX_IDS_PER_REFRESH = cap;
    }
  });

  test("clearing the pool forgets its players and their read marks, and stops a read under way", async () => {
    configure({ getFofKey: () => KEY });
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.poolFriends = { ids: [X], crawled: {} };
    let answer;
    SteamAPI.getFriendIdsOf.mockImplementation(
      () => new Promise((resolve) => (answer = resolve))
    );

    const crawl = mapFinder._crawlPoolFriends();
    expect(mapFinder.clearPool()).toBe(1);
    answer([Y, Z]);
    await crawl;

    expect(mapFinder.pool.size).toBe(0);
    // The friends found before stay until they are cleared on their own
    expect(mapFinder.poolFriends).toEqual({ ids: [X], crawled: {} });
    expect(mapFinder.getStatus()).toMatchObject({
      poolSize: 0,
      poolFriendsSize: 1,
    });
  });

  test("clearing the pool can keep the players seen with a sign of Prime", () => {
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.pool.set(B, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.poolFriends = { ids: [], crawled: { [A]: 1, [B]: 1 } };
    mapFinder.prime.set(A, Date.now());
    expect(mapFinder.getStatus().poolPrimeSize).toBe(1);

    expect(mapFinder.clearPool({ keepPrime: true })).toBe(1);

    expect([...mapFinder.pool.keys()]).toEqual([A]);
    expect(mapFinder.poolFriends.crawled).toEqual({ [A]: 1 });
  });

  test("clearing pool players' friends forgets them and when each list was read", () => {
    configure({ getFofKey: () => KEY });
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.poolFriends = { ids: [X, Y], crawled: { [A]: Date.now() } };
    expect(mapFinder.getStatus().poolFriendsDue).toBe(0);

    mapFinder.clearPoolFriends();

    expect(mapFinder.poolFriends).toEqual({ ids: [], crawled: {} });
    expect(mapFinder.getStatus().poolFriendsDue).toBe(1);
    expect(mapFinder.pool.has(A)).toBe(true);
  });

  test("are saved and loaded with the pool", async () => {
    jest.useFakeTimers();
    try {
      const save = jest.fn().mockResolvedValue(true);
      global.window.electronAPI = { mapFinder: { save } };
      mapFinder.poolFriends = { ids: [X], crawled: { [A]: 123 } };
      mapFinder._scheduleSave();
      jest.advanceTimersByTime(MAP_FINDER_CONFIG.SAVE_DEBOUNCE_MS);
      expect(save.mock.calls[0][0].poolFriends).toEqual({
        ids: [X],
        crawled: { [A]: 123 },
      });
    } finally {
      jest.useRealTimers();
    }

    mapFinder.reset();
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn().mockResolvedValue({
          pool: { [A]: { lastSeen: Date.now(), map: "de_dust2" } },
          poolFriends: {
            ids: [X, "junk"],
            crawled: { [A]: 123, [B]: 456, bad: 1 },
          },
        }),
      },
    };
    await mapFinder._load();

    // A read mark goes with its player when the player leaves the pool
    expect(mapFinder.poolFriends).toEqual({ ids: [X], crawled: { [A]: 123 } });
  });
});

describe("several maps", () => {
  test("candidates come best server first across the maps, running matches only", () => {
    const server = (serverId, map, overrides, steamid) => ({
      serverId,
      map,
      score: "[ 1 : 0 ]",
      rounds: 1,
      over: false,
      freeSlot: true,
      players: [{ steamid, personaname: steamid, connect: null }],
      ...overrides,
    });
    mapFinder.servers = [
      server("1", "de_dust2", { freeSlot: false, rounds: 10 }, A),
      server("2", "de_mirage", {}, B),
      server("3", "de_inferno", {}, C),
      server("4", "de_dust2", { score: "[ 8 : 1 ]", rounds: 9, over: true }, D),
    ];

    expect(mapFinder.getCandidateIdsForMaps(["de_dust2", "de_mirage"])).toEqual(
      [B, A]
    );
  });
});

describe("Prime", () => {
  const INFERNO_SERVER = "90071992547409923";

  /** A on Dust II with a sign of Prime, B beside A without one, C alone on Mirage */
  const refreshWithPrime = async (overrides = {}) => {
    configure({ getFriendIds: () => [A, B, C] });
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        presence(A, { primeSign: true, ...overrides[A] }),
        presence(B, { connect: CONNECT, ...overrides[B] }),
        presence(C, {
          serverId: MIRAGE_SERVER,
          map: "de_mirage",
          connect: CONNECT,
          ...overrides[C],
        })
      )
    );
    await mapFinder.refresh();
  };

  test("buildServers counts the players with a sign of Prime", () => {
    const [server] = buildServers([
      presence(A, { primeSign: true }),
      presence(B),
    ]);

    expect(server.primePlayers).toBe(1);
    expect(server.players.map((player) => player.prime)).toEqual([true, false]);
  });

  test("a player once seen with a sign of Prime keeps it after the sign fades", async () => {
    await refreshWithPrime();
    expect(mapFinder.isPrimePlayer({ steamid: A })).toBe(true);

    // The XP trail runs out, Prime stays
    await refreshWithPrime({ [A]: { primeSign: false } });

    expect(mapFinder.getServers("de_dust2")[0].primePlayers).toBe(1);
    expect(mapFinder.isPrimePlayer({ steamid: B })).toBe(false);
  });

  test("with Prime only off every server is listed, and maps count those with Prime", async () => {
    await refreshWithPrime();

    expect(
      mapFinder
        .getMaps()
        .map(({ map, servers, primeServers }) => [map, servers, primeServers])
    ).toEqual([
      ["de_dust2", 1, 1],
      ["de_mirage", 1, 0],
    ]);
    expect(mapFinder.getStatus().hiddenServers).toBe(0);
  });

  test("with Prime only on, the list and map joins keep to servers with a sign of Prime", async () => {
    await refreshWithPrime();
    const changed = jest.fn();
    mapFinder.onChange(changed);

    mapFinder.setPrimeOnly(true);

    expect(changed).toHaveBeenCalled();
    expect(mapFinder.getMaps().map((entry) => entry.map)).toEqual(["de_dust2"]);
    expect(mapFinder.getServers("de_mirage")).toEqual([]);
    expect(mapFinder.getCandidateIds("de_mirage")).toEqual([]);
    expect(mapFinder.getCandidateIds("de_dust2")).toEqual([A, B]);
    expect(mapFinder.getCandidateIdsForMaps(["de_dust2", "de_mirage"])).toEqual(
      [A, B]
    );
    expect(mapFinder.getStatus().hiddenServers).toBe(1);
  });

  test("a server the user picks is joined through whatever Prime only says", async () => {
    await refreshWithPrime();
    mapFinder.setPrimeOnly(true);

    expect(mapFinder.getCandidateIds("de_mirage", MIRAGE_SERVER)).toEqual([C]);
  });

  test("Prime players are saved and loaded with the pool", async () => {
    jest.useFakeTimers();
    const save = jest.fn().mockResolvedValue(true);
    global.window.electronAPI = { mapFinder: { save } };
    await refreshWithPrime();
    jest.advanceTimersByTime(MAP_FINDER_CONFIG.SAVE_DEBOUNCE_MS);
    jest.useRealTimers();

    const saved = save.mock.calls[0][0].prime;
    expect(Object.keys(saved)).toEqual([A]);

    mapFinder.reset();
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn().mockResolvedValue({
          prime: { ...saved, "not-an-id": Date.now(), [D]: "yesterday" },
        }),
        save: jest.fn().mockResolvedValue(true),
      },
    };
    await mapFinder._load();

    expect([...mapFinder.prime.keys()]).toEqual([A]);
  });

  test("over the limit the players seen longest ago are forgotten", () => {
    const limit = MAP_FINDER_CONFIG.PRIME_MAX_IDS;
    for (let i = 0; i <= limit; i++) {
      mapFinder.prime.set(String(76561198100000000n + BigInt(i)), i);
    }

    mapFinder._prunePool(Date.now());

    expect(mapFinder.prime.size).toBe(limit);
    expect(mapFinder.prime.has("76561198100000000")).toBe(false);
    expect(
      mapFinder.prime.has(String(76561198100000000n + BigInt(limit)))
    ).toBe(true);
  });

  test("a seed showing a sign of Prime is remembered", async () => {
    configure();
    mapFinder.seeds.add(E);
    SteamAPI.getPresence.mockResolvedValue(
      presenceMap(
        presence(E, {
          serverId: INFERNO_SERVER,
          map: "de_inferno",
          primeSign: true,
        })
      )
    );

    await mapFinder._checkSeeds();

    expect(mapFinder.isPrimePlayer({ steamid: E })).toBe(true);
  });
});

describe("friend check", () => {
  const KEY = "ABCDEF0123456789ABCDEF0123456789";
  const F1 = "76561198000000041";
  const F2 = "76561198000000042";
  const F3 = "76561198000000043";
  const INFERNO_SERVER = "90071992547409923";
  // Whom Steam answers about, and where they are
  let world;

  const place = (...players) => {
    for (const player of players) world.set(player.steamid, player);
  };
  /** A friend Steam answers about, in no game */
  const away = (steamid) =>
    presence(steamid, {
      inCS2: false,
      inSupportedMode: false,
      serverId: null,
      mode: null,
      map: null,
      score: null,
      official: false,
    });
  /** A refresh, and the friend checks it starts */
  const refresh = async () => {
    await mapFinder.refresh();
    await mapFinder._friendChecking;
  };
  /** Presence requests that asked about a friend */
  const friendAsks = (friend) =>
    SteamAPI.getPresence.mock.calls.filter(([ids]) => ids.includes(friend))
      .length;

  beforeEach(() => {
    world = new Map();
    SteamAPI.getPresence.mockImplementation(
      async (ids) =>
        new Map(
          ids.filter((id) => world.has(id)).map((id) => [id, world.get(id)])
        )
    );
  });

  test("a player with a sign of Prime and no friend on the server marks it alone", async () => {
    configure({ getFriendIds: () => [A, C], getFofKey: () => KEY });
    place(
      presence(A, { primeSign: true }),
      presence(C, { serverId: MIRAGE_SERVER, map: "de_mirage" }),
      away(F1),
      presence(F2, { serverId: MIRAGE_SERVER, map: "de_mirage" })
    );
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1, F2]);

    await refresh();

    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(1);
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledWith(A, KEY);
    // Where the friends are is asked with the main credential, as any presence
    expect(SteamAPI.getPresence).toHaveBeenLastCalledWith([F1, F2], "token");
    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "alone",
      reason: null,
    });
    // No sign of Prime there, nothing to mark
    expect(mapFinder.getPrimeCheck(MIRAGE_SERVER)).toBeNull();
  });

  test("friends there who all show a sign of Prime, now or before, mark it prime-friends", async () => {
    configure({ getFriendIds: () => [A], getFofKey: () => KEY });
    mapFinder.prime.set(F2, Date.now() - 60000);
    place(
      presence(A, { primeSign: true }),
      presence(F1, { primeSign: true }),
      presence(F2),
      away(F3)
    );
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1, F2, F3]);

    await refresh();

    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "prime-friends",
      reason: null,
    });
  });

  test("a friend there without a sign of Prime only dims the mark: the list, Prime only and joins stay", async () => {
    configure({ getFriendIds: () => [A], getFofKey: () => KEY });
    place(
      presence(A, { primeSign: true, connect: CONNECT }),
      presence(F1, { primeSign: true }),
      presence(F2)
    );
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1, F2]);

    await refresh();
    mapFinder.setPrimeOnly(true);

    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "friend",
      reason: null,
    });
    expect(mapFinder.getMaps()).toEqual([
      {
        map: "de_dust2",
        label: "Dust II",
        servers: 1,
        freeServers: 1,
        primeServers: 1,
      },
    ]);
    expect(mapFinder.getServers("de_dust2")).toHaveLength(1);
    expect(mapFinder.getCandidateIds("de_dust2")).toEqual([A]);
    expect(mapFinder.getCandidateIdsForMaps(["de_dust2"])).toEqual([A]);
    // Neither the friend nor the friends seen by the check join the pool,
    // and those friends are not remembered with Prime
    expect(mapFinder.pool.size).toBe(0);
    expect(mapFinder.isPrimePlayer({ steamid: F1 })).toBe(false);
  });

  test("a closed list leaves the player unknown and asks nothing about friends", async () => {
    configure({ getFriendIds: () => [A], getFofKey: () => KEY });
    place(presence(A, { primeSign: true }));
    SteamAPI.getFriendIdsOf.mockResolvedValue([]);

    await refresh();

    expect(SteamAPI.getPresence).toHaveBeenCalledTimes(1);
    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "unknown",
      reason: "closed",
    });
  });

  test("without a key no list is read and no friend asked about", async () => {
    configure({ getFriendIds: () => [A] });
    place(presence(A, { primeSign: true }));

    await refresh();
    await refresh();

    expect(SteamAPI.getFriendIdsOf).not.toHaveBeenCalled();
    expect(SteamAPI.getPresence).toHaveBeenCalledTimes(2);
    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "unknown",
      reason: "no-key",
    });
  });

  test("a player not checked yet is unknown until the check comes", async () => {
    configure({ getFriendIds: () => [A], getFofKey: () => KEY });
    place(presence(A, { primeSign: true }));
    SteamAPI.getFriendIdsOf.mockReturnValue(new Promise(() => {}));

    await mapFinder.refresh();

    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "unknown",
      reason: "pending",
    });
  });

  test("an answer missing a friend proves nobody absent: the player is checked again", async () => {
    configure({ getFriendIds: () => [A], getFofKey: () => KEY });
    // Steam does not answer about F2: one of the requests failed
    place(presence(A, { primeSign: true }), away(F1));
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1, F2]);

    await refresh();
    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "unknown",
      reason: "pending",
    });

    place(away(F2));
    await refresh();

    // The list read before is used again
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(1);
    expect(friendAsks(F1)).toBe(2);
    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "alone",
      reason: null,
    });
  });

  test("a check holds while the player stays on the server and comes again on another one", async () => {
    configure({ getFriendIds: () => [A, B], getFofKey: () => KEY });
    place(presence(A, { primeSign: true }), presence(B), away(F1));
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1]);

    await refresh();
    await refresh();
    expect(friendAsks(F1)).toBe(1);

    // Steam not answering about the player is no sign they left
    world.delete(A);
    await refresh();
    place(presence(A, { primeSign: true }));
    await refresh();
    expect(friendAsks(F1)).toBe(1);
    expect(mapFinder.getPrimeCheck(DUST_SERVER).verdict).toBe("alone");

    // Even with the key gone, what was found stays
    configure({ getFriendIds: () => [A, B] });
    expect(mapFinder.getPrimeCheck(DUST_SERVER).verdict).toBe("alone");

    configure({ getFriendIds: () => [A, B], getFofKey: () => KEY });
    const onInferno = { serverId: INFERNO_SERVER, map: "de_inferno" };
    place(
      presence(A, { primeSign: true, ...onInferno }),
      presence(F1, onInferno)
    );
    await refresh();

    // The friend now sits with the player on Inferno
    expect(friendAsks(F1)).toBe(2);
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(1);
    expect(mapFinder.getPrimeCheck(INFERNO_SERVER)).toEqual({
      verdict: "friend",
      reason: null,
    });
  });

  test("a friends list is read again only after a day", async () => {
    configure({ getFriendIds: () => [A], getFofKey: () => KEY });
    place(presence(A, { primeSign: true }), away(F1));
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1]);
    await refresh();

    place(
      presence(A, {
        primeSign: true,
        serverId: INFERNO_SERVER,
        map: "de_inferno",
      })
    );
    await refresh();
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(1);

    mapFinder.friendLists.get(A).at -= MAP_FINDER_CONFIG.FOF_REFRESH_MS;
    place(presence(A, { primeSign: true }));
    await refresh();
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(2);
  });

  test("a player alone settles the server: the others there need no check", async () => {
    configure({ getFriendIds: () => [A, B], getFofKey: () => KEY });
    place(
      presence(A, { primeSign: true }),
      presence(B, { primeSign: true }),
      away(F1)
    );
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1]);

    await refresh();

    expect(SteamAPI.getFriendIdsOf.mock.calls).toEqual([[A, KEY]]);
  });

  test("a server takes its best player's answer, whoever was checked first", async () => {
    configure({ getFriendIds: () => [A, B], getFofKey: () => KEY });
    place(
      presence(A, { primeSign: true }),
      presence(B, { primeSign: true }),
      presence(F1),
      away(F2)
    );
    SteamAPI.getFriendIdsOf.mockImplementation(async (id) =>
      id === A ? [F1] : [F2]
    );

    await refresh();

    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(2);
    expect(mapFinder.getPrimeCheck(DUST_SERVER)).toEqual({
      verdict: "alone",
      reason: null,
    });
  });

  test("the order: alone, then Prime friends, then unknown, then a friend without Prime", () => {
    const alone = { verdict: "alone", reason: null };
    const primeFriends = { verdict: "prime-friends", reason: null };
    const friend = { verdict: "friend", reason: null };
    const closed = { verdict: "unknown", reason: "closed" };
    const pending = { verdict: "unknown", reason: "pending" };

    expect(bestPrimeCheck([friend, closed, primeFriends], true)).toBe(
      primeFriends
    );
    expect(bestPrimeCheck([primeFriends, alone], true)).toBe(alone);
    expect(bestPrimeCheck([friend, closed], true)).toBe(closed);
    // A check still to come tells more than a closed list
    expect(bestPrimeCheck([closed, pending], true)).toBe(pending);
    expect(bestPrimeCheck([friend], true)).toBe(friend);
    expect(bestPrimeCheck([], false)).toEqual({
      verdict: "unknown",
      reason: "no-key",
    });
  });

  test("a refresh starts a few checks at most, the servers best to join first", async () => {
    // Six players with a sign of Prime, each alone on a server of their own;
    // the last two servers have a free slot
    const players = Array.from({ length: 6 }, (_, i) =>
      String(76561198000000051n + BigInt(i))
    );
    configure({ getFriendIds: () => players, getFofKey: () => KEY });
    players.forEach((id, i) =>
      place(
        presence(id, {
          primeSign: true,
          serverId: String(90071992547409931n + BigInt(i)),
          connect: i >= 4 ? CONNECT : null,
        })
      )
    );
    place(away(F1));
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1]);

    await refresh();
    const first = SteamAPI.getFriendIdsOf.mock.calls.map(([id]) => id);
    expect(first).toHaveLength(FRIEND_CHECKS_PER_REFRESH);
    expect(first.slice(0, 2)).toEqual([players[4], players[5]]);

    await refresh();
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(players.length);
    // Every answer holds: the third refresh asks about the players alone
    await refresh();
    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(players.length);
    expect(SteamAPI.getPresence).toHaveBeenCalledTimes(3 + players.length);
  });

  test("a closed list read in the last day is not read again and costs none of the budget", async () => {
    const players = Array.from(
      { length: FRIEND_CHECKS_PER_REFRESH + 1 },
      (_, i) => String(76561198000000051n + BigInt(i))
    );
    configure({ getFriendIds: () => players, getFofKey: () => KEY });
    players.forEach((id, i) =>
      place(
        presence(id, {
          primeSign: true,
          serverId: String(90071992547409931n + BigInt(i)),
          // The closed list's server comes first
          connect: i === 0 ? CONNECT : null,
        })
      )
    );
    place(away(F1));
    mapFinder.friendLists.set(players[0], { at: Date.now(), ids: [] });
    SteamAPI.getFriendIdsOf.mockResolvedValue([F1]);

    await refresh();

    expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledTimes(
      FRIEND_CHECKS_PER_REFRESH
    );
    expect(SteamAPI.getFriendIdsOf).not.toHaveBeenCalledWith(players[0], KEY);
    expect(mapFinder.getPrimeCheck(String(90071992547409931n))).toEqual({
      verdict: "unknown",
      reason: "closed",
    });
    expect(
      mapFinder.getPrimeCheck(
        String(90071992547409931n + BigInt(players.length - 1))
      ).verdict
    ).toBe("alone");
  });

  test("friends lists are saved, and loaded back without stale or broken entries", async () => {
    jest.useFakeTimers();
    let saved;
    try {
      const save = jest.fn().mockResolvedValue(true);
      global.window.electronAPI = { mapFinder: { save } };
      configure({ getFriendIds: () => [A], getFofKey: () => KEY });
      place(presence(A, { primeSign: true }), away(F1));
      SteamAPI.getFriendIdsOf.mockResolvedValue([F1, "junk", F1]);

      await refresh();
      jest.advanceTimersByTime(MAP_FINDER_CONFIG.SAVE_DEBOUNCE_MS);

      saved = save.mock.calls[0][0].friendLists;
      expect(saved).toEqual({ [A]: { at: expect.any(Number), ids: [F1] } });
    } finally {
      jest.useRealTimers();
    }

    mapFinder.reset();
    const now = Date.now();
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn().mockResolvedValue({
          friendLists: {
            ...saved,
            [B]: { at: now - MAP_FINDER_CONFIG.FOF_REFRESH_MS - 1, ids: [F2] },
            [C]: { at: now, ids: [F3, "junk"] },
            [D]: { at: "yesterday", ids: [] },
            [E]: { at: now },
            "not-an-id": { at: now, ids: [] },
          },
        }),
        save: jest.fn().mockResolvedValue(true),
      },
    };
    await mapFinder._load();

    // A day old, B is gone; the rest come in the order they were read
    expect([...mapFinder.friendLists.keys()]).toEqual([A, C]);
    expect(mapFinder.friendLists.get(C).ids).toEqual([F3]);
  });

  test("over the size limit the lists read longest ago go first", () => {
    const ids = (count) =>
      Array.from({ length: count }, (_, i) =>
        String(76561198100000000n + BigInt(i))
      );
    const now = Date.now();
    mapFinder.friendLists.set(A, {
      at: now - 2000,
      ids: ids(FRIEND_LISTS_MAX_IDS / 2),
    });
    mapFinder.friendLists.set(B, {
      at: now - 1000,
      ids: ids(FRIEND_LISTS_MAX_IDS / 2),
    });

    mapFinder._keepFriendList(C, [F1, F2]);

    expect([...mapFinder.friendLists.keys()]).toEqual([B, C]);
  });
});
