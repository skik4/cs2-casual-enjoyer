/**
 * Jest tests for the browser permissions the main process grants the page
 */

import { isPermissionAllowed } from "../src/main/permissions.js";

describe("isPermissionAllowed", () => {
  test("lets the page copy to the clipboard", () => {
    expect(isPermissionAllowed("clipboard-sanitized-write")).toBe(true);
  });

  test.each([
    "media",
    "geolocation",
    "notifications",
    "fullscreen",
    "pointerLock",
    "clipboard-read",
    "display-capture",
    "fileSystem",
    "unknown",
  ])("denies %s", (permission) => {
    expect(isPermissionAllowed(permission)).toBe(false);
    expect(isPermissionAllowed(permission, { externalURL: "steam://run/730/" })).toBe(false);
  });

  test("lets Chromium open only the links the app may open itself", () => {
    expect(
      isPermissionAllowed("openExternal", { externalURL: "steam://run/730/" })
    ).toBe(true);
    expect(
      isPermissionAllowed("openExternal", {
        externalURL: "https://github.com/skik4",
      })
    ).toBe(true);
    expect(
      isPermissionAllowed("openExternal", {
        externalURL: "file:///C:/Windows/System32/calc.exe",
      })
    ).toBe(false);
    expect(
      isPermissionAllowed("openExternal", { externalURL: "steam://install/730" })
    ).toBe(false);
    expect(isPermissionAllowed("openExternal")).toBe(false);
  });
});
