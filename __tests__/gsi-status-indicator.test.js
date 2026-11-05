/**
 * @jest-environment jsdom
 *
 * Jest tests for the GSI status in the footer. "Waiting for CS2" is a button
 * that offers to launch CS2 through the overlay and the launch a join uses
 * when CS2 is closed; every other state stays plain text. CS2 also posts
 * nothing while it starts up, so the button asks Steam first and, with the
 * user in CS2, says so instead of offering a launch.
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
// The launch wait asks Steam between CS2's own posts: no network here
jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { isPlayerInCS2: jest.fn() },
}));

import GsiStatusIndicator from "../src/ui/gsi-status-indicator.js";
import Cs2LaunchDialog from "../src/ui/cs2-launch-dialog.js";
import cs2Manager from "../src/game/cs2-manager.js";
import gsiManager from "../src/game/gsi-manager.js";
import { LAUNCH_CS2_URL } from "../src/game/steam-protocol.js";
import SteamAPI from "../src/steam/steam-api.js";
import { GSI_SETUP } from "../src/shared/constants.js";
import { setLanguage, t } from "../src/i18n/i18n-manager.js";

const USER_ID = "76561198000000002";
const OTHER_ID = "76561198000000003";

const element = (id) => document.getElementById(id);
const badge = () => element("gsi-status");
const overlayUp = () => Cs2LaunchDialog.isOpen();
const overlayTitle = () =>
  element("cs2-launch-notification").querySelector(".cs2-launch-title")
    ?.textContent;

/**
 * Press a key on the badge as a keyboard does, down then up
 * @param {string} key - KeyboardEvent.key, e.g. "Enter" or " "
 * @returns {KeyboardEvent} - The keydown, to see what became of it
 */
function press(key) {
  const init = { key, bubbles: true, cancelable: true };
  const keydown = new window.KeyboardEvent("keydown", init);
  badge().dispatchEvent(keydown);
  badge().dispatchEvent(new window.KeyboardEvent("keyup", init));
  return keydown;
}

const menuPayload = (steamid = USER_ID) => ({
  provider: { name: "Counter-Strike 2", appid: 730, steamid },
  player: { steamid, activity: "menu" },
});

beforeAll(() => {
  setLanguage("en");
  document.body.innerHTML = `
    <div id="cs2-launch-notification" class="cs2-launch-overlay hidden"></div>
    <div class="custom-footer-bar">
      <span id="gsi-status" class="gsi-status" data-state="waiting">
        <span class="gsi-status-dot"></span>
        <span id="gsi-status-label" class="gsi-status-label">GSI</span>
      </span>
    </div>`;
  cs2Manager.configure({
    getCredentials: () => ({ steamId: USER_ID, auth: "test_api_key" }),
  });
  // As the app wires it
  GsiStatusIndicator.initialize({
    onLaunch: () => Cs2LaunchDialog.ask(cs2Manager, { mode: "launch" }),
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  SteamAPI.isPlayerInCS2.mockReset();
  SteamAPI.isPlayerInCS2.mockResolvedValue(false);
  window.electronAPI = { shell: { openExternal: jest.fn() } };
  gsiManager.reset();
  gsiManager.getExpectedSteamId = () => USER_ID;
  // Set up, and nothing heard from CS2 yet
  gsiManager.setupStatus = { setup: GSI_SETUP.READY, changed: false };
  GsiStatusIndicator.render();
});

afterEach(() => {
  // Singletons all: no overlay, launch wait or GSI timer may reach the next test
  if (Cs2LaunchDialog.isOpen()) element("close-cs2-launch").click();
  cs2Manager.cancelLaunchOperations();
  gsiManager.reset();
  jest.restoreAllMocks();
  jest.useRealTimers();
  delete window.electronAPI;
});

describe("Waiting for CS2", () => {
  test("is a button whose tooltip says it launches CS2", () => {
    expect(badge().dataset.state).toBe("waiting");
    expect(element("gsi-status-label").textContent).toBe("Waiting for CS2");
    expect(badge().getAttribute("role")).toBe("button");
    expect(badge().tabIndex).toBe(0);
    expect(badge().title).toBe(`${t("gsi.waiting")}\n${t("gsi.launchHint")}`);
  });

  test("a click opens the offer to launch CS2, and nothing launches yet", async () => {
    badge().click();
    await jest.advanceTimersByTimeAsync(0);

    expect(overlayUp()).toBe(true);
    expect(overlayTitle()).toBe(t("notifications.cs2Launch.launchOnly.title"));
    expect(window.electronAPI.shell.openExternal).not.toHaveBeenCalled();
    expect(cs2Manager.isMonitoring).toBe(false);
  });

  test.each([
    ["Enter", "Enter"],
    ["Space", " "],
  ])("%s opens the offer from the keyboard", async (name, key) => {
    badge().focus();
    const keydown = press(key);
    await jest.advanceTimersByTimeAsync(0);

    expect(overlayUp()).toBe(true);
    // Kept from the page: no scroll, and no press of the Launch button the
    // keyboard moves to
    expect(keydown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(element("launch-cs2-btn"));
    expect(window.electronAPI.shell.openExternal).not.toHaveBeenCalled();
  });

  test("while Steam shows CS2 running, it says so and offers no launch", async () => {
    SteamAPI.isPlayerInCS2.mockResolvedValue(true);
    badge().focus();
    press("Enter");
    await jest.advanceTimersByTimeAsync(0);

    // Steam was asked whether CS2 runs, not whether it is in its menu
    expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledTimes(1);
    expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledWith(USER_ID, "test_api_key", false);
    expect(overlayUp()).toBe(true);
    expect(overlayTitle()).toBe(t("notifications.cs2Launch.running.title"));
    expect(element("launch-cs2-btn").classList.contains("hidden")).toBe(true);
    expect(document.activeElement).toBe(element("close-cs2-launch"));

    element("close-cs2-launch").click();
    await jest.advanceTimersByTimeAsync(0);

    expect(overlayUp()).toBe(false);
    expect(window.electronAPI.shell.openExternal).not.toHaveBeenCalled();
    expect(cs2Manager.isMonitoring).toBe(false);
    // Still waiting for CS2 to report, and still a button
    expect(badge().dataset.state).toBe("waiting");
    expect(document.activeElement).toBe(badge());
  });

  test("when Steam cannot be asked, the launch is offered as before", async () => {
    SteamAPI.isPlayerInCS2.mockResolvedValue(null);
    badge().click();
    await jest.advanceTimersByTimeAsync(0);

    expect(overlayTitle()).toBe(t("notifications.cs2Launch.launchOnly.title"));
    expect(element("launch-cs2-btn").classList.contains("hidden")).toBe(false);
  });

  test("reads as busy while Steam answers, and a second press sends no second request", async () => {
    let answerSteam;
    SteamAPI.isPlayerInCS2.mockReturnValue(
      new Promise((resolve) => (answerSteam = resolve))
    );
    badge().focus();
    press("Enter");
    press("Enter");
    await jest.advanceTimersByTimeAsync(0);

    expect(badge().getAttribute("aria-busy")).toBe("true");
    expect(overlayUp()).toBe(false);
    expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledTimes(1);

    answerSteam(false);
    await jest.advanceTimersByTimeAsync(0);

    expect(badge().hasAttribute("aria-busy")).toBe(false);
    expect(overlayUp()).toBe(true);
  });

  test("CS2 reporting while Steam answers opens nothing", async () => {
    let answerSteam;
    SteamAPI.isPlayerInCS2.mockReturnValue(
      new Promise((resolve) => (answerSteam = resolve))
    );
    badge().click();

    gsiManager.handlePayload(menuPayload());
    answerSteam(true);
    await jest.advanceTimersByTimeAsync(0);

    expect(overlayUp()).toBe(false);
    expect(badge().dataset.state).toBe("active");
  });

  test("Launch launches CS2 as a join does, and the offer goes once CS2 is in its menu", async () => {
    const launch = jest.spyOn(cs2Manager, "launchAndWaitForLobby");
    badge().click();
    await jest.advanceTimersByTimeAsync(0);

    element("launch-cs2-btn").click();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.shell.openExternal).toHaveBeenCalledWith(
      LAUNCH_CS2_URL
    );
    expect(overlayTitle()).toBe(t("notifications.cs2Launch.launching.title"));
    expect(overlayUp()).toBe(true);

    gsiManager.handlePayload(menuPayload());
    await jest.advanceTimersByTimeAsync(0);

    expect(overlayUp()).toBe(false);
    expect(cs2Manager.isMonitoring).toBe(false);
    // CS2 is heard from now: nothing left to launch
    expect(badge().dataset.state).toBe("active");
    expect(badge().hasAttribute("role")).toBe(false);
  });

  test("Close takes the offer down and changes nothing", async () => {
    const launch = jest.spyOn(cs2Manager, "launchAndWaitForLobby");
    const cancel = jest.spyOn(cs2Manager, "cancelLaunchOperations");
    badge().focus();
    press("Enter");
    await jest.advanceTimersByTimeAsync(0);

    element("close-cs2-launch").click();
    await jest.advanceTimersByTimeAsync(0);

    expect(overlayUp()).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    expect(window.electronAPI.shell.openExternal).not.toHaveBeenCalled();
    // The one question before the offer, whether CS2 runs, and no more
    expect(SteamAPI.isPlayerInCS2).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    // Still waiting and still offering, with the keyboard back on it
    expect(badge().dataset.state).toBe("waiting");
    expect(badge().getAttribute("role")).toBe("button");
    expect(document.activeElement).toBe(badge());
  });

  test("opens no second overlay over the join's own offer", async () => {
    // A join found CS2 closed and asks first
    const join = Cs2LaunchDialog.ask(cs2Manager);
    const joinLaunch = element("launch-cs2-btn");

    // The overlay hides the badge from the pointer, not from the keyboard
    badge().focus();
    press("Enter");
    await jest.advanceTimersByTimeAsync(0);

    expect(element("launch-cs2-btn")).toBe(joinLaunch);
    expect(overlayTitle()).toBe(t("notifications.cs2Launch.initial.title"));

    // The join's offer still launches and answers the join
    joinLaunch.click();
    gsiManager.handlePayload(menuPayload());
    await jest.advanceTimersByTimeAsync(0);
    await expect(join).resolves.toBe(true);
    expect(overlayUp()).toBe(false);
  });

  test("a click after CS2 has moved the state on offers nothing", () => {
    // Not rendered yet: the badge still reads as a button
    gsiManager.setupStatus = { setup: GSI_SETUP.CS2_NOT_FOUND };

    badge().click();

    expect(overlayUp()).toBe(false);
  });
});

test.each([
  ["active", "gsi.active", () => gsiManager.handlePayload(menuPayload())],
  [
    "other-account",
    "gsi.otherAccount",
    () => gsiManager.handlePayload(menuPayload(OTHER_ID)),
  ],
  [
    "restart",
    "gsi.restart",
    () => (gsiManager.setupStatus = { setup: GSI_SETUP.READY, changed: true }),
  ],
  [
    "unavailable",
    "gsi.unavailable",
    () => (gsiManager.setupStatus = { setup: GSI_SETUP.CS2_NOT_FOUND }),
  ],
  [
    "error",
    "gsi.error",
    () => (gsiManager.setupStatus = { setup: GSI_SETUP.ERROR }),
  ],
])("%s stays plain text: no click or key offers a launch", (state, titleKey, enter) => {
  enter();
  GsiStatusIndicator.render();

  expect(badge().dataset.state).toBe(state);
  expect(badge().title).toBe(t(titleKey));
  expect(badge().hasAttribute("role")).toBe(false);
  expect(badge().hasAttribute("tabindex")).toBe(false);

  badge().click();
  const enterDown = press("Enter");
  press(" ");

  expect(enterDown.defaultPrevented).toBe(false);
  expect(overlayUp()).toBe(false);
  expect(window.electronAPI.shell.openExternal).not.toHaveBeenCalled();
});
