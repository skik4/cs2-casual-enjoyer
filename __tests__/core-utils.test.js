/**
 * Jest tests for small shared modules: errors and app state
 */

import ErrorHandler from "../src/utils/error-handler.js";
import appStateManager from "../src/core/app-state-manager.js";
import { ERROR_CODES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

/** An error as the Steam client throws it: a code, a status, a log message */
const coded = (code, status) =>
  Object.assign(ErrorHandler.createError(code, `GetFriendsList failed: ${status}`), {
    status,
  });

describe("ErrorHandler", () => {
  afterEach(() => setLanguage("en"));

  test("createError carries the code, a message for the log and a cause", () => {
    const error = ErrorHandler.createError(ERROR_CODES.EMPTY_FRIENDS_LIST);
    expect(error.code).toBe(ERROR_CODES.EMPTY_FRIENDS_LIST);
    expect(error.message).toBe(ERROR_CODES.EMPTY_FRIENDS_LIST);

    const cause = new Error("socket hang up");
    const custom = ErrorHandler.createError("X", "custom", { cause });
    expect(custom.message).toBe("custom");
    expect(custom.cause).toBe(cause);
  });

  test("every error code has a text of its own in both languages", () => {
    for (const code of Object.values(ERROR_CODES)) {
      setLanguage("en");
      const english = ErrorHandler.userMessage(coded(code, 500));
      setLanguage("ru");
      const russian = ErrorHandler.userMessage(coded(code, 500));

      expect(english).not.toBe("");
      expect(russian).not.toBe("");
      expect(russian).not.toBe(english);
      expect(russian).not.toContain("failed");
    }
  });

  test("Russian users read Steam's refusals in Russian", () => {
    setLanguage("ru");

    expect(ErrorHandler.userMessage(coded(ERROR_CODES.EMPTY_FRIENDS_LIST))).toBe(
      "В твоём списке друзей никого не найдено."
    );
    expect(ErrorHandler.userMessage(coded(ERROR_CODES.TOKEN_REJECTED, 401))).toBe(
      "Steam не принял токен, получи новый."
    );
    expect(ErrorHandler.userMessage(coded(ERROR_CODES.KEY_REJECTED, 403))).toBe(
      "Steam не принял ключ, проверь его."
    );
    expect(ErrorHandler.userMessage(coded(ERROR_CODES.STEAM_ERROR, 404))).toBe(
      "Steam ответил ошибкой 404, попробуй позже."
    );
  });

  test("userMessage keeps a text written for the user and the detail of an unknown error", () => {
    expect(ErrorHandler.userMessage("Already written")).toBe("Already written");
    expect(ErrorHandler.userMessage(new Error("boom"))).toBe(
      "Something went wrong: boom"
    );

    setLanguage("ru");
    expect(ErrorHandler.userMessage(new Error("boom"))).toBe(
      "Что-то пошло не так: boom"
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
    appStateManager.batchUpdate({ savedFriendsIds: ["1"], savedSettings: { steam_id: "1" } });

    expect(appStateManager.getState("usingSavedFriends")).toBe(true);
    expect(appStateManager.getState("savedFriendsIds")).toEqual(["1"]);
    expect(appStateManager.getState("savedSettings")).toEqual({ steam_id: "1" });
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
