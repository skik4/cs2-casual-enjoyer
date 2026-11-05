/**
 * Jest tests for the main-process settings store and the external link filter
 */

import fs from "fs";
import os from "os";
import path from "path";

// Jest runs under plain Node, where Electron is not there. This safeStorage
// "encrypts" by putting a marker in front of the text: enough to tell a
// stored value from the plain one, and to make one that cannot be decrypted
jest.mock("electron", () => {
  const MARK = "safe:";
  return {
    safeStorage: {
      isAsyncEncryptionAvailable: jest.fn(async () => true),
      encryptStringAsync: jest.fn(async (text) => Buffer.from(`${MARK}${text}`)),
      decryptStringAsync: jest.fn(async (buffer) => {
        const text = buffer.toString();
        if (!text.startsWith(MARK)) throw new Error("Decryption failed");
        return { result: text.slice(MARK.length), shouldReEncrypt: false };
      }),
    },
  };
});

import { safeStorage } from "electron";
import SettingsStore from "../src/main/settings-store.js";
import { isAllowedExternalUrl } from "../src/main/external-links.js";

describe("SettingsStore", () => {
  let dir;
  let file;
  let logger;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "casual-enjoyer-settings-"));
    file = path.join(dir, "settings.json");
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    jest.clearAllMocks();
    safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const readFile = () => JSON.parse(fs.readFileSync(file, "utf-8"));
  const readText = () => fs.readFileSync(file, "utf-8");
  /** The encrypted shape, holding the given text */
  const encrypted = (text) => ({
    encrypted: Buffer.from(`safe:${text}`).toString("base64"),
  });
  /** Everything the logger was given, as one string */
  const logged = () =>
    JSON.stringify([logger.info, logger.warn, logger.error].map((fn) => fn.mock.calls));

  test("reads nothing when there is no file yet, without an error", async () => {
    const store = new SettingsStore(file, logger);

    await expect(store.read()).resolves.toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("merges a patch into what is stored", async () => {
    fs.writeFileSync(file, JSON.stringify({ steam_id: "1", language: "ru" }));
    const store = new SettingsStore(file, logger);

    const result = await store.update({ auth: "token", language: "en" });

    expect(result).toEqual({ steam_id: "1", language: "en", auth: "token" });
    await expect(store.read()).resolves.toEqual(result);
  });

  test("a null field removes it", async () => {
    fs.writeFileSync(file, JSON.stringify({ steam_id: "1", fof_api_key: "K" }));
    const store = new SettingsStore(file, logger);

    await store.update({ fof_api_key: null });

    expect(readFile()).toEqual({ steam_id: "1" });
  });

  test("patches sent at the same time all land", async () => {
    const store = new SettingsStore(file, logger);

    await Promise.all([
      store.update({ language: "ru" }),
      store.update({ fake_friend_ids: ["7"] }),
      store.update({ steam_id: "1", auth: "token" }),
    ]);

    await expect(store.read()).resolves.toEqual({
      language: "ru",
      fake_friend_ids: ["7"],
      steam_id: "1",
      auth: "token",
    });
    expect(readFile()).toEqual({
      language: "ru",
      fake_friend_ids: ["7"],
      steam_id: "1",
      auth: encrypted("token"),
    });
  });

  test("a failed write reports null and does not block later patches", async () => {
    const store = new SettingsStore(path.join(dir, "missing", "settings.json"), logger);

    await expect(store.update({ language: "ru" })).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();

    store.filePath = file;
    await expect(store.update({ language: "en" })).resolves.toEqual({
      language: "en",
    });
  });

  test("a broken file reads as no settings and is reported", async () => {
    fs.writeFileSync(file, "{not json");
    const store = new SettingsStore(file, logger);

    await expect(store.read()).resolves.toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  describe("credentials", () => {
    test("come back as they went in, and are not on disk in the clear", async () => {
      const store = new SettingsStore(file, logger);

      const result = await store.update({
        steam_id: "1",
        auth: "eyJ.token",
        fof_api_key: "0123456789ABCDEF0123456789ABCDEF",
      });

      expect(result).toEqual({
        steam_id: "1",
        auth: "eyJ.token",
        fof_api_key: "0123456789ABCDEF0123456789ABCDEF",
      });
      await expect(store.read()).resolves.toEqual(result);
      expect(readFile()).toEqual({
        steam_id: "1",
        auth: encrypted("eyJ.token"),
        fof_api_key: encrypted("0123456789ABCDEF0123456789ABCDEF"),
      });
      expect(readText()).not.toContain("eyJ.token");
      expect(readText()).not.toContain("0123456789ABCDEF");
      expect(logged()).not.toContain("eyJ.token");
      expect(logged()).not.toContain("0123456789ABCDEF");
    });

    test("a plain value from before keeps working and is encrypted by the next write", async () => {
      fs.writeFileSync(file, JSON.stringify({ steam_id: "1", auth: "old-token" }));
      const store = new SettingsStore(file, logger);

      await expect(store.read()).resolves.toEqual({ steam_id: "1", auth: "old-token" });
      expect(readFile().auth).toBe("old-token");

      await store.update({ language: "en" });

      expect(readFile()).toEqual({
        steam_id: "1",
        auth: encrypted("old-token"),
        language: "en",
      });
      await expect(store.read()).resolves.toEqual({
        steam_id: "1",
        auth: "old-token",
        language: "en",
      });
    });

    test("stay plain when encryption is not available, which is said once", async () => {
      safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
      const store = new SettingsStore(file, logger);

      await store.update({ steam_id: "1", auth: "token" });
      await store.update({ fof_api_key: "K" });

      expect(readFile()).toEqual({ steam_id: "1", auth: "token", fof_api_key: "K" });
      await expect(store.read()).resolves.toEqual({
        steam_id: "1",
        auth: "token",
        fof_api_key: "K",
      });
      expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    });

    test("one that cannot be decrypted reads as absent, is reported and never crashes", async () => {
      fs.writeFileSync(
        file,
        JSON.stringify({
          steam_id: "1",
          auth: { encrypted: Buffer.from("written on another PC").toString("base64") },
          fof_api_key: encrypted("K"),
        })
      );
      const store = new SettingsStore(file, logger);

      await expect(store.read()).resolves.toEqual({ steam_id: "1", fof_api_key: "K" });
      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error.mock.calls[0][0]).toContain("auth");
      expect(logged()).not.toContain("written on another PC");

      // The next write drops it, and a new token takes its place
      await expect(store.update({ auth: "new-token" })).resolves.toEqual({
        steam_id: "1",
        fof_api_key: "K",
        auth: "new-token",
      });
      expect(readFile().auth).toEqual(encrypted("new-token"));
    });

    test("are the only fields touched", async () => {
      const store = new SettingsStore(file, logger);
      const plain = {
        steam_id: "1",
        language: "ru",
        friends_ids: ["2", "3"],
        fake_friend_ids: ["7"],
        tutorial_done: true,
      };

      await store.update(plain);

      expect(readFile()).toEqual(plain);
      await expect(store.read()).resolves.toEqual(plain);
      expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
      expect(safeStorage.decryptStringAsync).not.toHaveBeenCalled();
    });
  });
});

describe("isAllowedExternalUrl", () => {
  test.each([
    ["https://github.com/skik4", true],
    ["steam://rungame/730/76561198000000001/+gcconnectG1A2B3C4D", true],
    ["steam://openurl/https://steamcommunity.com/id/skik4", true],
    ["http://example.com", false],
    ["file:///C:/Windows/System32/calc.exe", false],
    ["ms-settings:privacy", false],
    ["javascript:alert(1)", false],
    ["\\\\server\\share\\run.exe", false],
    ["not a url", false],
  ])("%s -> %s", (url, expected) => {
    expect(isAllowedExternalUrl(url)).toBe(expected);
  });
});

describe("isAllowedExternalUrl: steam:// commands", () => {
  const STEAM_ID = "76561198000000001";

  test.each([
    // What the app itself sends the Steam client
    ["steam://run/730/", true],
    ["steam://run/730", true],
    ["STEAM://Run/730/", true],
    [`steam://rungame/730/${STEAM_ID}/+gcconnectG1A2B3C4D`, true],
    [`steam://rungame/730/${STEAM_ID}/+gcconnect0A1B:2C_3D-4E`, true],
    [
      "steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig",
      true,
    ],
    ["steam://openurl/https://steamcommunity.com/dev/apikey", true],
    [
      `steam://openurl/https://steamcommunity.com/profiles/${STEAM_ID}/edit/settings/`,
      true,
    ],
    ["steam://url/SteamIDMyProfile", true],
    // Launch options for CS2, or any other game
    ["steam://run/730//-insecure +connect 203.0.113.1:27015", false],
    ["steam://run/730/?-console", false],
    ["steam://run/440/", false],
    [`steam://rungame/730/${STEAM_ID}/+gcconnectG1A2B3C4D -console`, false],
    [`steam://rungame/730/${STEAM_ID}/+gcconnectG1A2B3C4D/+map de_dust2`, false],
    [`steam://rungame/730/${STEAM_ID}/+connect 203.0.113.1:27015`, false],
    ["steam://rungame/730/not-a-steamid/+gcconnectG1A2B3C4D", false],
    [`steam://rungame/440/${STEAM_ID}/+gcconnectG1A2B3C4D`, false],
    // Other pages in the client's signed-in browser
    ["steam://openurl/https://evil.example/login", false],
    ["steam://openurl/https://steamcommunity.com.evil.example/", false],
    ["steam://openurl/http://steamcommunity.com/", false],
    ["steam://openurl/javascript:alert(1)", false],
    ["steam://openurl/", false],
    // Everything else the client's protocol can do
    ["steam://install/730", false],
    ["steam://uninstall/730", false],
    ["steam://settings/account", false],
    ["steam://exit", false],
    ["steam://url/SteamIDMyProfile?x=1", false],
    ["steam:run/730/", false],
  ])("%s -> %s", (url, expected) => {
    expect(isAllowedExternalUrl(url)).toBe(expected);
  });
});
