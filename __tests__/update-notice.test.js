/**
 * @jest-environment jsdom
 *
 * Jest tests for the update notice in the footer: quiet until a newer
 * version is out, then an offer to download it, the download, and an
 * offer to install it
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
    download: jest.fn().mockResolvedValue(true),
    install: jest.fn().mockResolvedValue(true),
  };
  window.electronAPI = { updates: api };
  await UpdateNotice.initialize();
});

beforeEach(() => {
  api.download.mockClear();
  api.install.mockClear();
});

test("says nothing while there is no new version", () => {
  expect(api.onStatus).toHaveBeenCalled();
  expect(notice().classList.contains("hidden")).toBe(true);

  statusListener({ state: "checking" });
  expect(notice().classList.contains("hidden")).toBe(true);
});

test("offers a new version, and a click downloads it", () => {
  statusListener({ state: "available", version: "0.9.3" });

  expect(notice().classList.contains("hidden")).toBe(false);
  expect(notice().textContent).toBe("Update 0.9.3 available — download");
  expect(notice().title).toBe(
    "Downloads in the background, then offers to install"
  );
  expect(notice().disabled).toBe(false);
  expect(notice().classList.contains("ready")).toBe(false);

  notice().click();
  expect(api.download).toHaveBeenCalledTimes(1);
  expect(api.install).not.toHaveBeenCalled();
});

test("shows the download, and cannot be clicked meanwhile", () => {
  statusListener({ state: "downloading", version: "0.9.3", percent: 42 });

  expect(notice().textContent).toBe("Downloading update 0.9.3… 42%");
  expect(notice().title).toBe("");
  expect(notice().disabled).toBe(true);

  notice().click();
  expect(api.download).not.toHaveBeenCalled();
  expect(api.install).not.toHaveBeenCalled();
});

test("once downloaded, a click installs it", () => {
  statusListener({ state: "ready", version: "0.9.3" });

  expect(notice().textContent).toBe("Update 0.9.3 downloaded — install");
  expect(notice().title).toBe("The app closes, updates and opens again");
  expect(notice().classList.contains("ready")).toBe(true);
  expect(notice().disabled).toBe(false);

  notice().click();
  expect(api.install).toHaveBeenCalledTimes(1);
  expect(api.download).not.toHaveBeenCalled();
});

test("after a download broke off, a click tries again", () => {
  statusListener({ state: "available", version: "0.9.3", failed: true });

  expect(notice().textContent).toBe("Update 0.9.3 did not download — retry");
  expect(notice().classList.contains("ready")).toBe(false);
  expect(notice().disabled).toBe(false);

  notice().click();
  expect(api.download).toHaveBeenCalledTimes(1);
});

test("a language switch keeps the notice", () => {
  statusListener({ state: "available", version: "0.9.3" });
  setLanguage("ru");
  expect(notice().textContent).toBe("Доступно обновление 0.9.3 — загрузить");

  statusListener({ state: "ready", version: "0.9.3" });
  expect(notice().textContent).toBe("Обновление 0.9.3 загружено — установить");
  setLanguage("en");
});
