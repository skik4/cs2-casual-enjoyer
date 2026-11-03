/**
 * @jest-environment jsdom
 *
 * Jest tests for the Maps view: map and server rows with their labels, the
 * pin that keeps a map, and what a click on Join or Cancel starts
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import MapFinderView from "../src/ui/map-finder-view.js";
import mapFinder from "../src/game/map-finder.js";
import mapKeeper from "../src/game/map-keeper.js";
import userLocation from "../src/game/user-location.js";
import joinManager, { getMapJoinId } from "../src/game/join-manager.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
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
    <div id="maps-list"></div>
    <div id="maps-empty" class="hidden"></div>
    <span id="fof-summary"></span>
    <div id="fof-key-details" class="hidden"></div>
    <button id="fof-key-toggle"></button>`;
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
  mapKeeper.keep(null);
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
  expect(mapKeeper.getMap()).toBe("de_dust2");
  const pin = row('[data-keep-map="de_dust2"]');
  expect(pin.classList.contains("active")).toBe(true);
  expect(pin.getAttribute("aria-pressed")).toBe("true");
  // A click on the pin is no click on its row
  expect(MapFinderView.expanded.has("de_dust2")).toBe(true);

  click(row('[data-keep-map="de_dust2"]'));
  expect(mapKeeper.getMap()).toBeNull();
});

test("Join on another map lets a kept map go, and so does cancelling its own join", () => {
  mapKeeper.keep("de_mirage");
  MapFinderView.render();

  click(button(getMapJoinId("de_dust2")));
  expect(joinManager.startMapJoin).toHaveBeenCalledWith(
    expect.objectContaining({ map: "de_dust2", serverId: null })
  );
  expect(mapKeeper.getMap()).toBeNull();

  mapKeeper.keep("de_dust2");
  joinStates = { [getMapJoinId("de_dust2")]: { status: STATUS_TYPES.CONNECTING, cancelled: false } };
  MapFinderView.render();

  click(button(getMapJoinId("de_dust2")));
  expect(joinManager.cancelJoin).toHaveBeenCalledWith(getMapJoinId("de_dust2"));
  expect(mapKeeper.getMap()).toBeNull();
});
