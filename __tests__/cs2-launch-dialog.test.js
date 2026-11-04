/**
 * @jest-environment jsdom
 *
 * Jest tests for the overlay that offers to launch CS2 before a join: what
 * its promise answers, and when the overlay stays up
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import Cs2LaunchDialog from "../src/ui/cs2-launch-dialog.js";
import { setLanguage, t } from "../src/i18n/i18n-manager.js";

const overlay = () => document.getElementById("cs2-launch-notification");
const visible = () =>
  overlay().style.display === "flex" && !overlay().classList.contains("hidden");
const title = () => overlay().querySelector(".cs2-launch-title").textContent;
const launchButton = () => document.getElementById("launch-cs2-btn");
const closeButton = () => document.getElementById("close-cs2-launch");

/** Let the promise chains behind a click run */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Track whether a promise has settled, without awaiting it
 * @param {Promise} promise - Promise to observe
 * @returns {{settled: boolean, value: any}} - Live settle state
 */
function observe(promise) {
  const state = { settled: false, value: undefined };
  promise.then((value) => {
    state.settled = true;
    state.value = value;
  });
  return state;
}

let cs2Manager;
let finishLaunch;
let onProgress;

beforeEach(() => {
  setLanguage("en");
  document.body.innerHTML =
    '<div id="cs2-launch-notification" class="cs2-launch-overlay hidden"></div>';
  // Stands in for CS2Manager: the test ends each launch itself
  cs2Manager = {
    launchAndWaitForLobby: jest.fn((progress) => {
      onProgress = progress;
      return new Promise((resolve) => (finishLaunch = resolve));
    }),
    cancelLaunchOperations: jest.fn(),
  };
});

const ask = () => observe(Cs2LaunchDialog.ask(cs2Manager));

test("shows the overlay with its first texts and waits", () => {
  const answer = ask();

  expect(visible()).toBe(true);
  expect(title()).toBe("Launch CS2 First");
  expect(launchButton().textContent).toBe("Launch CS2");
  expect(answer.settled).toBe(false);
  expect(cs2Manager.launchAndWaitForLobby).not.toHaveBeenCalled();
});

test("Launch starts CS2 once and answers true when the lobby is reached", async () => {
  const answer = ask();

  launchButton().click();
  launchButton().click();
  expect(cs2Manager.launchAndWaitForLobby).toHaveBeenCalledTimes(1);
  expect(title()).toBe("Launching CS2...");
  expect(launchButton().disabled).toBe(true);
  expect(answer.settled).toBe(false);

  finishLaunch(true);
  await settle();

  expect(answer.value).toBe(true);
  expect(visible()).toBe(false);
});

test("Close answers false and cancels a launch under way", async () => {
  const answer = ask();
  launchButton().click();

  closeButton().click();
  await settle();

  expect(answer.value).toBe(false);
  expect(cs2Manager.cancelLaunchOperations).toHaveBeenCalledTimes(1);
  expect(visible()).toBe(false);

  // The launch the cancel ended cannot answer after it
  finishLaunch(true);
  await settle();
  expect(answer.value).toBe(false);
});

test("a launch that times out keeps the overlay up for another try", async () => {
  const answer = ask();
  launchButton().click();

  onProgress("timeout");
  finishLaunch(false);
  await settle();

  expect(answer.settled).toBe(false);
  expect(visible()).toBe(true);
  expect(title()).toBe("CS2 Did Not Start");
  expect(launchButton().textContent).toBe("Try Again");
  expect(launchButton().disabled).toBe(false);

  launchButton().click();
  expect(cs2Manager.launchAndWaitForLobby).toHaveBeenCalledTimes(2);

  finishLaunch(true);
  await settle();
  expect(answer.value).toBe(true);
  expect(visible()).toBe(false);
});

test("a launch that throws answers false", async () => {
  cs2Manager.launchAndWaitForLobby.mockRejectedValue(new Error("Steam is not running"));
  const answer = ask();

  launchButton().click();
  await settle();

  expect(answer.value).toBe(false);
  expect(visible()).toBe(false);
});

test("answers false when the page has no overlay", async () => {
  document.body.innerHTML = "";

  await expect(Cs2LaunchDialog.ask(cs2Manager)).resolves.toBe(false);
});

test("a language switch re-renders the phase it shows", async () => {
  ask();
  launchButton().click();

  setLanguage("ru");
  await settle();

  expect(title()).toBe(t("notifications.cs2Launch.launching.title"));
  expect(title()).not.toBe("Launching CS2...");
});
