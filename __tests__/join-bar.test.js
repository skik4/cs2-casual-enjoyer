/**
 * @jest-environment jsdom
 *
 * Jest tests for the join bar above the tabs
 */

jest.mock("../src/game/join-manager.js", () => {
  const RUNNING = ["waiting", "connecting", "missing"];
  return {
    __esModule: true,
    default: {
      getJoinStates: jest.fn(() => ({})),
      isActive: (state) =>
        Boolean(state) && !state.cancelled && RUNNING.includes(state.status),
      cancelJoin: jest.fn(),
    },
  };
});
jest.mock("../src/game/map-finder.js", () => ({
  __esModule: true,
  default: {},
  mapLabel: (map) => (map === "de_dust2" ? "Dust II" : map),
}));

import JoinBar from "../src/ui/join-bar.js";
import joinManager from "../src/game/join-manager.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const FRIEND = "76561198000000002";

const element = (id) => document.getElementById(id);
const shown = () => !element("join-bar").classList.contains("hidden");

beforeAll(() => {
  setLanguage("en");
  document.body.innerHTML = `
    <div id="friend-${FRIEND}"><span class="personaname">Gabe</span></div>
    <div id="join-bar" class="hidden">
      <span id="join-bar-title"></span>
      <span id="join-bar-detail"></span>
      <button id="join-bar-cancel"></button>
    </div>`;
  JoinBar.initialize();
});

beforeEach(() => {
  joinManager.getJoinStates.mockReturnValue({});
  joinManager.cancelJoin.mockClear();
});

test("stays hidden while nothing joins", () => {
  JoinBar.render();
  expect(shown()).toBe(false);
});

test("shows the running attempt, named from its row before Steam names it", () => {
  joinManager.getJoinStates.mockReturnValue({
    [FRIEND]: { status: STATUS_TYPES.CONNECTING },
  });

  JoinBar.render();

  expect(shown()).toBe(true);
  expect(element("join-bar-title").textContent).toBe("Joining Gabe");
  expect(element("join-bar-detail").textContent).toBe(
    "Connect sent, waiting for CS2"
  );
});

test("names a map attempt after the map and explains a full server", () => {
  joinManager.getJoinStates.mockReturnValue({
    "map-de_dust2": { status: STATUS_TYPES.WAITING },
  });

  JoinBar.render();

  expect(element("join-bar-title").textContent).toBe("Joining Dust II");
  expect(element("join-bar-detail").textContent).toMatch(/full/);
});

test("Cancel cancels the attempt it shows", () => {
  joinManager.getJoinStates.mockReturnValue({
    [FRIEND]: { status: STATUS_TYPES.CONNECTING, personaname: "Gabe" },
  });
  JoinBar.render();

  element("join-bar-cancel").click();

  expect(joinManager.cancelJoin).toHaveBeenCalledWith(FRIEND);
});

test("a join that landed shows without Cancel; a cancelled one hides the bar", () => {
  joinManager.getJoinStates.mockReturnValue({
    [FRIEND]: { status: STATUS_TYPES.JOINED, personaname: "Gabe" },
  });
  JoinBar.render();
  expect(element("join-bar-detail").textContent).toBe("You are on the server");
  expect(element("join-bar-cancel").classList.contains("hidden")).toBe(true);

  joinManager.getJoinStates.mockReturnValue({
    [FRIEND]: { status: STATUS_TYPES.CANCELLED, cancelled: true },
  });
  JoinBar.render();
  expect(shown()).toBe(false);
});
