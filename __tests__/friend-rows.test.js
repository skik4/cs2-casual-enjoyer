/**
 * @jest-environment jsdom
 *
 * Jest tests for the friend rows: what they show, how a status update
 * changes them and what survives a refresh
 */

jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: { getJoinStates: jest.fn(() => ({})), isActive: () => false },
}));

import appStateManager from "../src/core/app-state-manager.js";
import FriendsRenderer from "../src/ui/friends-renderer.js";
import StatusManager from "../src/ui/status-manager.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const FREE = "76561198000000011";
const FULL = "76561198000000012";

/** A friend in casual on Dust II */
const friend = (steamid, overrides = {}) => ({
  steamid,
  personaname: `player-${steamid.slice(-2)}`,
  avatar: "a.jpg",
  status: "Casual Dust II [ 3 : 1 ]",
  in_casual_mode: true,
  join_available: true,
  game_map: "de_dust2",
  game_score: "[ 3 : 1 ]",
  ...overrides,
});

const element = (id) => document.getElementById(id);
const label = (id) => element(`status-${id}`);
const button = (id) => element(`join-btn-${id}`);

beforeEach(() => {
  setLanguage("en");
  document.body.innerHTML = `
    <input id="friend-filter-input" />
    <span id="tab-count-friends"></span>
    <span id="tab-count-fake"></span>
    <div id="friends"></div>
    <div id="friends-empty" class="hidden"></div>
    <div id="fake-friends"></div>
    <div id="fake-friends-empty"></div>
    <div id="join-bar" class="hidden"></div>`;
});

test("a row shows the map, the score, whether a slot is free and the fitting button", () => {
  FriendsRenderer.renderFriendsList([
    friend(FREE),
    friend(FULL, { join_available: false, game_score: "[ 6 : 6 ]" }),
  ]);

  const row = element(`friend-${FREE}`);
  expect(row.querySelector(".game-map").textContent).toBe("Dust II");
  expect(row.querySelector(".game-score").textContent).toBe("3 : 1");
  expect(label(FREE).textContent).toBe("free slot");
  expect(button(FREE).textContent).toBe("Join");
  expect(label(FULL).textContent).toBe("no free slot");
  expect(button(FULL).textContent).toBe("Wait for a slot");
  expect(button(FULL).classList.contains("wait-btn")).toBe(true);
});

test("a status update shows the join, then falls back to the row's slot", () => {
  FriendsRenderer.renderFriendsList([friend(FULL, { join_available: false })]);

  StatusManager.updateLabel(FULL, STATUS_TYPES.WAITING);
  StatusManager.updateJoinButton(FULL, STATUS_TYPES.WAITING);
  expect(label(FULL).textContent).toBe("waiting for a slot");
  expect(label(FULL).classList.contains("status-busy")).toBe(true);
  expect(button(FULL).textContent).toBe("Cancel");

  StatusManager.updateLabel(FULL, STATUS_TYPES.CANCELLED);
  StatusManager.updateJoinButton(FULL, STATUS_TYPES.CANCELLED);
  expect(label(FULL).textContent).toBe("no free slot");
  expect(button(FULL).textContent).toBe("Wait for a slot");
});

test("someone out of casual shows where they are, with no slot label", () => {
  FriendsRenderer.renderFakeFriendsList([
    friend(FREE, { in_casual_mode: false, join_available: false, status: "Main Menu" }),
  ]);

  const row = element(`friend-${FREE}`);
  expect(row.querySelector(".game-text").textContent).toBe("Main Menu");
  expect(label(FREE).classList.contains("status-none")).toBe(true);
  expect(button(FREE).textContent).toBe("Join");
});

test("a refresh updates a row in place, keeping a remove waiting for its second click", () => {
  FriendsRenderer.renderFakeFriendsList([friend(FREE)]);
  const remove = element(`remove-fake-btn-${FREE}`);
  remove.classList.add("confirm-remove");
  remove.textContent = "Remove?";

  FriendsRenderer.renderFakeFriendsList([
    friend(FREE, { game_score: "[ 4 : 1 ]", join_available: false }),
  ]);

  expect(element(`remove-fake-btn-${FREE}`)).toBe(remove);
  expect(remove.textContent).toBe("Remove?");
  expect(element(`friend-${FREE}`).querySelector(".game-score").textContent).toBe(
    "4 : 1"
  );
  expect(label(FREE).textContent).toBe("no free slot");
});

test("tabs count their rows; with no friend in casual the empty message shows", () => {
  // Before the friends list is loaded, an empty list says nothing
  appStateManager.setState("savedFriendsIds", []);
  FriendsRenderer.renderFriendsList([]);
  expect(element("friends-empty").classList.contains("hidden")).toBe(true);

  appStateManager.setState("savedFriendsIds", [FREE, FULL]);
  FriendsRenderer.renderFriendsList([]);
  expect(element("friends-empty").classList.contains("hidden")).toBe(false);
  expect(element("tab-count-friends").textContent).toBe("");

  FriendsRenderer.renderFriendsList([friend(FREE), friend(FULL)]);
  expect(element("friends-empty").classList.contains("hidden")).toBe(true);
  expect(element("tab-count-friends").textContent).toBe("2");

  // The filter narrows the rows, not the count
  element("friend-filter-input").value = "11";
  FriendsRenderer.renderFriendsList([friend(FREE), friend(FULL)]);
  expect(element("friends").children).toHaveLength(1);
  expect(element("tab-count-friends").textContent).toBe("2");
});
