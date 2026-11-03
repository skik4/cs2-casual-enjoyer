/**
 * Jest tests for the map finder store (main process)
 */

import fs from "fs";
import os from "os";
import path from "path";

import {
  readMapFinderStore,
  writeMapFinderStore,
} from "../src/main/map-finder-store.js";

const STEAM_ID = "76561198000000011";

describe("map finder store", () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "casual-enjoyer-store-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("round-trips the data and reads a missing file as null", async () => {
    const file = path.join(dir, "map-finder.json");
    await expect(readMapFinderStore(file)).resolves.toBeNull();

    const data = { version: 1, pool: { [STEAM_ID]: { lastSeen: 1 } } };
    await expect(writeMapFinderStore(file, data)).resolves.toBe(true);
    await expect(readMapFinderStore(file)).resolves.toEqual(data);
  });

  test("a write that breaks off halfway leaves the previous store readable", async () => {
    const file = path.join(dir, "map-finder.json");
    const before = { version: 1, pool: { [STEAM_ID]: { lastSeen: 1 } } };
    await writeMapFinderStore(file, before);

    // The app crashes, or the disk fills, with part of the new file written
    const writeFile = jest
      .spyOn(fs.promises, "writeFile")
      .mockImplementationOnce(async (target, text) => {
        fs.writeFileSync(target, String(text).slice(0, 10));
        throw new Error("ENOSPC: no space left on device");
      });
    try {
      await expect(
        writeMapFinderStore(file, { version: 1, pool: {} })
      ).resolves.toBe(false);
    } finally {
      writeFile.mockRestore();
    }

    await expect(readMapFinderStore(file)).resolves.toEqual(before);
  });

  test("refuses anything that is not an object, or too big", async () => {
    const file = path.join(dir, "map-finder.json");

    await expect(writeMapFinderStore(file, "text")).resolves.toBe(false);
    await expect(
      writeMapFinderStore(file, { blob: "x".repeat(6 * 1024 * 1024) })
    ).resolves.toBe(false);
    expect(fs.existsSync(file)).toBe(false);
  });
});
