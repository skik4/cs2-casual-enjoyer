/**
 * @jest-environment jsdom
 *
 * Jest tests for the clicks that start and cancel a friend join, on the
 * Friends and the Fake Friends tabs, and for the tutorial holding them
 */

jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: {
    startJoin: jest.fn(),
    cancelJoin: jest.fn(),
    getJoinStates: jest.fn(() => ({})),
    isActive: (state) => Boolean(state) && state.status === "connecting",
    hasActiveMapJoin: () => false,
    resetAll: jest.fn(),
  },
}));
jest.mock("../src/game/map-keeper.js", () => ({
  __esModule: true,
  default: { userJoined: jest.fn(), userCancelled: jest.fn(), getLabel: () => "" },
}));
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { getFriendsStatuses: jest.fn(), getPresence: jest.fn() },
}));
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
// Each test puts the tutorial where it needs it
const mockTutorial = { active: false, step: 0 };
jest.mock("../src/ui/tutorial/tutorial-manager.js", () => ({
  __esModule: true,
  default: {
    get isActive() {
      return mockTutorial.active;
    },
    stateManager: {
      getIsActive: () => mockTutorial.active,
      getCurrentStep: () => mockTutorial.step,
    },
    nextStep: jest.fn(),
    start: jest.fn(),
  },
}));

import FriendsView from "../src/ui/friends-view.js";
import FakeFriendsView from "../src/ui/fake-friends-view.js";
import appFriendsManager from "../src/core/app-friends-manager.js";
import appStateManager from "../src/core/app-state-manager.js";
import FriendsRenderer from "../src/ui/friends-renderer.js";
import joinManager from "../src/game/join-manager.js";
import mapKeeper from "../src/game/map-keeper.js";
import userLocation from "../src/game/user-location.js";
import tutorialManager from "../src/ui/tutorial/tutorial-manager.js";
import SteamAPI from "../src/steam/steam-api.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const USER = "76561198000000001";
const FRIEND = "76561198000000002";
const FAKE = "76561198000000003";
const AUTH = "ABCDEF0123456789ABCDEF0123456789";

/** A friend in casual on Dust II */
const friend = (steamid) => ({
  steamid,
  personaname: `player-${steamid.slice(-2)}`,
  avatar: "a.jpg",
  status: "Casual Dust II [ 3 : 1 ]",
  in_casual_mode: true,
  join_available: true,
  game_map: "de_dust2",
  game_score: "[ 3 : 1 ]",
});

const connecting = (steamid) => ({ [steamid]: { status: STATUS_TYPES.CONNECTING } });
const button = (steamid) => document.getElementById(`join-btn-${steamid}`);
const clicks = (spy) => spy.mock.calls.filter(([type]) => type === "click").length;

let listens;

beforeEach(() => {
  setLanguage("en");
  jest.clearAllMocks();
  mockTutorial.active = false;
  mockTutorial.step = 0;
  document.body.innerHTML = `
    <input id="friend-filter-input" />
    <span id="tab-count-friends"></span>
    <span id="tab-count-fake"></span>
    <div id="friends"></div>
    <div id="friends-empty" class="hidden"></div>
    <div id="fake-friends"></div>
    <div id="fake-friends-empty"></div>
    <div id="join-bar" class="hidden"></div>`;
  appStateManager.batchUpdate({
    friendsData: [],
    savedFriendsIds: [FRIEND],
    usingSavedFriends: true,
    savedSettings: { steam_id: USER, auth: AUTH, fake_friend_ids: [FAKE] },
  });
  SteamAPI.getFriendsStatuses.mockResolvedValue([friend(FRIEND)]);
  SteamAPI.getPresence.mockResolvedValue(new Map());

  // Wired as App wires them
  const inputManager = { getSteamId: () => USER, getAuth: () => AUTH };
  appFriendsManager.setInputManager(inputManager);

  FriendsView.initialize();
  FakeFriendsView.initialize({ getOwnSteamId: () => USER, onAdded: () => {} });

  // What the renders below do to the container's listeners
  const container = document.getElementById("friends");
  listens = {
    added: jest.spyOn(container, "addEventListener"),
    removed: jest.spyOn(container, "removeEventListener"),
  };
});

afterEach(() => {
  userLocation.reset();
});

test("Join on a row lets go of the kept map, then starts the join", () => {
  FriendsRenderer.renderFriendsList([friend(FRIEND)]);

  button(FRIEND).click();

  expect(mapKeeper.userJoined).toHaveBeenCalledWith(null);
  expect(joinManager.startJoin).toHaveBeenCalledWith(FRIEND);
  expect(mapKeeper.userJoined.mock.invocationCallOrder[0]).toBeLessThan(
    joinManager.startJoin.mock.invocationCallOrder[0]
  );
});

test("Cancel on a row cancels its attempt and starts nothing", () => {
  FriendsRenderer.renderFriendsList([friend(FRIEND)], connecting(FRIEND));
  expect(button(FRIEND).classList.contains("cancel-btn")).toBe(true);

  button(FRIEND).click();

  expect(joinManager.cancelJoin).toHaveBeenCalledWith(FRIEND);
  expect(joinManager.startJoin).not.toHaveBeenCalled();
  expect(mapKeeper.userJoined).not.toHaveBeenCalled();
});

test("the Fake Friends tab joins and cancels the same way", () => {
  FriendsRenderer.renderFakeFriendsList([friend(FAKE)]);
  button(FAKE).click();

  expect(mapKeeper.userJoined).toHaveBeenCalledWith(null);
  expect(joinManager.startJoin).toHaveBeenCalledWith(FAKE);

  FriendsRenderer.renderFakeFriendsList([friend(FAKE)], connecting(FAKE));
  button(FAKE).click();

  expect(joinManager.cancelJoin).toHaveBeenCalledWith(FAKE);
  expect(joinManager.startJoin).toHaveBeenCalledTimes(1);
});

test("on the tutorial's connection step a click moves it on and joins nothing", () => {
  mockTutorial.active = true;
  mockTutorial.step = 7;
  FriendsRenderer.renderFriendsList([friend(FRIEND)]);

  button(FRIEND).click();

  expect(tutorialManager.nextStep).toHaveBeenCalledTimes(1);
  expect(joinManager.startJoin).not.toHaveBeenCalled();
  expect(mapKeeper.userJoined).not.toHaveBeenCalled();
});

test.each([6, 8, 9])("on tutorial step index %i a click does nothing", (step) => {
  mockTutorial.active = true;
  mockTutorial.step = step;
  FriendsRenderer.renderFriendsList([friend(FRIEND)]);

  button(FRIEND).click();

  expect(tutorialManager.nextStep).not.toHaveBeenCalled();
  expect(joinManager.startJoin).not.toHaveBeenCalled();
  expect(joinManager.cancelJoin).not.toHaveBeenCalled();
});

test("one listener serves the rows however many refreshes render them", async () => {
  for (let i = 0; i < 3; i++) {
    await appFriendsManager.fetchAndRenderFriendsByIds([FRIEND], AUTH, true);
  }

  button(FRIEND).click();

  expect(joinManager.startJoin).toHaveBeenCalledTimes(1);
  // The refreshes leave the one listener from setup as it was
  expect(clicks(listens.added)).toBe(clicks(listens.removed));
});
