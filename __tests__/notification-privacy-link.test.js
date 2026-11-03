/**
 * @jest-environment jsdom
 *
 * Jest tests for the privacy warning's link to the user's Steam settings
 */

import NotificationManager from "../src/ui/notification-manager.js";

const STEAM_ID = "76561198000000001";

describe("NotificationManager.showUpdateError", () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="notifications"></div><input id="steam-id" />';
  });

  test("links to the privacy settings of a SteamID64", () => {
    NotificationManager.showUpdateError(STEAM_ID);

    const link = document.querySelector("#notifications .privacy-link");
    expect(link?.getAttribute("href")).toBe(
      `steam://openurl/https://steamcommunity.com/profiles/${STEAM_ID}/edit/settings/`
    );
  });

  test("reads the id from the input when none is given", () => {
    document.getElementById("steam-id").value = ` ${STEAM_ID} `;

    NotificationManager.showUpdateError();

    const link = document.querySelector("#notifications .privacy-link");
    expect(link?.getAttribute("href")).toContain(`/profiles/${STEAM_ID}/`);
  });

  test("makes no link out of anything but a SteamID64", () => {
    NotificationManager.showUpdateError('"><img src=x onerror="alert(1)">');

    const notifications = document.getElementById("notifications");
    expect(notifications.querySelector(".privacy-link")).toBeNull();
    expect(notifications.querySelector("img[src='x']")).toBeNull();
    expect(notifications.innerHTML).not.toContain("onerror=");
  });
});
