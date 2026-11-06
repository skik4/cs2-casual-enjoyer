/**
 * Jest tests for the app updater: when it checks GitHub, what it reports to
 * the window, and that it downloads a new version and restarts into it only
 * when asked
 */

import { EventEmitter } from "events";
import AppUpdater, {
  UPDATE_CHECK_INTERVAL_MS,
} from "../src/main/app-updater.js";

/** electron-updater's autoUpdater, as far as AppUpdater uses it */
function fakeUpdater() {
  const updater = new EventEmitter();
  updater.checkForUpdates = jest.fn().mockResolvedValue(null);
  updater.downloadUpdate = jest.fn().mockResolvedValue([]);
  updater.quitAndInstall = jest.fn();
  return updater;
}

const logger = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() });

/** Let the few promise steps of a check or a download run */
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

let appUpdater;

/** An installed build's updater, started */
function startInstalled() {
  const updater = fakeUpdater();
  const send = jest.fn();
  const log = logger();
  appUpdater = new AppUpdater({ updater, isPackaged: true, send, logger: log });
  appUpdater.start();
  return { updater, send, log };
}

beforeEach(() => jest.useFakeTimers());

afterEach(() => {
  appUpdater?.stop();
  jest.useRealTimers();
});

test("a development run neither checks, downloads nor installs", async () => {
  const updater = fakeUpdater();
  const send = jest.fn();
  appUpdater = new AppUpdater({
    updater,
    isPackaged: false,
    send,
    logger: logger(),
  });

  appUpdater.start();
  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 2);
  await settle();

  expect(updater.checkForUpdates).not.toHaveBeenCalled();
  expect(appUpdater.getStatus()).toEqual({ state: "off" });
  expect(appUpdater.download()).toBe(false);
  expect(appUpdater.install()).toBe(false);
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test("an installed build checks at start and then on its interval, and downloads nothing by itself", async () => {
  const { updater } = startInstalled();
  await settle();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updater.autoDownload).toBe(false);
  expect(updater.autoInstallOnAppQuit).toBe(true);

  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
  await settle();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
});

test("a new version is offered and waits for the user's click", async () => {
  const { updater, send } = startInstalled();
  await settle();

  updater.emit("checking-for-update");
  updater.emit("update-available", { version: "0.9.3" });
  expect(send).toHaveBeenLastCalledWith({
    state: "available",
    version: "0.9.3",
  });

  // Hours later the offer stands as it was, with no new check
  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3);
  await settle();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  expect(updater.downloadUpdate).not.toHaveBeenCalled();
  expect(appUpdater.getStatus()).toEqual({
    state: "available",
    version: "0.9.3",
  });
});

test("a click downloads the offered version, reported until it is ready", async () => {
  const { updater, send } = startInstalled();
  updater.emit("update-available", { version: "0.9.3" });

  expect(appUpdater.download()).toBe(true);
  // A second click while it downloads starts nothing more
  expect(appUpdater.download()).toBe(false);
  await settle();
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);

  updater.emit("download-progress", { percent: 42.7 });
  updater.emit("update-downloaded", { version: "0.9.3" });

  expect(send.mock.calls.map(([status]) => status)).toEqual([
    { state: "available", version: "0.9.3" },
    { state: "downloading", version: "0.9.3", percent: 0 },
    { state: "downloading", version: "0.9.3", percent: 42 },
    { state: "ready", version: "0.9.3" },
  ]);
});

test("the download's progress carries its sizes once the updater knows them", () => {
  const { updater, send } = startInstalled();
  updater.emit("update-available", { version: "0.9.5" });
  appUpdater.download();

  updater.emit("download-progress", {
    percent: 41.6,
    transferred: 50000000,
    total: 121000000,
  });
  expect(send).toHaveBeenLastCalledWith({
    state: "downloading",
    version: "0.9.5",
    percent: 41,
    transferred: 50000000,
    total: 121000000,
  });

  // Without a total there is nothing to measure against
  updater.emit("download-progress", { percent: 42, transferred: 5, total: 0 });
  expect(send).toHaveBeenLastCalledWith({
    state: "downloading",
    version: "0.9.5",
    percent: 42,
  });
});

test("a download that breaks off offers the version again, and a click retries it", async () => {
  const { updater, log } = startInstalled();
  const error = new Error("net::ERR_CONNECTION_RESET");
  // As electron-updater does it: an error event, then the rejected download
  updater.downloadUpdate.mockImplementationOnce(() => {
    updater.emit("error", error);
    return Promise.reject(error);
  });
  updater.emit("update-available", { version: "0.9.3" });

  appUpdater.download();
  await settle();

  expect(appUpdater.getStatus()).toEqual({
    state: "available",
    version: "0.9.3",
    failed: true,
  });
  expect(log.warn).toHaveBeenCalledTimes(1);
  expect(log.warn).toHaveBeenCalledWith("Update download failed", {
    version: "0.9.3",
    error: "net::ERR_CONNECTION_RESET",
  });

  expect(appUpdater.download()).toBe(true);
  await settle();
  expect(updater.downloadUpdate).toHaveBeenCalledTimes(2);
  expect(appUpdater.getStatus()).toEqual({
    state: "downloading",
    version: "0.9.3",
    percent: 0,
  });
});

test("a download rejected without an error event is offered again too", async () => {
  const { updater } = startInstalled();
  updater.downloadUpdate.mockRejectedValueOnce(new Error("cancelled"));
  updater.emit("update-available", { version: "0.9.3" });

  appUpdater.download();
  await settle();

  expect(appUpdater.getStatus()).toEqual({
    state: "available",
    version: "0.9.3",
    failed: true,
  });
});

test("it restarts into the new version only when asked, and only once it is downloaded", () => {
  const { updater } = startInstalled();

  expect(appUpdater.install()).toBe(false);
  updater.emit("update-available", { version: "0.9.3" });
  expect(appUpdater.install()).toBe(false);
  appUpdater.download();
  expect(appUpdater.install()).toBe(false);
  updater.emit("update-downloaded", { version: "0.9.3" });
  expect(updater.quitAndInstall).not.toHaveBeenCalled();

  expect(appUpdater.install()).toBe(true);
  expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
});

test("no new check runs while a version downloads or waits to be installed", async () => {
  const { updater } = startInstalled();
  await settle();

  updater.emit("update-available", { version: "0.9.3" });
  appUpdater.download();
  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
  await settle();
  updater.emit("update-downloaded", { version: "0.9.3" });
  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3);
  await settle();

  expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
});

test("a failed check is logged, changes nothing for the user, and the next check runs", async () => {
  const { updater, log } = startInstalled();

  updater.emit("checking-for-update");
  updater.emit("error", new Error("net::ERR_INTERNET_DISCONNECTED"));

  expect(log.warn).toHaveBeenCalledWith("Update check failed", {
    error: "net::ERR_INTERNET_DISCONNECTED",
  });
  expect(appUpdater.getStatus()).toEqual({ state: "idle" });

  jest.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
  await settle();
  expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
});

test("an error after the download leaves the install on offer", () => {
  const { updater } = startInstalled();
  updater.emit("update-available", { version: "0.9.3" });
  appUpdater.download();
  updater.emit("update-downloaded", { version: "0.9.3" });

  updater.emit("error", new Error("can't quit and install"));

  expect(appUpdater.getStatus()).toEqual({ state: "ready", version: "0.9.3" });
});

test("a check that throws is logged rather than left unhandled", async () => {
  const updater = fakeUpdater();
  updater.checkForUpdates.mockRejectedValue(new Error("no release"));
  const log = logger();
  appUpdater = new AppUpdater({
    updater,
    isPackaged: true,
    send: jest.fn(),
    logger: log,
  });

  appUpdater.start();
  // The rejection travels through a few promise steps before the catch
  await settle();

  expect(log.warn).toHaveBeenCalledWith("Update check failed", {
    error: "no release",
  });
});
