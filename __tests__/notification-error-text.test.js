/**
 * @jest-environment jsdom
 *
 * Jest tests for the error notification: it tells an error by its code in
 * the user's language, and again in the new one after a language switch
 */

import NotificationManager from "../src/ui/notification-manager.js";
import ErrorHandler from "../src/utils/error-handler.js";
import { ERROR_CODES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const shownText = () =>
  document
    .querySelector("#notifications .notification-main-text")
    ?.textContent.trim();

beforeEach(() => {
  document.body.innerHTML =
    '<div id="notifications"></div><input id="steam-id" />';
  setLanguage("ru");
});

afterEach(() => setLanguage("en"));

test("a turned-down token reads in Russian, not as Steam's technical answer", () => {
  const error = ErrorHandler.createError(
    ERROR_CODES.TOKEN_REJECTED,
    "GetFriendsList failed: 401 Unauthorized"
  );

  NotificationManager.showError(error);

  expect(shownText()).toBe("Steam не принял токен, получи новый.");
});

test("a language switch tells the shown error again", () => {
  NotificationManager.showError(
    ErrorHandler.createError(
      ERROR_CODES.NETWORK_ERROR,
      "HTTP request failed: Failed to fetch"
    )
  );
  expect(shownText()).toBe(
    "Не удалось связаться со Steam. Проверь интернет и попробуй ещё раз."
  );

  setLanguage("en");

  expect(shownText()).toBe(
    "Couldn't reach Steam. Check your internet connection and try again."
  );
});

test("a text written for the user is shown as it is", () => {
  NotificationManager.showError("Введи свой SteamID64 и API Key");

  expect(shownText()).toBe("Введи свой SteamID64 и API Key");
});

test("a private friends list still shows the privacy warning", () => {
  NotificationManager.showError(
    ErrorHandler.createError(ERROR_CODES.PRIVATE_FRIENDS_LIST),
    "76561198000000001"
  );

  expect(document.querySelector("#notifications .privacy-link")).not.toBeNull();
});
