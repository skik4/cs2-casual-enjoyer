/**
 * Jest tests for how the page hears that its window is minimized: the
 * preload's window bridge, and the channels the main process uses for it.
 * With backgroundThrottling off, Electron keeps the page's visibilityState
 * "visible", so this is the page's only way to know.
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
const [[exposedAs, api]] = contextBridge.exposeInMainWorld.mock.calls;

beforeEach(() => {
  ipcRenderer.invoke.mockReset();
  ipcRenderer.on.mockClear();
  ipcRenderer.removeListener.mockClear();
});

test("the page gets the window state next to the window controls", () => {
  expect(exposedAs).toBe("electronAPI");
  expect(Object.keys(api.window)).toEqual([
    "minimize",
    "close",
    "isMinimized",
    "onMinimized",
  ]);
});

test("isMinimized asks the main process", async () => {
  ipcRenderer.invoke.mockResolvedValue(true);

  await expect(api.window.isMinimized()).resolves.toBe(true);
  expect(ipcRenderer.invoke).toHaveBeenCalledWith("window-is-minimized");
});

test("isMinimized says not minimized when the main process cannot answer", async () => {
  ipcRenderer.invoke.mockRejectedValue(new Error("No handler registered"));
  jest.spyOn(console, "error").mockImplementation(() => {});

  await expect(api.window.isMinimized()).resolves.toBe(false);
});

test("onMinimized passes on each minimize and restore, until unsubscribed", () => {
  const callback = jest.fn();
  const unsubscribe = api.window.onMinimized(callback);

  const [[channel, listener]] = ipcRenderer.on.mock.calls;
  expect(channel).toBe("window-minimized");
  listener({}, true);
  listener({}, false);
  expect(callback.mock.calls).toEqual([[true], [false]]);

  unsubscribe();
  expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
    "window-minimized",
    listener
  );
});

test("the main process sends and answers on the preload's channels", () => {
  // main.js starts the app when imported, and Jest cannot run its
  // import.meta, so its side is read from the source
  const main = fs.readFileSync(
    path.join(__dirname, "..", "src", "main", "main.js"),
    "utf-8"
  );

  expect(main).toContain('.on("minimize", () => sendMinimized(true))');
  expect(main).toContain('.on("restore", () => sendMinimized(false))');
  expect(main).toContain('webContents.send("window-minimized", minimized)');
  expect(main).toContain('ipcMain.handle("window-is-minimized"');
});
