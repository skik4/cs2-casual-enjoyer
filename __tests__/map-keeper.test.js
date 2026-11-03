/**
 * Jest tests for MapKeeper: after a match on the kept map ends, or when CS2
 * loads another map, another server of the kept map is joined
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import mapKeeper from "../src/game/map-keeper.js";
import gsiManager from "../src/game/gsi-manager.js";
import joinManager, { getMapJoinId } from "../src/game/join-manager.js";
import mapFinder from "../src/game/map-finder.js";
import { STATUS_TYPES } from "../src/shared/constants.js";

const USER = "76561198000000001";

/** A state CS2 posts: in a casual match on a map, or in the menu without one */
const cs2 = (map, phase = "live", mode = "casual") =>
  gsiManager.handlePayload({
    provider: { steamid: USER },
    ...(map ? { map: { name: map, mode, phase } } : {}),
    player: { steamid: USER, activity: map ? "playing" : "menu" },
  });

let startMapJoin;
let joinStates;

beforeEach(() => {
  joinStates = {};
  startMapJoin = jest.spyOn(joinManager, "startMapJoin").mockResolvedValue();
  jest.spyOn(joinManager, "getJoinStates").mockImplementation(() => joinStates);
  jest.spyOn(mapFinder, "setNeed").mockImplementation(() => {});
});

afterEach(() => {
  mapKeeper.reset();
  gsiManager.reset();
  jest.restoreAllMocks();
});

test("joins another server of the kept map once its match ends", () => {
  cs2("de_dust2");
  mapKeeper.keep("de_dust2");
  expect(startMapJoin).not.toHaveBeenCalled();

  // As seen live: the match ended 8:2 and the server went on to Inferno
  cs2("de_dust2", "gameover");

  expect(startMapJoin).toHaveBeenCalledTimes(1);
  expect(startMapJoin.mock.calls[0][0]).toMatchObject({ map: "de_dust2", serverId: null });
});

test("joins the kept map when CS2 is on another one", () => {
  mapKeeper.keep("de_dust2");
  cs2("de_inferno", "warmup");

  expect(startMapJoin).toHaveBeenCalledTimes(1);
});

test("stays quiet in the menu, in another mode, and on states it has seen", () => {
  mapKeeper.keep("de_dust2");
  cs2(null);
  cs2("de_inferno", "live", "competitive");
  expect(startMapJoin).not.toHaveBeenCalled();

  cs2("de_inferno", "warmup");
  cs2("de_inferno", "warmup");
  expect(startMapJoin).toHaveBeenCalledTimes(1);
});

test("starts no second join while one for the map runs", () => {
  joinStates = { [getMapJoinId("de_dust2")]: { status: STATUS_TYPES.CONNECTING, cancelled: false } };
  mapKeeper.keep("de_dust2");

  cs2("de_mirage", "warmup");

  expect(startMapJoin).not.toHaveBeenCalled();
});

test("lets go when the user joins elsewhere or cancels its join", () => {
  mapKeeper.keep("de_dust2");
  mapKeeper.userJoined("de_dust2");
  expect(mapKeeper.getMap()).toBe("de_dust2");
  mapKeeper.userJoined("de_mirage");
  expect(mapKeeper.getMap()).toBeNull();

  mapKeeper.keep("de_dust2");
  mapKeeper.userJoined(null);
  expect(mapKeeper.getMap()).toBeNull();

  mapKeeper.keep("de_dust2");
  mapKeeper.userCancelled("map-de_mirage");
  expect(mapKeeper.getMap()).toBe("de_dust2");
  mapKeeper.userCancelled(getMapJoinId("de_dust2"));
  expect(mapKeeper.getMap()).toBeNull();
});

test("keeps the map finder polling while a map is kept", () => {
  const listener = jest.fn();
  mapKeeper.onChange(listener);

  mapKeeper.toggle("de_dust2");
  expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);
  mapKeeper.toggle("de_dust2");
  expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);
  expect(listener).toHaveBeenCalledTimes(2);
});
