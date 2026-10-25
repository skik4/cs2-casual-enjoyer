/**
 * Jest tests for small shared modules: errors and app state
 */

import ErrorHandler from "../src/utils/error-handler.js";
import appStateManager from "../src/core/app-state-manager.js";
import { ERROR_CODES } from "../src/shared/constants.js";

describe("ErrorHandler", () => {
  test("createError carries the code and a readable message", () => {
    const error = ErrorHandler.createError(ERROR_CODES.EMPTY_FRIENDS_LIST);
    expect(error.code).toBe(ERROR_CODES.EMPTY_FRIENDS_LIST);
    expect(error.message).toBe("No friends found in your friends list.");

    expect(ErrorHandler.createError("X", "custom").message).toBe("custom");
    expect(ErrorHandler.createError("UNKNOWN").message).toBe(
      "An error occurred (UNKNOWN)"
    );
  });

  test("formatErrorMessage handles strings, errors and anything else", () => {
    expect(ErrorHandler.formatErrorMessage("text")).toBe("text");
    expect(ErrorHandler.formatErrorMessage(new Error("boom"))).toBe("boom");
    expect(ErrorHandler.formatErrorMessage({})).toBe("An unknown error occurred");
  });

  test("isPrivacyError recognises the private friends list", () => {
    expect(
      ErrorHandler.isPrivacyError(
        ErrorHandler.createError(ERROR_CODES.PRIVATE_FRIENDS_LIST)
      )
    ).toBe(true);
    expect(ErrorHandler.isPrivacyError(new Error("network down"))).toBe(false);
  });
});

describe("AppStateManager", () => {
  test("stores single and batched values", () => {
    appStateManager.setState("usingSavedFriends", true);
    appStateManager.batchUpdate({ savedFriendsIds: ["1"], initialLoadAttempted: true });

    expect(appStateManager.getState("usingSavedFriends")).toBe(true);
    expect(appStateManager.getState("savedFriendsIds")).toEqual(["1"]);
    expect(appStateManager.getState("initialLoadAttempted")).toBe(true);
  });

  test("clearRefreshInterval stops the friends refresh", () => {
    jest.useFakeTimers();
    const tick = jest.fn();
    appStateManager.setState("friendsRefreshInterval", setInterval(tick, 1000));

    appStateManager.clearRefreshInterval();
    jest.advanceTimersByTime(5000);

    expect(tick).not.toHaveBeenCalled();
    expect(appStateManager.getState("friendsRefreshInterval")).toBeNull();
    jest.useRealTimers();
  });
});
