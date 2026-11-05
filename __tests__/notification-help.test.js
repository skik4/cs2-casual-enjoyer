/**
 * @jest-environment jsdom
 *
 * Jest tests for the two help notifications: they open at once, headed by
 * their title in words with no picture, link out the way the app's other
 * links do, and follow a language switch
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import NotificationManager from "../src/ui/notification-manager.js";
import {
  NOTIFICATION_TEMPLATES,
  HELP_TEMPLATES,
} from "../src/ui/notification-templates.js";
import { setLanguage, t } from "../src/i18n/i18n-manager.js";

const notifications = () => document.getElementById("notifications");
const card = () => notifications().querySelector(".notification-content");
const title = () =>
  notifications().querySelector(".notification-main-text").textContent;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

beforeEach(() => {
  setLanguage("en");
  document.body.innerHTML = '<div id="notifications"></div>';
});

test("the SteamID help opens in the same call, headed by its title alone", () => {
  NotificationManager.showSteamIdHelp();

  expect(notifications().style.display).toBe("block");
  expect(title().trim()).toBe("How to Get Your SteamID64");
  expect(card().querySelector("img")).toBeNull();
  expect(card().textContent).not.toMatch(PICTOGRAPH);
});

test("the token help shows the token link, styled as the app's links", () => {
  NotificationManager.showApiKeyHelp();

  const tokenLink = notifications().querySelector("#steam-token-help-link");
  expect(tokenLink).not.toBeNull();
  expect(tokenLink.classList.contains("link-btn")).toBe(true);
  expect(title().trim()).toBe(t("help.apiKey.title"));
  expect(card().querySelector("img")).toBeNull();
  expect(card().textContent).not.toMatch(PICTOGRAPH);
});

test("every link in the help texts carries the app's one link look", () => {
  for (const show of ["showApiKeyHelp", "showSteamIdHelp"]) {
    NotificationManager[show]();

    const links = [...card().querySelectorAll("a")];
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) =>
      expect(link.classList.contains("link-btn")).toBe(true)
    );
  }
});

test("no notification sets its own look inline: notifications.css alone does", () => {
  const templates = [
    NOTIFICATION_TEMPLATES.CLOSE_BUTTON(),
    NOTIFICATION_TEMPLATES.ERROR_MESSAGE("x"),
    NOTIFICATION_TEMPLATES.PRIVACY_WARNING(
      NOTIFICATION_TEMPLATES.PRIVACY_LINK("steam://openurl/x")
    ),
    HELP_TEMPLATES.STEAM_ID_HELP(),
    HELP_TEMPLATES.API_KEY_HELP(),
  ];

  templates.forEach((html) => expect(html).not.toContain("style="));
});

test("a language switch re-renders the help that is open", () => {
  NotificationManager.showApiKeyHelp();
  const before = title();

  setLanguage("ru");

  expect(title().trim()).toBe(t("help.apiKey.title"));
  expect(title()).not.toBe(before);
  expect(card().querySelector("img")).toBeNull();
  expect(
    notifications().querySelector("#steam-token-help-link")
  ).not.toBeNull();
});

test("the close button is the app's square button and hides the help", () => {
  NotificationManager.showSteamIdHelp();
  const close = notifications().querySelector(".notification-close-btn");

  expect(close.tagName).toBe("BUTTON");
  expect(close.classList.contains("icon-btn")).toBe(true);

  close.onclick();

  expect(notifications().style.display).toBe("none");
});
