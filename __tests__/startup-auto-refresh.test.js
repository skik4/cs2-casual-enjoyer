/**
 * Jest tests for the startup decision to auto-refresh the friends list:
 * once per run, with saved friends and a credential that has not expired
 */

jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: {
    resetAll: jest.fn(),
    getJoinStates: jest.fn(() => ({})),
    isActive: () => false,
  },
}));
jest.mock("../src/ui/ui-manager.js", () => ({
  __esModule: true,
  default: {
    showError: jest.fn(),
    hideNotification: jest.fn(),
    renderFriendsList: jest.fn(),
    renderFakeFriendsList: jest.fn(),
  },
}));
jest.mock("../src/ui/account-view.js", () => ({
  __esModule: true,
  default: { update: jest.fn(), open: jest.fn(), close: jest.fn() },
}));
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: {},
}));
jest.mock("../src/utils/dom-utils.js", () => ({
  __esModule: true,
  default: { getElementById: jest.fn(), toggleClass: jest.fn(), setText: jest.fn() },
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
const mockTutorial = { active: false };
jest.mock("../src/ui/tutorial/tutorial-manager.js", () => ({
  __esModule: true,
  default: {
    get isActive() {
      return mockTutorial.active;
    },
  },
}));

import appInputManager from "../src/core/app-input-manager.js";
import appFriendsManager from "../src/core/app-friends-manager.js";
import appStateManager from "../src/core/app-state-manager.js";
import DOMUtils from "../src/utils/dom-utils.js";

const USER = "76561198000000001";
const FRIEND = "76561198000000002";
const KEY = "ABCDEF0123456789ABCDEF0123456789";

/** A Web API token for USER that expires at the given unix time */
const tokenExpiring = (exp) =>
  [
    Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: USER, exp })).toString("base64url"),
    "signature",
  ].join(".");

/** Just enough of an input for validateInputs */
const field = (value) => ({ value, classList: { add() {}, remove() {} } });

let start;

/** The credential in the fields and in the saved settings */
function saved(auth) {
  const fields = {
    "steam-id": field(USER),
    auth: field(auth),
    "update-friends-btn": { disabled: true },
  };
  DOMUtils.getElementById.mockImplementation((id) => fields[id] || null);
  appStateManager.setState("savedSettings", {
    steam_id: USER,
    auth,
    friends_ids: [FRIEND],
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockTutorial.active = false;
  saved(KEY);
  appStateManager.batchUpdate({
    savedFriendsIds: [FRIEND],
    usingSavedFriends: true,
  });
  appFriendsManager.initialLoadAttempted = false;

  // Wired as App's constructor wires them
  appInputManager.setFriendsManager(appFriendsManager);
  start = jest.spyOn(appFriendsManager, "startAutoRefresh").mockResolvedValue();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("starts once per run, however often the inputs are validated", () => {
  appInputManager.validateInputs();
  jest.runOnlyPendingTimers();
  expect(start).toHaveBeenCalledTimes(1);

  appInputManager.validateInputs();
  appInputManager.validateInputs();
  jest.runOnlyPendingTimers();
  expect(start).toHaveBeenCalledTimes(1);
});

test("does not start with an expired token", () => {
  saved(tokenExpiring(Math.floor(Date.now() / 1000) - 60));

  appInputManager.validateInputs();
  jest.runOnlyPendingTimers();

  expect(start).not.toHaveBeenCalled();
});

test("starts with a token that is still good", () => {
  saved(tokenExpiring(Math.floor(Date.now() / 1000) + 3600));

  appInputManager.validateInputs();
  jest.runOnlyPendingTimers();

  expect(start).toHaveBeenCalledTimes(1);
});

test("does not start while the tutorial is active", () => {
  mockTutorial.active = true;

  appInputManager.validateInputs();
  jest.runOnlyPendingTimers();

  expect(start).not.toHaveBeenCalled();
});

test("does not start without saved friends", () => {
  appStateManager.setState("savedFriendsIds", []);

  appInputManager.validateInputs();
  jest.runOnlyPendingTimers();

  expect(start).not.toHaveBeenCalled();
});

test("does not start on a first run, with nothing saved", () => {
  appStateManager.batchUpdate({ savedSettings: null, savedFriendsIds: [] });

  appInputManager.validateInputs();
  jest.runOnlyPendingTimers();

  expect(start).not.toHaveBeenCalled();
});
