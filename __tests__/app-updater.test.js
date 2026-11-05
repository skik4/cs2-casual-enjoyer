/**
 * Jest tests for the app updater: when it checks GitHub, what it reports to
 * the window, and that it restarts into a new version only when asked
 */

import { EventEmitter } from "events";
import AppUpdater, { UPDATE_CHECK_INTERVAL_MS } from "../src/main/app-updater.js";

/** electron-updater's autoUpdater, as far as AppUpdater uses it */
function fakeUpdater() {
  const updater = new EventEmitter();
  updater.checkForUpdates = jest.fn().mockResolvedValue(null);
  updater.quitAndInstall = jest.fn();
  return updater;
}

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

let appUpdater;

beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  appUpdater?.stop();
  jest.useRealTimers();
});

test("a development run neither checks nor installs", async () => {
  const updater = fakeUpdater();
  const send = jest.fn();
  appUpdater = new AppUpdater({ updater, isPackaged: false, send, logger: logger() });

  appUpdater.start();
  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2);
  await Promise.resolve();

  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  expect(appUpdater.getStatus()).toEqual({ state: "off" });
  expect(appUpdater.install()).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

test("an installed build checks at start and then on its interval", async () => {
  const updater = fakeUpdater();
  appUpdater = new AppUpdater({ updater, isPackaged: true, send: jest.fn(), logger: logger() });

  appUpdater.start();
  await Promise.resolve();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updater.autoDownload).toBe(true);
  expect(updater.autoInstallOnAppQuit).toBe(true);

  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
  await Promise.resolve();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
});

test("a new version is reported while it downloads, then as ready", () => {
  const updater = fakeUpdater();
  const send = jest.fn();
  appUpdater = new AppUpdater({ updater, isPackaged: true, send, logger: logger() });
  appUpdater.start();

  updater.emit("update-available", { version: "0.9.0" });
  updater.emit("download-progress", { percent: 42.7 });
  updater.emit("update-downloaded", { version: "0.9.0" });

  expect(send.mock.calls.map(([status]) => status)).toEqual([
    { state: "downloading", version: "0.9.0", percent: 0 },
    { state: "downloading", version: "0.9.0", percent: 42 },
    { state: "ready", version: "0.9.0" },
  ]);
  expect(appUpdater.getStatus()).toEqual({ state: "ready", version: "0.9.0" });
});

test("it restarts into the new version only when asked, and only once it is ready", () => {
  const updater = fakeUpdater();
  appUpdater = new AppUpdater({ updater, isPackaged: true, send: jest.fn(), logger: logger() });
  appUpdater.start();

  expect(appUpdater.install()).toBe(false);
  updater.emit("update-downloaded", { version: "0.9.0" });
  expect(updater.quitAndInstall).not.toHaveBeenCalled();

  expect(appUpdater.install()).toBe(true);
  expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
});

test("no new check runs while a version downloads or waits to be installed", async () => {
  const updater = fakeUpdater();
  appUpdater = new AppUpdater({ updater, isPackaged: true, send: jest.fn(), logger: logger() });
  appUpdater.start();
  await Promise.resolve();

  updater.emit("update-downloaded", { version: "0.9.0" });
  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3);
  await Promise.resolve();

  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

test("a failed check is logged, changes nothing for the user, and the next check runs", async () => {
  const updater = fakeUpdater();
  const log = logger();
  const send = jest.fn();
  appUpdater = new AppUpdater({ updater, isPackaged: true, send, logger: log });
  appUpdater.start();

  updater.emit("checking-for-update");
  updater.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));

  expect(log.warn).toHaveBeenCalledWith("Update check failed", {
    error: "net::ERR_INTERNET_DISCONNECTED",
  });
  expect(appUpdater.getStatus()).toEqual({ state: "idle" });

  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
  await Promise.resolve();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
});

test("a check that throws is logged rather than left unhandled", async () => {
  const updater = fakeUpdater();
  updater.checkForUpdates.mockRejectedValue(new Error("no release"));
  const log = logger();
  appUpdater = new AppUpdater({ updater, isPackaged: true, send: jest.fn(), logger: log });

  appUpdater.start();
  // The rejection travels through a few promise steps before the catch
  for (let i = 0; i < 5; i++) await Promise.resolve();

  expect(log.warn).toHaveBeenCalledWith("Update check failed", { error: "no release" });
});
