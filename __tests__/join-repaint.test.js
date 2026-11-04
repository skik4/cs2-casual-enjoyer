/**
 * @jest-environment jsdom
 *
 * Jest tests for what keeps a running join painted without a timer: a
 * refresh rebuilds its row from the join states and leaves the join bar up,
 * and the bar follows the attempt's name when it changes while the status
 * does not
 */

jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { getJoinSnapshot: jest.fn(), getPresence: jest.fn() },
}));
// The join bar pulls the map keeper in, and with it the finder; the need the
// dot callback sets is all this suite reads from it
jest.mock("../src/game/map-finder.js", () => ({
  __esModule: true,
  default: { setNeed: jest.fn() },
}));
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import joinManager from "../src/game/join-manager.js";
import mapFinder from "../src/game/map-finder.js";
import FriendsRenderer from "../src/ui/friends-renderer.js";
import StatusManager from "../src/ui/status-manager.js";
import SteamAPI from "../src/steam/steam-api.js";
import {
  API_CONFIG,
  PINNED_MAPS_JOIN_ID,
  STATUS_TYPES,
} from "../src/shared/constants.js";
import { mapLabel } from "../src/shared/map-labels.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const USER = "76561198000000001";
const FRIEND = "76561198000000002";
const PLAYER = "76561198000000003";
const KEY = "ABCDEF0123456789ABCDEF0123456789";
const SERVER = "90071992547409921";

/** The friend's row as the friends list shows it: in casual, no free slot */
const friendRow = () => ({
  steamid: FRIEND,
  personaname: "Gabe",
  avatar: "a.jpg",
  status: "Casual Dust II [ 3 : 1 ]",
  in_casual_mode: true,
  join_available: false,
  game_map: "de_dust2",
  game_score: "[ 3 : 1 ]",
});

/** What Steam shows about one player */
const presence = (overrides = {}) => ({
  personaname: "",
  inCS2: true,
  inProtectedMatch: false,
  offlineGame: null,
  inSupportedMode: false,
  connect: null,
  serverId: null,
  statusKey: "",
  ...overrides,
});

/** The user in the menu; the friend on a full server */
const snapshot = () => ({
  user: presence({ personaname: "me" }),
  friend: presence({ personaname: "Gabe", inSupportedMode: true, serverId: SERVER }),
});

/** The user in the menu; a known player on Dust II with no slot to offer */
const presences = () =>
  new Map([
    [USER, presence({ steamid: USER, official: false, map: null, score: null })],
    [
      PLAYER,
      presence({
        steamid: PLAYER,
        inSupportedMode: true,
        serverId: SERVER,
        official: true,
        map: "de_dust2",
        score: "[ 1 : 0 ]",
      }),
    ],
  ]);

const element = (id) => document.getElementById(id);
const label = () => element(`status-${FRIEND}`).textContent;
const button = () => element(`join-btn-${FRIEND}`).textContent;
const barShown = () => !element("join-bar").classList.contains("hidden");
const barTitle = () => element("join-bar-title").textContent;
const status = (id) => joinManager.getJoinStates()[id]?.status;
/** Let the CS2 check and a Steam answer settle without moving the clock */
const flush = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  jest.useFakeTimers();
  setLanguage("en");
  document.body.innerHTML = `
    <input id="friend-filter-input" />
    <span id="tab-count-friends"></span>
    <span id="tab-count-fake"></span>
    <div id="friends"></div>
    <div id="friends-empty" class="hidden"></div>
    <div id="fake-friends"></div>
    <div id="fake-friends-empty"></div>
    <div id="join-bar" class="hidden">
      <span id="join-bar-title"></span>
      <span id="join-bar-detail"></span>
      <button id="join-bar-cancel"></button>
    </div>`;

  joinManager.configure({ getCredentials: () => ({ steamId: USER, auth: KEY }) });
  joinManager.setCS2Manager({
    checkUserInCS2: jest.fn().mockResolvedValue(true),
    getGsiUserState: () => null,
  });
  // Wired as app.js wires it
  joinManager.setUICallbacks(
    (id, joinStatus) => {
      StatusManager.updateLabel(id, joinStatus);
      mapFinder.setNeed("join", joinManager.hasActiveMapJoin());
    },
    (id, joinStatus) => StatusManager.updateJoinButton(id, joinStatus)
  );
  SteamAPI.getJoinSnapshot.mockResolvedValue(snapshot());
  SteamAPI.getPresence.mockResolvedValue(presences());
  window.electronAPI = { shell: { openExternal: jest.fn().mockResolvedValue(true) } };
});

afterEach(() => {
  joinManager.resetAll();
  mapFinder.setNeed.mockClear();
  jest.clearAllTimers();
  jest.useRealTimers();
  delete window.electronAPI;
});

test("a refresh rebuilds the row of a waiting attempt from the join states, with no timer", async () => {
  FriendsRenderer.renderFriendsList([friendRow()]);
  expect(label()).toBe("no free slot");
  expect(button()).toBe("Wait for a slot");

  joinManager.startJoin(FRIEND);
  await flush();

  expect(status(FRIEND)).toBe(STATUS_TYPES.WAITING);
  expect(label()).toBe("waiting for a slot");
  expect(button()).toBe("Cancel");
  expect(barShown()).toBe(true);
  expect(barTitle()).toBe("Joining Gabe");

  // Two refreshes, as fetchAndRenderFriendsByIds renders them: the rows are
  // built from the join states, and no timer has run
  FriendsRenderer.renderFriendsList([friendRow()], joinManager.getJoinStates());
  FriendsRenderer.renderFriendsList([friendRow()], joinManager.getJoinStates());

  expect(label()).toBe("waiting for a slot");
  expect(button()).toBe("Cancel");
  expect(barShown()).toBe(true);
  expect(barTitle()).toBe("Joining Gabe");
});

test("the join bar follows the name of a pinned-maps attempt as the pins change", async () => {
  let pinned = ["de_dust2"];
  joinManager.startMapJoin({
    joinId: PINNED_MAPS_JOIN_ID,
    maps: () => pinned,
    label: () => pinned.map(mapLabel).join(", "),
    getCandidateIds: () => [PLAYER],
  });
  await flush();

  expect(status(PINNED_MAPS_JOIN_ID)).toBe(STATUS_TYPES.WAITING);
  expect(barTitle()).toBe("Joining Dust II");
  // A map join needs fresh servers from the start
  expect(mapFinder.setNeed).toHaveBeenLastCalledWith("join", true);

  // Another map pinned: the next iteration reads the pins again, and the
  // attempt keeps waiting - only its name changes
  pinned = ["de_dust2", "de_mirage"];
  await jest.advanceTimersByTimeAsync(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

  expect(status(PINNED_MAPS_JOIN_ID)).toBe(STATUS_TYPES.WAITING);
  expect(barTitle()).toBe("Joining Dust II, Mirage");

  joinManager.cancelJoin(PINNED_MAPS_JOIN_ID);
  expect(barShown()).toBe(false);
  // ...and no longer once it is over
  expect(mapFinder.setNeed).toHaveBeenLastCalledWith("join", false);
});
