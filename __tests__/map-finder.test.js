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

  test("buildServers marks a match that has ended", () => {
    const [server] = buildServers([presence(A, { score: "[ 8 : 2 ]" })]);

    expect(server).toMatchObject({ score: "[ 8 : 2 ]", rounds: 10, over: true });
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

    expect([finished, running].sort(compareServers)).toEqual([running, finished]);
  });
});

describe("a credential Steam turned down", () => {
  afterEach(() => credentialState.reset());

  test("refreshes nothing and keeps the servers known until it is taken again", async () => {
    configure({ getFriendIds: () => [A] });
    SteamAPI.getPresence.mockResolvedValue(presenceMap(presence(A, { connect: CONNECT })));
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
        presence(C, { serverId: MIRAGE_SERVER, map: "de_mirage", connect: CONNECT })
      )
    );
    userLocation.setSteamPresence(presence(USER, { serverId: OTHER_DUST }));

    await mapFinder.refresh();

    expect(mapFinder.getCandidateIds("de_dust2")).toEqual([]);
    expect(mapFinder.getCandidateIds("de_mirage")).toEqual([C]);
    expect(mapFinder.getMaps().find((m) => m.map === "de_dust2")).toMatchObject({
      servers: 2,
      freeServers: 0,
    });
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
      expect.objectContaining({ serverId: DUST_SERVER, over: false, score: null, players: [] }),
    ]);
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
      expect(mapFinder.getStatus()).toMatchObject({ lastRefreshAt, refreshing: false });
    } finally {
      jest.useRealTimers();
    }
  });

  test("drops pool entries past their time and keeps the newest", async () => {
    configure();
    const now = Date.now();
    mapFinder.pool.set(A, { lastSeen: now - MAP_FINDER_CONFIG.POOL_TTL_MS - 1, map: "de_dust2" });
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
    expect(mapFinder.getStatus().fof).toBe("ready");
  });

  test("not one readable list counts as an error, tried again after a while", async () => {
    jest.useFakeTimers();
    try {
      configure({
        getRealFriendIds: () => [FRIEND_1, FRIEND_2],
        getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
      });

      const crawl = mapFinder._crawlFof();
      await jest.advanceTimersByTimeAsync(MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS * 2);
      await crawl;

      expect(mapFinder.getStatus().fof).toBe("error");
      expect(mapFinder.fof.fetchedAt).toBe(0);
      // Not on the very next refresh: a wrong key would then cost a request
      // per friend every refresh for as long as the finder ran
      expect(mapFinder._fofDue()).toBe(false);

      jest.advanceTimersByTime(MAP_FINDER_CONFIG.FOF_RETRY_MS);
      expect(mapFinder._fofDue()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("a new key is tried at once after a failed crawl", async () => {
    jest.useFakeTimers();
    try {
      configure({
        getRealFriendIds: () => [FRIEND_1],
        getFofKey: () => "ABCDEF0123456789ABCDEF0123456789",
      });

      const crawl = mapFinder._crawlFof();
      await jest.advanceTimersByTimeAsync(MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS);
      await crawl;
      expect(mapFinder._fofDue()).toBe(false);

      mapFinder.restartFof();
      expect(mapFinder._fofDue()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
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

  test("are read with a key, the most recently seen pool player first, once a day", async () => {
    jest.useFakeTimers();
    try {
      configure({ getFofKey: () => KEY });
      mapFinder.pool.set(B, { lastSeen: Date.now() - 60000, map: "de_dust2" });
      mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
      SteamAPI.getFriendIdsOf.mockImplementation(async (id) =>
        id === A ? [X, Y, USER, B] : [Y, Z]
      );

      const crawl = mapFinder._crawlPoolFriends();
      await jest.advanceTimersByTimeAsync(MAP_FINDER_CONFIG.FOF_REQUEST_DELAY_MS * 2);
      await crawl;

      expect(SteamAPI.getFriendIdsOf.mock.calls.map(([id]) => id)).toEqual([A, B]);
      expect(SteamAPI.getFriendIdsOf).toHaveBeenCalledWith(A, KEY);
      // Neither the user nor someone already in the pool
      expect(mapFinder.poolFriends.ids).toEqual([X, Y, Z]);
      expect(mapFinder._poolFriendsDue()).toBe(false);

      jest.advanceTimersByTime(MAP_FINDER_CONFIG.FOF_REFRESH_MS);
      expect(mapFinder._poolFriendsDue()).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test("are not read without a key", () => {
    configure();
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });

    expect(mapFinder._poolFriendsDue()).toBe(false);
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

  test("clearing the pool forgets its players and their friends, and stops a crawl under way", async () => {
    configure({ getFofKey: () => KEY });
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.poolFriends = { ids: [X], crawled: {} };
    let answer;
    SteamAPI.getFriendIdsOf.mockImplementation(
      () => new Promise((resolve) => (answer = resolve))
    );

    const crawl = mapFinder._crawlPoolFriends();
    mapFinder.clearPool();
    answer([Y, Z]);
    await crawl;

    expect(mapFinder.pool.size).toBe(0);
    expect(mapFinder.poolFriends).toEqual({ ids: [], crawled: {} });
    expect(mapFinder.getStatus()).toMatchObject({ poolSize: 0, poolFriendsSize: 0 });
  });

  test("are saved and loaded with the pool", async () => {
    jest.useFakeTimers();
    try {
      const save = jest.fn().mockResolvedValue(true);
      global.window.electronAPI = { mapFinder: { save } };
      mapFinder.poolFriends = { ids: [X], crawled: { [A]: 123 } };
      mapFinder._scheduleSave();
      jest.advanceTimersByTime(2000);
      expect(save.mock.calls[0][0].poolFriends).toEqual({ ids: [X], crawled: { [A]: 123 } });
    } finally {
      jest.useRealTimers();
    }

    mapFinder.reset();
    global.window.electronAPI = {
      mapFinder: {
        load: jest.fn().mockResolvedValue({
          pool: { [A]: { lastSeen: Date.now(), map: "de_dust2" } },
          poolFriends: { ids: [X, "junk"], crawled: { [A]: 123, [B]: 456, bad: 1 } },
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

    expect(mapFinder.getCandidateIdsForMaps(["de_dust2", "de_mirage"])).toEqual([B, A]);
  });
});
