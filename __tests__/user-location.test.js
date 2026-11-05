/**
 * Jest tests for UserLocation: where the user plays, from Steam's presence
 * checked against CS2's own state
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

import userLocation from "../src/game/user-location.js";
import gsiManager from "../src/game/gsi-manager.js";

const USER = "76561198000000001";
const SERVER = "90071992547409921";

/** The user's presence on an official casual server, as Steam shows it */
const steam = (overrides = {}) => ({
  inCS2: true,
  serverId: SERVER,
  official: true,
  map: "de_dust2",
  score: "[ 3 : 1 ]",
  ...overrides,
});

/** A state CS2 posts: in a match on a map, or in the menu without one */
const cs2 = (map) =>
  gsiManager.handlePayload({
    provider: { steamid: USER },
    ...(map ? { map } : {}),
    player: { steamid: USER, activity: map ? "playing" : "menu" },
  });

afterEach(() => {
  userLocation.reset();
  gsiManager.reset();
});

test("back in the menu the user is on no server, whatever Steam still shows", () => {
  userLocation.setSteamPresence(steam());
  cs2(null);

  expect(userLocation.getServerId()).toBeNull();
  expect(userLocation.getMap()).toBeNull();
});

test("in a match the server comes from Steam and the map from CS2", () => {
  userLocation.setSteamPresence(steam());
  cs2({ mode: "casual", name: "de_inferno", phase: "warmup" });

  expect(userLocation.getServerId()).toBe(SERVER);
  expect(userLocation.getMap()).toBe("de_inferno");
  expect(userLocation.getOwnMatch()).toEqual({
    map: "de_inferno",
    over: false,
  });
});

test("a finished match or another mode is no map to block", () => {
  cs2({ mode: "casual", name: "de_dust2", phase: "gameover" });
  expect(userLocation.getMap()).toBeNull();
  expect(userLocation.getOwnMatch()).toEqual({ map: "de_dust2", over: true });

  cs2({ mode: "competitive", name: "de_dust2", phase: "live" });
  expect(userLocation.getMap()).toBeNull();
});

test("without CS2's state Steam's presence stands in", () => {
  userLocation.setSteamPresence(steam());
  expect(userLocation.getServerId()).toBe(SERVER);
  expect(userLocation.getMap()).toBe("de_dust2");

  userLocation.setSteamPresence(steam({ score: "[ 8 : 2 ]" }));
  expect(userLocation.getMap()).toBeNull();

  userLocation.setSteamPresence(steam({ inCS2: false }));
  expect(userLocation.getServerId()).toBeNull();
});

test("listeners hear about a change once, from Steam or from CS2", () => {
  const listener = jest.fn();
  userLocation.onChange(listener);

  userLocation.setSteamPresence(steam());
  userLocation.setSteamPresence(steam());
  expect(listener).toHaveBeenCalledTimes(1);

  cs2(null);
  expect(listener).toHaveBeenCalledTimes(2);
});
