/**
 * @jest-environment jsdom
 *
 * Jest tests for the update notice in the footer: quiet until a newer
 * version downloads, then a link that restarts into it
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import UpdateNotice from "../src/ui/update-notice.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const notice = () => document.getElementById("update-notice");
let statusListener;
let api;

beforeAll(async () => {
  setLanguage("en");
  document.body.innerHTML = `<button id="update-notice" class="hidden" disabled></button>`;
  api = {
    getStatus: jest.fn().mockResolvedValue({ state: "idle" }),
    onStatus: jest.fn((listener) => {
      statusListener = listener;
      return () => {};
    }),
    install: jest.fn().mockResolvedValue(true),
  };
  window.electronAPI = { updates: api };
  await UpdateNotice.initialize();
});

beforeEach(() => api.install.mockClear());

test("says nothing while there is no new version", () => {
  expect(api.onStatus).toHaveBeenCalled();
  expect(notice().classList.contains("hidden")).toBe(true);

  statusListener({ state: "checking" });
  expect(notice().classList.contains("hidden")).toBe(true);
});

test("shows a new version downloading, and cannot be clicked yet", () => {
  statusListener({ state: "downloading", version: "0.9.0", percent: 42 });

  expect(notice().classList.contains("hidden")).toBe(false);
  expect(notice().textContent).toBe("Downloading update 0.9.0… 42%");
  expect(notice().disabled).toBe(true);

  notice().click();
  expect(api.install).not.toHaveBeenCalled();
});

test("once ready, a click restarts into the new version", () => {
  statusListener({ state: "ready", version: "0.9.0" });

  expect(notice().textContent).toBe("Update 0.9.0 is ready — restart");
  expect(notice().title).toBe("The app closes, updates and opens again");
  expect(notice().classList.contains("ready")).toBe(true);
  expect(notice().disabled).toBe(false);

  notice().click();
  expect(api.install).toHaveBeenCalledTimes(1);
});

test("a language switch keeps the notice", () => {
  statusListener({ state: "ready", version: "0.9.0" });
  setLanguage("ru");

  expect(notice().textContent).toBe("Обновление 0.9.0 готово — перезапустить");
  setLanguage("en");
});
