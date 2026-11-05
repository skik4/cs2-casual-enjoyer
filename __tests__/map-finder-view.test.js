/**
 * @jest-environment jsdom
 *
 * Jest tests for the Maps view: map and server rows with their labels, the
 * pin that keeps a map, and what a click on Join or Cancel starts
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logStateChange: jest.fn(),
  },
}));

import MapFinderView from "../src/ui/map-finder-view.js";
import mapFinder from "../src/game/map-finder.js";
import mapKeeper from "../src/game/map-keeper.js";
import userLocation from "../src/game/user-location.js";
import joinManager, { getMapJoinId } from "../src/game/join-manager.js";
import { PINNED_MAPS_JOIN_ID, STATUS_TYPES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const DUST_1 = "90071992547409921";
const DUST_2 = "90071992547409922";
const MIRAGE = "90071992547409923";

/** A known server with one player offering a slot */
const server = (serverId, overrides = {}) => ({
  serverId,
  map: "de_dust2",
  score: "[ 3 : 1 ]",
  rounds: 4,
  over: false,
  freeSlot: true,
  players: [{ steamid: "76561198000000011", personaname: "a", connect: "+gcconnect0A0B0C0D" }],
  ...overrides,
});

const list = () => document.getElementById("maps-list");
const row = (selector) => list().querySelector(selector);
const label = (joinId) => document.getElementById(`status-${joinId}`);
const button = (joinId) => document.getElementById(`join-btn-${joinId}`);
// A real click bubbles up to the list's handler
const click = (element) => element.click();

let joinStates;

beforeAll(() => {
  setLanguage("en");
  document.body.innerHTML = `
    <span id="tab-count-maps"></span>
    <span id="map-finder-status"></span>
    <button id="maps-prime-only" aria-pressed="false"></button>
    <div id="maps-list"></div>
    <div id="maps-empty" class="hidden"></div>
    <span id="fof-summary"></span>
    <div id="fof-key-details" class="hidden"></div>
    <button id="fof-key-toggle"></button>
    <div id="map-sources"></div>`;
  MapFinderView.initialize({ getMainAuth: () => "head.payload.signature" });
});

beforeEach(() => {
  joinStates = {};
  jest.spyOn(mapFinder, "setNeed").mockImplementation(() => {});
  jest.spyOn(joinManager, "getJoinStates").mockImplementation(() => joinStates);
  jest.spyOn(joinManager, "startMapJoin").mockResolvedValue();
  jest.spyOn(joinManager, "cancelJoin").mockImplementation(() => {});
  mapFinder.servers = [
    server(DUST_1),
    server(DUST_2, { score: "[ 8 : 2 ]", rounds: 10, over: true }),
    server(MIRAGE, { map: "de_mirage", freeSlot: false }),
  ];
  MapFinderView.expanded = new Set(["de_dust2"]);
  MapFinderView._lastListHtml = null;
});

afterEach(() => {
  // Not reset(): that would also drop the view's own subscriptions
  mapKeeper.clear();
  userLocation.setSteamPresence(null);
  jest.restoreAllMocks();
});

test("a map's servers say what is going on there", () => {
  MapFinderView.render();

  // Only the running match counts as a server with room
  expect(label(getMapJoinId("de_dust2")).textContent).toBe("1 with a free slot");
  expect(label(`srv-${DUST_1}`).textContent).toBe("free slot");
  expect(button(`srv-${DUST_1}`).disabled).toBe(false);
  expect(label(`srv-${DUST_2}`).textContent).toBe("match over");
  expect(button(`srv-${DUST_2}`).disabled).toBe(true);
  expect(list().textContent).toContain("Final score 8 : 2");
  expect(label(getMapJoinId("de_mirage")).textContent).toBe("no free slot");
  expect(button(getMapJoinId("de_mirage")).textContent).toBe("Wait for a slot");
});

test("the user's own server and map are marked and cannot be joined", () => {
  userLocation.setSteamPresence({
    inCS2: true,
    serverId: DUST_1,
    official: true,
    map: "de_dust2",
    score: "[ 3 : 1 ]",
  });

  MapFinderView.render();

  expect(label(getMapJoinId("de_dust2")).textContent).toBe("you're on this map");
  expect(button(getMapJoinId("de_dust2")).disabled).toBe(true);
  expect(label(`srv-${DUST_1}`).textContent).toBe("you're here");
  expect(button(`srv-${DUST_1}`).disabled).toBe(true);
  expect(button(getMapJoinId("de_mirage")).disabled).toBe(false);
});

test("the pin keeps a map, and a second click lets it go", () => {
  MapFinderView.render();

  click(row('[data-keep-map="de_dust2"]'));
  expect(mapKeeper.getMaps()).toEqual(["de_dust2"]);
  const pin = row('[data-keep-map="de_dust2"]');
  expect(pin.classList.contains("active")).toBe(true);
  expect(pin.getAttribute("aria-pressed")).toBe("true");
  // A click on the pin is no click on its row
  expect(MapFinderView.expanded.has("de_dust2")).toBe(true);

  click(row('[data-keep-map="de_dust2"]'));
  expect(mapKeeper.getMaps()).toEqual([]);
});

test("Join on a map not pinned lets the pins go, and so does cancelling their join", () => {
  mapKeeper.toggle("de_mirage");
  MapFinderView.render();

  click(button(getMapJoinId("de_dust2")));
  expect(joinManager.startMapJoin).toHaveBeenCalledWith(
    expect.objectContaining({ map: "de_dust2", serverId: null })
  );
  expect(mapKeeper.getMaps()).toEqual([]);

  mapKeeper.toggle("de_dust2");
  joinStates = { [PINNED_MAPS_JOIN_ID]: { status: STATUS_TYPES.CONNECTING, cancelled: false } };
  MapFinderView.render();

  click(button(PINNED_MAPS_JOIN_ID));
  expect(joinManager.cancelJoin).toHaveBeenCalledWith(PINNED_MAPS_JOIN_ID);
  expect(mapKeeper.getMaps()).toEqual([]);
});

test("pinned maps gather in a row whose Join takes any of them", () => {
  mapKeeper.toggle("de_dust2");
  mapKeeper.toggle("de_mirage");
  MapFinderView.render();

  const pinned = row(".pinned-row");
  expect(pinned.textContent).toContain("Any pinned map");
  expect(pinned.textContent).toContain("Dust II / Mirage");
  // Dust II's running match has the one free slot among them
  expect(label(PINNED_MAPS_JOIN_ID).textContent).toBe("free slot");

  click(button(PINNED_MAPS_JOIN_ID));
  expect(joinManager.startMapJoin).toHaveBeenCalledWith(
    expect.objectContaining({ joinId: PINNED_MAPS_JOIN_ID })
  );

  click(row("[data-unpin-all]"));
  expect(mapKeeper.getMaps()).toEqual([]);
  expect(row(".pinned-row")).toBeNull();
});

describe("sources", () => {
  const A = "76561198000000011";
  const B = "76561198000000012";
  const KEY = "ABCDEF0123456789ABCDEF0123456789";
  const sourceRow = (source) => document.querySelector(`[data-source-row="${source}"]`);
  const sourceButton = (source, action) =>
    document.querySelector(`#map-sources [data-source="${source}"][data-action="${action}"]`);
  let deps;

  beforeEach(() => {
    deps = mapFinder.deps;
    mapFinder.deps = { getRealFriendIds: () => [B] };
  });

  afterEach(() => {
    mapFinder.deps = deps;
    mapFinder.pool = new Map();
    mapFinder.prime = new Map();
    mapFinder.poolFriends = { ids: [], crawled: {} };
    mapFinder.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
    mapFinder.status = mapFinder._idleStatus();
    MapFinderView._poolClearAsk = false;
    MapFinderView._lastSourcesHtml = null;
  });

  test("each source shows how many players it holds", () => {
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.poolFriends = {
      ids: Array.from({ length: 1234 }, (_, i) => String(76561198100000000n + BigInt(i))),
      crawled: {},
    };

    MapFinderView.render();

    expect(sourceRow("pool").querySelector(".source-count").textContent).toBe("1");
    expect(sourceRow("poolFriends").querySelector(".source-count").textContent).toBe("1,234");
    expect(sourceRow("fof").querySelector(".source-count").textContent).toBe("0");
  });

  test("the pool's clear asks whom to forget: everyone, or those without a sign of Prime", () => {
    const clearPool = jest.spyOn(mapFinder, "clearPool").mockImplementation(() => 0);
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.pool.set(B, { lastSeen: Date.now(), map: "de_dust2" });
    mapFinder.prime.set(A, Date.now());
    MapFinderView.render();

    click(sourceButton("pool", "clear"));
    expect(sourceButton("pool", "clear-no-prime").textContent).toBe(
      "without a sign of Prime (1)"
    );
    expect(clearPool).not.toHaveBeenCalled();
    click(sourceButton("pool", "clear-no-prime"));
    expect(clearPool).toHaveBeenCalledWith({ keepPrime: true });
    // Back to the one button
    expect(sourceButton("pool", "clear-all")).toBeNull();

    click(sourceButton("pool", "clear"));
    click(sourceButton("pool", "clear-all"));
    expect(clearPool).toHaveBeenLastCalledWith();

    click(sourceButton("pool", "clear"));
    click(sourceButton("pool", "cancel"));
    expect(clearPool).toHaveBeenCalledTimes(2);
    expect(sourceButton("pool", "clear")).not.toBeNull();
  });

  test("the other clears ask on the first click and clear on the second", () => {
    const clearPoolFriends = jest
      .spyOn(mapFinder, "clearPoolFriends")
      .mockImplementation(() => {});
    mapFinder.poolFriends = { ids: [B], crawled: {} };
    MapFinderView.render();
    expect(sourceButton("poolFriends", "clear").textContent).toBe("Clear");

    click(sourceButton("poolFriends", "clear"));
    expect(sourceButton("poolFriends", "clear").textContent).toBe("Sure? Click again");
    expect(clearPoolFriends).not.toHaveBeenCalled();

    click(sourceButton("poolFriends", "clear"));
    expect(clearPoolFriends).toHaveBeenCalledTimes(1);
    expect(sourceButton("poolFriends", "clear").textContent).toBe("Clear");
  });

  test("a clear forgets its first click after a few seconds", () => {
    jest.useFakeTimers();
    try {
      const clearFof = jest.spyOn(mapFinder, "clearFof").mockImplementation(() => {});
      mapFinder.fof = { ids: [B], fetchedAt: 1, friendsCount: 1 };
      MapFinderView.render();

      click(sourceButton("fof", "clear"));
      jest.advanceTimersByTime(3000);
      expect(sourceButton("fof", "clear").textContent).toBe("Clear");

      click(sourceButton("fof", "clear"));
      expect(clearFof).not.toHaveBeenCalled();
      click(sourceButton("fof", "clear"));
      expect(clearFof).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("clears are off with nothing to clear", () => {
    MapFinderView.render();

    expect(sourceButton("pool", "clear").disabled).toBe(true);
    expect(sourceButton("poolFriends", "clear").disabled).toBe(true);
    expect(sourceButton("fof", "clear").disabled).toBe(true);
  });

  test("lists are read only on a click, and only with a key", () => {
    const readFof = jest.spyOn(mapFinder, "readFof").mockReturnValue(true);
    const readPoolFriends = jest.spyOn(mapFinder, "readPoolFriends").mockReturnValue(true);
    mapFinder.pool.set(A, { lastSeen: Date.now(), map: "de_dust2" });

    MapFinderView.render();
    expect(sourceButton("poolFriends", "read").disabled).toBe(true);
    expect(sourceButton("fof", "read").title).toContain("API key");

    jest.spyOn(MapFinderView, "getFofKey").mockReturnValue(KEY);
    MapFinderView.render();
    expect(sourceButton("poolFriends", "read").title).toContain(": 1");

    click(sourceButton("poolFriends", "read"));
    expect(readPoolFriends).toHaveBeenCalledTimes(1);
    click(sourceButton("fof", "read"));
    expect(readFof).toHaveBeenCalledTimes(1);
  });

  test("a read under way shows in its row, not next to the tabs", () => {
    mapFinder.status.poolFriends = "crawling";
    mapFinder.status.poolFriendsProgress = { done: 3, total: 40 };

    MapFinderView.render();

    expect(sourceRow("poolFriends").querySelector(".source-state").textContent).toBe(
      "reading 3 of 40…"
    );
    expect(sourceButton("poolFriends", "read")).toBeNull();
    expect(document.getElementById("map-finder-status").textContent).not.toContain(
      "reading"
    );
  });
});

describe("Prime", () => {
  afterEach(() => {
    mapFinder.primeOnly = false;
    delete window.electronAPI;
  });

  test("a server where someone shows a sign of Prime is marked, and its map counts them", () => {
    mapFinder.servers = [
      server(DUST_1, { primePlayers: 2 }),
      server(DUST_2, { score: "[ 1 : 1 ]", rounds: 2 }),
      server(MIRAGE, { map: "de_mirage", freeSlot: false }),
    ];

    MapFinderView.render();

    const serverTags = list().querySelectorAll(".server-row .prime-tag");
    expect(serverTags).toHaveLength(1);
    expect(serverTags[0].textContent).toBe("Prime");
    expect(serverTags[0].title).toContain(": 2.");
    // The map's own tag counts its servers with Prime, apart from the slots
    const mapTag = row('[data-map="de_dust2"] .map-row .prime-tag');
    expect(mapTag.textContent).toBe("Prime: 1");
    expect(mapTag.title).toContain("1 of 2");
    expect(row('[data-map="de_dust2"] .game-where').textContent).toBe("2 servers");
    expect(row('[data-map="de_mirage"] .prime-tag')).toBeNull();
  });

  test("Prime only leaves out the other servers, and the switch shows it is on", () => {
    mapFinder.servers = [
      server(DUST_1, { primePlayers: 1 }),
      server(MIRAGE, { map: "de_mirage" }),
    ];
    mapFinder.primeOnly = true;

    MapFinderView.render();

    expect(row('[data-map="de_mirage"]')).toBeNull();
    // Every server listed has Prime, so the map does not count them
    expect(row('[data-map="de_dust2"] .map-row .prime-tag')).toBeNull();
    expect(document.getElementById("maps-prime-only").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("tab-count-maps").textContent).toBe("1");
  });

  test("with every server left out by Prime only, the empty list says why", () => {
    mapFinder.primeOnly = true;

    MapFinderView.render();

    expect(document.getElementById("maps-empty").textContent).toContain("Prime only");
  });

  test("the switch turns Prime only on and keeps it in the settings", async () => {
    const update = jest.fn().mockResolvedValue({ maps_prime_only: true });
    window.electronAPI = { settings: { update } };

    click(document.getElementById("maps-prime-only"));
    await Promise.resolve();

    expect(mapFinder.primeOnly).toBe(true);
    expect(update).toHaveBeenCalledWith({ maps_prime_only: true });
  });

  test("a map join keeps to Prime only, a server picked by hand does not", () => {
    mapFinder.servers = [server(DUST_1, { primePlayers: 1 })];
    MapFinderView.render();

    click(button(getMapJoinId("de_dust2")));
    click(button(`srv-${DUST_1}`));

    const [mapJoin] = joinManager.startMapJoin.mock.calls[0];
    const [serverJoin] = joinManager.startMapJoin.mock.calls[1];
    expect(typeof mapJoin.primeOnly).toBe("function");
    expect(typeof mapJoin.isPrime).toBe("function");
    expect(serverJoin.primeOnly).toBeUndefined();
    expect(typeof serverJoin.isPrime).toBe("function");
  });
});
