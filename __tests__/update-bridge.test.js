/**
 * Jest tests for the preload's update bridge: the page's side of the
 * download and install clicks, and the channels the main process answers
 * them on
 */

import fs from "fs";
import path from "path";

// Jest runs under plain Node, where Electron is not there: the preload's
// side of IPC is recorded instead
jest.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: jest.fn() },
  ipcRenderer: {
    send: jest.fn(),
    invoke: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  },
}));

import { contextBridge, ipcRenderer } from "electron";

require("../src/main/preload.cjs");
const [[, api]] = contextBridge.exposeInMainWorld.mock.calls;

beforeEach(() => ipcRenderer.invoke.mockReset());

test("the page reads the status, hears its changes, downloads and installs", () => {
  expect(Object.keys(api.updates)).toEqual([
    "getStatus",
    "onStatus",
    "download",
    "install",
  ]);
});

test("download and install ask the main process", async () => {
  ipcRenderer.invoke.mockResolvedValue(true);

  await expect(api.updates.download()).resolves.toBe(true);
  expect(ipcRenderer.invoke).toHaveBeenCalledWith("update-download");
  await expect(api.updates.install()).resolves.toBe(true);
  expect(ipcRenderer.invoke).toHaveBeenCalledWith("update-install");
});

test("a download the main process cannot start counts as not started", async () => {
  ipcRenderer.invoke.mockRejectedValue(new Error("No handler registered"));
  jest.spyOn(console, "error").mockImplementation(() => {});

  await expect(api.updates.download()).resolves.toBe(false);
});

test("the main process answers on the preload's channels", () => {
  // main.js starts the app when imported, and Jest cannot run its
  // import.meta, so its side is read from the source
  const main = fs.readFileSync(
    path.join(__dirname, "..", "src", "main", "main.js"),
    "utf-8"
  );

  expect(main).toContain(
    'ipcMain.handle("update-get-status", () => appUpdater.getStatus())'
  );
  expect(main).toContain(
    'ipcMain.handle("update-download", () => appUpdater.download())'
  );
  expect(main).toContain(
    'ipcMain.handle("update-install", () => appUpdater.install())'
  );
  expect(main).toContain('webContents.send("update-status", status)');
});
