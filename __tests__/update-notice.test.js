/**
 * @jest-environment jsdom
 *
 * Jest tests for the update in the footer: quiet until a newer version is
 * out, then the offer with Install, the question that asks before anything
 * downloads, the download's bar with the megabytes in, and the restart
 */

import fs from "fs";
import path from "path";

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// The footer as the page has it: the notice and the version
const MARKUP = (() => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "index.html"),
    "utf-8"
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelector(".custom-footer-bar").outerHTML;
})();

const MB = 1024 * 1024;

let UpdateNotice;
let i18n;

/** A fresh notice module, as a page load has it */
function load() {
  jest.isolateModules(() => {
    UpdateNotice = require("../src/ui/update-notice.js").default;
    i18n = require("../src/i18n/i18n-manager.js");
  });
  i18n.setLanguage("en");
}

/**
 * The updater as the preload passes it on
 * @param {Object} [status] - Its status at the start
 */
function bridge(status = { state: "idle" }) {
  let listener = null;
  const updates = {
    getStatus: jest.fn().mockResolvedValue(status),
    onStatus: jest.fn((callback) => {
      listener = callback;
      return () => {};
    }),
    check: jest.fn().mockResolvedValue("latest"),
    download: jest.fn().mockResolvedValue(true),
    install: jest.fn().mockResolvedValue(true),
  };
  window.electronAPI = { updates };
  return { updates, emit: (next) => listener(next) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const byId = (id) => document.getElementById(id);
const text = (id) => byId(id).textContent;
const shown = (id) => !byId(id).classList.contains("hidden");
const phase = () => byId("update-notice").dataset.phase;
const fill = () =>
  byId("update-notice-bar").querySelector(".update-notice-fill");
const action = () => byId("update-notice-action");
const cancel = () => byId("update-notice-cancel");
/** A click as a mouse makes it: detail counts the clicks of a double click */
const clickWith = (element, detail) =>
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, detail })
  );

/** A started notice with a version on offer */
async function offered() {
  const api = bridge();
  await UpdateNotice.initialize();
  api.emit({ state: "available", version: "0.9.5" });
  return api;
}

beforeEach(() => {
  document.body.innerHTML = MARKUP;
  load();
});

afterEach(() => {
  jest.useRealTimers();
  delete window.electronAPI;
});

test("says nothing while there is no new version", async () => {
  const { emit } = bridge();
  await UpdateNotice.initialize();
  expect(shown("update-notice")).toBe(false);

  emit({ state: "checking" });
  expect(shown("update-notice")).toBe(false);
});

test("offers a new version with an Install link", async () => {
  await offered();

  expect(shown("update-notice")).toBe(true);
  expect(phase()).toBe("available");
  expect(text("update-notice-text")).toBe("Update 0.9.5 available");
  expect(shown("update-notice-action")).toBe(true);
  expect(text("update-notice-action")).toBe("Install");
  expect(action().title).toBe("Downloads the update and restarts the app");
  expect(shown("update-notice-cancel")).toBe(false);
  expect(shown("update-notice-bar")).toBe(false);
});

test("Install asks first, in the footer, and downloads nothing yet", async () => {
  const { updates } = await offered();

  action().click();

  expect(phase()).toBe("confirm");
  expect(text("update-notice-text")).toBe(
    "Install update 0.9.5? The app restarts"
  );
  expect(text("update-notice-action")).toBe("Yes");
  expect(text("update-notice-cancel")).toBe("No");
  // Enter right after lands on No
  expect(document.activeElement).toBe(cancel());
  await flush();
  expect(updates.download).not.toHaveBeenCalled();
});

test("No, or Escape, goes back to the offer", async () => {
  await offered();

  action().click();
  cancel().click();
  expect(phase()).toBe("available");
  expect(document.activeElement).toBe(action());

  action().click();
  byId("update-notice").dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })
  );
  expect(phase()).toBe("available");
});

test("the second click of a double click on Install is no Yes", async () => {
  const { updates } = await offered();

  clickWith(action(), 1);
  clickWith(action(), 2);
  await flush();

  expect(phase()).toBe("confirm");
  expect(updates.download).not.toHaveBeenCalled();
});

test("Yes downloads the version, the bar showing the megabytes in", async () => {
  const { updates, emit } = await offered();
  action().click();

  action().click();
  expect(phase()).toBe("downloading");
  expect(text("update-notice-text")).toBe("Downloading update 0.9.5");
  expect(shown("update-notice-bar")).toBe(true);
  expect(fill().style.width).toBe("0%");
  expect(shown("update-notice-action")).toBe(false);
  expect(shown("update-notice-cancel")).toBe(false);
  await flush();
  expect(updates.download).toHaveBeenCalledTimes(1);

  emit({ state: "downloading", version: "0.9.5", percent: 10 });
  expect(text("update-notice-size")).toBe("10%");

  emit({
    state: "downloading",
    version: "0.9.5",
    percent: 41,
    transferred: 48.4 * MB,
    total: 116.2 * MB,
  });
  expect(text("update-notice-size")).toBe("48 of 116 MB");
  expect(fill().style.width).toBe("41%");
});

test("once the version is in, the app restarts into it at once", async () => {
  const { updates, emit } = await offered();
  action().click();
  action().click();
  emit({ state: "downloading", version: "0.9.5", percent: 99 });

  emit({ state: "ready", version: "0.9.5" });

  expect(phase()).toBe("installing");
  expect(text("update-notice-text")).toBe(
    "Installing update 0.9.5 and restarting…"
  );
  expect(fill().style.width).toBe("100%");
  expect(shown("update-notice-size")).toBe(false);
  expect(shown("update-notice-action")).toBe(false);
  await flush();
  expect(updates.install).toHaveBeenCalledTimes(1);

  // The same news again asks nothing more
  emit({ state: "ready", version: "0.9.5" });
  await flush();
  expect(updates.install).toHaveBeenCalledTimes(1);
});

test("a download that broke off offers Retry, which downloads again without asking", async () => {
  const { updates, emit } = await offered();
  action().click();
  action().click();
  emit({ state: "downloading", version: "0.9.5", percent: 30 });

  emit({ state: "available", version: "0.9.5", failed: true });
  expect(phase()).toBe("failed");
  expect(text("update-notice-text")).toBe("Update 0.9.5 did not download");
  expect(text("update-notice-action")).toBe("Retry");
  expect(shown("update-notice-bar")).toBe(false);

  action().click();
  expect(phase()).toBe("downloading");
  await flush();
  expect(updates.download).toHaveBeenCalledTimes(2);
});

test("a download that could not start puts the offer back", async () => {
  const { updates } = await offered();
  updates.download.mockResolvedValue(false);

  action().click();
  action().click();
  await flush();

  expect(phase()).toBe("available");
});

test("an install the main process turns down offers Install again, and asks again", async () => {
  const { updates, emit } = await offered();
  updates.install.mockResolvedValue(false);
  action().click();
  action().click();

  emit({ state: "ready", version: "0.9.5" });
  await flush();
  expect(phase()).toBe("ready");
  expect(text("update-notice-text")).toBe("Update 0.9.5 downloaded");
  expect(text("update-notice-action")).toBe("Install");

  updates.install.mockResolvedValue(true);
  action().click();
  expect(phase()).toBe("confirm");
  action().click();
  await flush();
  expect(updates.install).toHaveBeenCalledTimes(2);
});

test("an offer that goes away takes its question along", async () => {
  const { emit } = await offered();
  action().click();

  emit({ state: "idle" });
  expect(shown("update-notice")).toBe(false);

  emit({ state: "available", version: "0.9.6" });
  expect(phase()).toBe("available");
});

test("a version found before the notice was there is offered at the start", async () => {
  bridge({ state: "available", version: "0.9.5" });
  await UpdateNotice.initialize();

  expect(phase()).toBe("available");
});

test("a language switch keeps the notice, in the other language", async () => {
  const { emit } = await offered();
  i18n.setLanguage("ru");
  expect(text("update-notice-text")).toBe("Доступно обновление 0.9.5");
  expect(text("update-notice-action")).toBe("Установить");

  action().click();
  expect(text("update-notice-text")).toBe(
    "Установить обновление 0.9.5? Приложение перезапустится"
  );
  expect(text("update-notice-action")).toBe("Да");
  expect(text("update-notice-cancel")).toBe("Нет");

  action().click();
  emit({
    state: "downloading",
    version: "0.9.5",
    percent: 41,
    transferred: 48 * MB,
    total: 116 * MB,
  });
  expect(text("update-notice-text")).toBe("Скачивается обновление 0.9.5");
  expect(text("update-notice-size")).toBe("48 из 116 МБ");
});

/** Let the few promise steps of a check run, under fake timers too */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
const version = () => byId("app-version");

test("a click on the version checks at once, and says for a moment when nothing is newer", async () => {
  jest.useFakeTimers();
  const { updates } = bridge();
  let answer;
  updates.check.mockImplementation(
    () => new Promise((resolve) => (answer = resolve))
  );
  await UpdateNotice.initialize();
  expect(version().disabled).toBe(false);
  expect(version().title).toBe("Check for updates");

  version().click();
  expect(updates.check).toHaveBeenCalledTimes(1);
  expect(phase()).toBe("checking");
  expect(text("update-notice-text")).toBe("Checking for updates…");
  expect(shown("update-notice-action")).toBe(false);
  // A second click while it runs asks nothing more
  version().click();
  expect(updates.check).toHaveBeenCalledTimes(1);

  answer("latest");
  await settle();
  expect(phase()).toBe("latest");
  expect(text("update-notice-text")).toBe("No updates available");

  jest.advanceTimersByTime(5000);
  expect(shown("update-notice")).toBe(false);
});

test("a check GitHub did not answer says so, and another click tries again", async () => {
  jest.useFakeTimers();
  const { updates } = bridge();
  updates.check.mockResolvedValue("failed");
  await UpdateNotice.initialize();

  version().click();
  await settle();
  expect(phase()).toBe("checkFailed");
  expect(text("update-notice-text")).toBe("Couldn't check for updates");

  version().click();
  expect(updates.check).toHaveBeenCalledTimes(2);
  expect(phase()).toBe("checking");
});

test("a check that finds a version offers it", async () => {
  const { updates, emit } = bridge();
  updates.check.mockImplementation(async () => {
    emit({ state: "checking" });
    emit({ state: "available", version: "0.9.6" });
    return "available";
  });
  await UpdateNotice.initialize();

  version().click();
  await flush();

  expect(phase()).toBe("available");
  expect(text("update-notice-text")).toBe("Update 0.9.6 available");
  expect(text("update-notice-action")).toBe("Install");
});

test("a development run, with no updates, shows the version as a label only", async () => {
  const { updates } = bridge({ state: "off" });
  await UpdateNotice.initialize();

  expect(version().disabled).toBe(true);
  expect(version().title).toBe("");
  version().click();
  expect(updates.check).not.toHaveBeenCalled();
});

test("the version's title follows the language", async () => {
  bridge();
  await UpdateNotice.initialize();
  i18n.setLanguage("ru");

  expect(version().title).toBe("Проверить обновления");
});
