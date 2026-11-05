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
    <button id="pool-clear"></button>
    <button id="fof-clear"></button>`;
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

describe("clear buttons", () => {
  afterEach(() => {
    mapFinder.pool = new Map();
    mapFinder.poolFriends = { ids: [], crawled: {} };
    mapFinder.fof = { ids: [], fetchedAt: 0, friendsCount: 0 };
  });

  test("ask on the first click and clear on the second", () => {
    const clearPool = jest.spyOn(mapFinder, "clearPool").mockImplementation(() => {});
    mapFinder.pool.set("76561198000000011", { lastSeen: Date.now(), map: "de_dust2" });
    MapFinderView.render();
    const button = document.getElementById("pool-clear");
    expect(button.textContent).toBe("Clear the pool");

    button.click();
    expect(button.textContent).toBe("Sure? Click again");
    expect(clearPool).not.toHaveBeenCalled();

    button.click();
    expect(clearPool).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("Clear the pool");
  });

  test("forget the first click after a few seconds", () => {
    jest.useFakeTimers();
    try {
      const restartFof = jest.spyOn(mapFinder, "restartFof").mockImplementation(() => {});
      mapFinder.fof = { ids: ["76561198000000021"], fetchedAt: 1, friendsCount: 1 };
      MapFinderView.render();
      const button = document.getElementById("fof-clear");

      button.click();
      jest.advanceTimersByTime(3000);
      expect(button.textContent).toBe("Clear friends of friends");

      button.click();
      expect(restartFof).not.toHaveBeenCalled();
      button.click();
      expect(restartFof).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test("are off with nothing to clear", () => {
    MapFinderView.render();

    expect(document.getElementById("pool-clear").disabled).toBe(true);
    expect(document.getElementById("fof-clear").disabled).toBe(true);
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

    const tags = list().querySelectorAll(".prime-tag");
    expect(tags).toHaveLength(1);
    expect(tags[0].textContent).toBe("Prime");
    expect(tags[0].title).toContain(": 2.");
    expect(row('[data-map="de_dust2"] .game-where').textContent).toBe(
      "2 servers · with Prime: 1"
    );
    expect(row('[data-map="de_mirage"] .game-where').textContent).toBe("1 server");
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
    expect(row('[data-map="de_dust2"] .game-where').textContent).toBe("1 server");
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
