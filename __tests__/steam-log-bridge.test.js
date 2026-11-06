/**
 * Jest tests for the way Steam's game log reaches the join loop: the
 * preload's channel, the main process's handler, and the page's side
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
import steamLog from "../src/game/steam-log.js";

require("../src/main/preload.cjs");
const [[, api]] = contextBridge.exposeInMainWorld.mock.calls;

beforeEach(() => ipcRenderer.invoke.mockReset());

afterEach(() => {
  delete global.window.electronAPI;
});

test("the preload asks the main process for the changes from a moment on", async () => {
  const answer = { usable: true, changes: [1000] };
  ipcRenderer.invoke.mockResolvedValue(answer);

  await expect(api.steamLog.serverChangesSince(500)).resolves.toBe(answer);
  expect(ipcRenderer.invoke).toHaveBeenCalledWith(
    "steam-log-server-changes",
    500
  );
});

test("a main process that cannot answer leaves the log unusable", async () => {
  ipcRenderer.invoke.mockRejectedValue(new Error("No handler registered"));
  jest.spyOn(console, "error").mockImplementation(() => {});

  await expect(api.steamLog.serverChangesSince(500)).resolves.toEqual({
    usable: false,
    changes: [],
  });
});

test("the main process answers on the preload's channel and reads the log from its start", () => {
  // main.js starts the app when imported, and Jest cannot run its
  // import.meta, so its side is read from the source
  const main = fs.readFileSync(
    path.join(__dirname, "..", "src", "main", "main.js"),
    "utf-8"
  );

  expect(main).toMatch(
    /ipcMain\.handle\("steam-log-server-changes", \(event, since\) =>\s+steamGameLog\.serverChangesSince\(since\)\s+\)/
  );
  expect(main).toContain("this.steamGameLog.start();");
});

describe("the page's side", () => {
  test("without the bridge, as in tests, there is no log", async () => {
    await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
      usable: false,
      changes: [],
    });
  });

  test("passes the main process's answer on", async () => {
    const answer = { usable: true, changes: [1000, 2000] };
    global.window.electronAPI = {
      steamLog: { serverChangesSince: jest.fn().mockResolvedValue(answer) },
    };

    await expect(steamLog.serverChangesSince(0)).resolves.toBe(answer);
  });

  test("an answer that is not one reads as no log", async () => {
    for (const answer of [
      null,
      { usable: true },
      { usable: false, changes: [1] },
    ]) {
      global.window.electronAPI = {
        steamLog: { serverChangesSince: jest.fn().mockResolvedValue(answer) },
      };
      await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
        usable: false,
        changes: [],
      });
    }
  });
});
