/**
 * Tests for resetting joins only when the auth value really changes (B8)
 */

jest.mock("../src/core/app-state-manager.js", () => {
  const state = {};
  return {
    __esModule: true,
    default: {
      getState: jest.fn((key) => state[key]),
      setState: jest.fn((key, value) => {
        state[key] = value;
      }),
    },
  };
});
jest.mock("../src/game/join-manager.js", () => ({
  __esModule: true,
  default: { resetAll: jest.fn() },
}));
jest.mock("../src/ui/ui-manager.js", () => ({
  __esModule: true,
  default: {
    showError: jest.fn(),
    hideNotification: jest.fn(),
  },
}));
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { resolveVanityUrl: jest.fn() },
}));
// Mirrors the real extraction: a JSON blob yields its webapi_token
jest.mock("../src/utils/validators.js", () => {
  const fromJson = (input) => {
    try {
      return JSON.parse(input)?.data?.webapi_token || null;
    } catch {
      return null;
    }
  };
  return {
    __esModule: true,
    default: {
      extractTokenIfAny: jest.fn(() => null),
      extractApiKeyOrToken: jest.fn((input) => fromJson(input) || input),
      parseWebApiToken: jest.fn(() => null),
    },
  };
});
jest.mock("../src/utils/dom-utils.js", () => ({
  __esModule: true,
  default: { getElementById: jest.fn() },
}));

import appStateManager from "../src/core/app-state-manager.js";
import joinManager from "../src/game/join-manager.js";
import DOMUtils from "../src/utils/dom-utils.js";
import appInputManager from "../src/core/app-input-manager.js";

const SAVED_KEY = "ABCDEF0123456789ABCDEF0123456789";

let authInput;

const type = (value) => {
  authInput.value = value;
  appInputManager.handleAuthInput();
};

beforeEach(() => {
  jest.clearAllMocks();
  authInput = { value: SAVED_KEY };
  DOMUtils.getElementById.mockImplementation((id) =>
    id === "auth" ? authInput : null
  );
  appStateManager.setState("savedSettings", { auth: SAVED_KEY });
  appInputManager.lastAuth = null;
  jest.spyOn(appInputManager, "validateInputs").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AppInputManager.handleAuthInput", () => {
  test("first edit that keeps the saved key does not reset joins", () => {
    type(`  ${SAVED_KEY} `);

    expect(joinManager.resetAll).not.toHaveBeenCalled();
    expect(appInputManager.validateInputs).toHaveBeenCalled();
  });

  test("changing the key resets joins once", () => {
    type("NEWKEY0123456789NEWKEY0123456789");
    type("NEWKEY0123456789NEWKEY0123456789");

    expect(joinManager.resetAll).toHaveBeenCalledTimes(1);
  });

  test("typing that leaves the extracted value unchanged does not reset", () => {
    const json = JSON.stringify({ data: { webapi_token: "tok.en.value" } });

    type(json);
    expect(joinManager.resetAll).toHaveBeenCalledTimes(1);

    // Reformatted JSON and the bare token extract to the same value
    type(JSON.stringify({ data: { webapi_token: "tok.en.value" } }, null, 2));
    type("tok.en.value");

    expect(joinManager.resetAll).toHaveBeenCalledTimes(1);
  });

  test("typing into an empty field compares against saved settings", () => {
    appStateManager.setState("savedSettings", undefined);

    type("");
    expect(joinManager.resetAll).not.toHaveBeenCalled();

    type("K");
    expect(joinManager.resetAll).toHaveBeenCalledTimes(1);
  });
});
