/**
 * Jest tests for MapKeeper: pinned maps joined as one, and joined again by
 * themselves after a match on one of them ends or CS2 is on another map
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import mapKeeper from "../src/game/map-keeper.js";
import gsiManager from "../src/game/gsi-manager.js";
import joinManager from "../src/game/join-manager.js";
import mapFinder from "../src/game/map-finder.js";
import userLocation from "../src/game/user-location.js";
import {
  GSI_CONFIG,
  PINNED_MAPS_JOIN_ID,
  STATUS_TYPES,
} from "../src/shared/constants.js";

const USER = "76561198000000001";

/**
 * A state CS2 posts: in a casual match on a map, or in the menu without one
 * @param {string|null} map - Map code, null for the menu
 * @param {string} [phase] - Match phase
 * @param {string} [mode] - Game mode
 * @param {[number, number]} [score] - Rounds won by CT and T, when CS2 gives them
 */
const cs2 = (map, phase = "live", mode = "casual", score = null) =>
  gsiManager.handlePayload({
    provider: { steamid: USER },
    ...(map
      ? {
          map: {
            name: map,
            mode,
            phase,
            ...(score
              ? { team_ct: { score: score[0] }, team_t: { score: score[1] } }
              : {}),
          },
        }
      : {}),
    player: { steamid: USER, activity: map ? "playing" : "menu" },
  });

let startMapJoin;
let joinStates;

beforeEach(() => {
  joinStates = {};
  startMapJoin = jest.spyOn(joinManager, "startMapJoin").mockResolvedValue();
  jest.spyOn(joinManager, "getJoinStates").mockImplementation(() => joinStates);
  jest.spyOn(joinManager, "cancelJoin").mockImplementation(() => {});
  jest.spyOn(mapFinder, "setNeed").mockImplementation(() => {});
});

afterEach(() => {
  mapKeeper.reset();
  gsiManager.reset();
  userLocation.reset();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("joins a server of a pinned map once the match on one ends", () => {
  cs2("de_dust2");
  mapKeeper.toggle("de_dust2");
  expect(startMapJoin).not.toHaveBeenCalled();

  // As seen live: the match ended 8:2 and the server went on to Inferno
  cs2("de_dust2", "gameover");

  expect(startMapJoin).toHaveBeenCalledTimes(1);
  expect(startMapJoin.mock.calls[0][0]).toMatchObject({
    joinId: PINNED_MAPS_JOIN_ID,
  });
});

test("one join takes any pinned map, read again as pins change", () => {
  mapKeeper.toggle("de_dust2");
  mapKeeper.toggle("de_mirage");
  cs2("de_inferno", "warmup");

  expect(startMapJoin).toHaveBeenCalledTimes(1);
  const target = startMapJoin.mock.calls[0][0];
  expect(target.maps()).toEqual(["de_dust2", "de_mirage"]);
  expect(target.label()).toBe("Dust II / Mirage");

  mapKeeper.toggle("de_dust2");
  expect(target.maps()).toEqual(["de_mirage"]);
});

test("stays quiet in the menu, in another mode, on a pinned map and on states it has seen", () => {
  mapKeeper.toggle("de_dust2");
  mapKeeper.toggle("de_mirage");
  cs2(null);
  cs2("de_inferno", "live", "competitive");
  cs2("de_mirage", "warmup");
  expect(startMapJoin).not.toHaveBeenCalled();

  cs2("de_inferno", "warmup");
  cs2("de_inferno", "warmup");
  expect(startMapJoin).toHaveBeenCalledTimes(1);
});

test("starts no second join while one runs", () => {
  joinStates = {
    [PINNED_MAPS_JOIN_ID]: {
      status: STATUS_TYPES.CONNECTING,
      cancelled: false,
    },
  };
  mapKeeper.toggle("de_dust2");

  cs2("de_mirage", "warmup");
  mapKeeper.join();

  expect(startMapJoin).not.toHaveBeenCalled();
});

test("the pins go when the user joins a friend or a map not pinned, or cancels their join", () => {
  mapKeeper.toggle("de_dust2");
  mapKeeper.userJoined("de_dust2");
  expect(mapKeeper.getMaps()).toEqual(["de_dust2"]);
  mapKeeper.userJoined("de_mirage");
  expect(mapKeeper.getMaps()).toEqual([]);

  mapKeeper.toggle("de_dust2");
  mapKeeper.userJoined(null);
  expect(mapKeeper.getMaps()).toEqual([]);

  mapKeeper.toggle("de_dust2");
  mapKeeper.userCancelled("map-de_dust2");
  expect(mapKeeper.getMaps()).toEqual(["de_dust2"]);
  mapKeeper.userCancelled(PINNED_MAPS_JOIN_ID);
  expect(mapKeeper.getMaps()).toEqual([]);
});

test("unpinning the last map ends its join and lets the map finder rest", () => {
  cs2(null);
  const listener = jest.fn();
  mapKeeper.onChange(listener);
  mapKeeper.toggle("de_dust2");
  expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);

  joinStates = {
    [PINNED_MAPS_JOIN_ID]: { status: STATUS_TYPES.WAITING, cancelled: false },
  };
  mapKeeper.toggle("de_dust2");

  expect(joinManager.cancelJoin).toHaveBeenCalledWith(
    PINNED_MAPS_JOIN_ID,
    "unpinned"
  );
  expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);
  expect(listener).toHaveBeenCalledTimes(2);
});

describe("pins poll Steam only while one may start its join soon", () => {
  test("pinned with CS2 closed: the finder rests until CS2 posts", () => {
    mapKeeper.toggle("de_dust2");
    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);

    cs2(null);

    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);
  });

  test("CS2 falling silent lets the finder rest", () => {
    jest.useFakeTimers();
    cs2(null);
    mapKeeper.toggle("de_dust2");
    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);

    // CS2 closed: no more posts
    jest.advanceTimersByTime(GSI_CONFIG.FRESH_MS + 1);

    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);
  });

  test("without CS2's own state no pin can join: Steam showing CS2 open is not enough", () => {
    userLocation.setSteamPresence({ inCS2: true });
    mapKeeper.toggle("de_dust2");

    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);
  });

  test("in a casual match the finder rests until match point, then looks until the match ends", () => {
    cs2("de_dust2", "live", "casual", [3, 2]);
    mapKeeper.toggle("de_dust2");
    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);

    // One more round can end it: a side has CASUAL_ROUNDS_TO_WIN - 1
    cs2("de_dust2", "live", "casual", [6, 7]);
    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);

    cs2("de_dust2", "gameover", "casual", [6, 8]);
    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);
  });

  test("a casual match without a score from CS2 keeps the finder looking, as before", () => {
    cs2("de_dust2", "live", "casual");
    mapKeeper.toggle("de_dust2");

    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);
  });

  test.each(["competitive", "deathmatch"])(
    "%s starts no pin's join, and the finder rests",
    (mode) => {
      cs2("de_dust2", "live", mode, [7, 7]);
      mapKeeper.toggle("de_dust2");

      expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);
    }
  );

  test("back in the menu the finder looks again", () => {
    cs2("de_dust2", "live", "casual", [1, 0]);
    mapKeeper.toggle("de_dust2");
    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", false);

    cs2(null);

    expect(mapFinder.setNeed).toHaveBeenLastCalledWith("keep", true);
  });
});
