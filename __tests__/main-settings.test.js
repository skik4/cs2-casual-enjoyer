/**
 * Jest tests for the main-process settings store and the external link filter
 */

import fs from "fs";
import os from "os";
import path from "path";

import SettingsStore from "../src/main/settings-store.js";
import { isAllowedExternalUrl } from "../src/main/external-links.js";

describe("SettingsStore", () => {
  let dir;
  let file;
  let logger;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "casual-enjoyer-settings-"));
    file = path.join(dir, "settings.json");
    logger = { info: jest.fn(), error: jest.fn() };
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const readFile = () => JSON.parse(fs.readFileSync(file, "utf-8"));

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
    expect(readFile()).toEqual(result);
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

    expect(readFile()).toEqual({
      language: "ru",
      fake_friend_ids: ["7"],
      steam_id: "1",
      auth: "token",
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
