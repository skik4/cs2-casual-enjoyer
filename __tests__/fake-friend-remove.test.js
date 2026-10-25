/**
 * Jest tests for removing a fake friend: the first click on × only asks for
 * a second one
 */

jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: {
    cancelJoin: jest.fn(),
    startJoin: jest.fn(),
    getJoinStates: jest.fn(() => ({})),
  },
}));
jest.mock("../src/core/app-state-manager.js", () => ({
  __esModule: true,
  default: { getState: jest.fn(() => []), setState: jest.fn() },
}));
jest.mock("../src/ui/ui-manager.js", () => ({
  __esModule: true,
  default: {
    renderFakeFriendsList: jest.fn(),
    lastRenderedFakeFriends: [],
    showError: jest.fn(),
  },
}));
jest.mock("../src/ui/fake-friends-manager.js", () => ({
  __esModule: true,
  default: { removeId: jest.fn() },
}));
jest.mock("../src/ui/view-tabs.js", () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));
jest.mock("../src/utils/dom-utils.js", () => ({
  __esModule: true,
  default: { getElementById: jest.fn() },
}));
jest.mock("../src/utils/error-handler.js", () => ({
  __esModule: true,
  default: { logError: jest.fn() },
}));
jest.mock("../src/ui/tutorial/tutorial-manager.js", () => ({
  __esModule: true,
  default: { stateManager: { getIsActive: () => false } },
}));
jest.mock("../src/i18n/i18n-manager.js", () => ({
  __esModule: true,
  t: jest.fn((key) => key),
}));
jest.mock("../src/ui/html-templates.js", () => ({
  __esModule: true,
  FRIENDS_TEMPLATES: { REMOVE_FAKE_ICON: () => "<img>" },
}));

import appEventManager from "../src/core/app-event-manager.js";
import FakeFriendsManager from "../src/ui/fake-friends-manager.js";
import DOMUtils from "../src/utils/dom-utils.js";
import joinManager from "../src/game/join-manager.js";

const FAKE = "76561198000000003";

/** Just enough of a button for the handler */
function makeButton(id) {
  const classes = new Set(["remove-fake-btn"]);
  return {
    id,
    textContent: "",
    innerHTML: "<img>",
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
}

describe("removing a fake friend", () => {
  let click;
  let button;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    FakeFriendsManager.removeId.mockResolvedValue(true);

    let handler;
    DOMUtils.getElementById.mockImplementation((id) =>
      id === "fake-friends"
        ? { addEventListener: (type, fn) => (handler = fn) }
        : null
    );
    appEventManager.setupFakeFriendListeners();

    button = makeButton(`remove-fake-btn-${FAKE}`);
    click = () =>
      handler({
        target: {
          closest: (selector) =>
            selector.includes("remove-fake-btn") ? button : null,
        },
      });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("the first click only asks for confirmation", () => {
    click();

    expect(FakeFriendsManager.removeId).not.toHaveBeenCalled();
    expect(button.classList.contains("confirm-remove")).toBe(true);
    expect(button.textContent).toBe("friends.confirmRemove");
  });

  test("a second click removes the ID and cancels its join", async () => {
    click();
    click();
    await jest.advanceTimersByTimeAsync(0);

    expect(FakeFriendsManager.removeId).toHaveBeenCalledTimes(1);
    expect(FakeFriendsManager.removeId).toHaveBeenCalledWith(FAKE);
    expect(joinManager.cancelJoin).toHaveBeenCalledWith(FAKE);
    expect(button.classList.contains("confirm-remove")).toBe(false);
  });

  test("the confirmation lapses, and a later click asks again", () => {
    click();
    jest.advanceTimersByTime(3000);

    expect(button.classList.contains("confirm-remove")).toBe(false);
    expect(button.innerHTML).toBe("<img>");

    click();
    expect(FakeFriendsManager.removeId).not.toHaveBeenCalled();
    expect(button.classList.contains("confirm-remove")).toBe(true);
  });
});
