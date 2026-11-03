/**
 * @jest-environment jsdom
 *
 * Jest tests for the two help notifications: they open at once, with their
 * emoji as an image, and follow a language switch
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import NotificationManager from "../src/ui/notification-manager.js";
import { setLanguage, t } from "../src/i18n/i18n-manager.js";

const notifications = () => document.getElementById("notifications");
const emoji = () => notifications().querySelector(".notification-emoji img.emoji-svg");
const title = () => notifications().querySelector(".notification-main-text").textContent;

beforeEach(() => {
  setLanguage("en");
  document.body.innerHTML = '<div id="notifications"></div>';
});

test("the SteamID help opens in the same call, headed by its emoji", () => {
  NotificationManager.showSteamIdHelp();

  expect(notifications().style.display).toBe("block");
  expect(emoji()?.getAttribute("src")).toBe("assets/emoji-svg/emoji_u1f194.svg");
  expect(emoji()?.getAttribute("alt")).toBe("🆔");
  expect(title()).toContain("How to Get Your SteamID64");
});

test("the token help shows the key and the token link", () => {
  NotificationManager.showApiKeyHelp();

  expect(emoji()?.getAttribute("src")).toBe("assets/emoji-svg/emoji_u1f511.svg");
  expect(notifications().querySelector("#steam-token-help-link")).not.toBeNull();
  expect(title()).toContain(t("help.apiKey.title"));
});

test("a language switch re-renders the help that is open", () => {
  NotificationManager.showApiKeyHelp();
  const before = title();

  setLanguage("ru");

  expect(title()).toContain(t("help.apiKey.title"));
  expect(title()).not.toBe(before);
  expect(emoji()?.getAttribute("src")).toBe("assets/emoji-svg/emoji_u1f511.svg");
});

test("the close button hides the help", () => {
  NotificationManager.showSteamIdHelp();

  notifications().querySelector(".notification-close-btn").onclick();

  expect(notifications().style.display).toBe("none");
});
