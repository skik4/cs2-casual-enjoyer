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
import { FRIEND_LISTS_MAX_IDS } from "../src/game/map-finder.js";
import { MAP_FINDER_CONFIG } from "../src/shared/constants.js";

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

  test("a store with every list at its limit still fits, the friend check's lists included", async () => {
    // Over the limit nothing would be saved any more, the pool included
    const file = path.join(dir, "map-finder.json");
    const id = (i) => String(76561198000000000n + BigInt(i));
    const ids = (count, from) => Array.from({ length: count }, (_, i) => id(from + i));
    const now = Date.now();
    const poolIds = ids(MAP_FINDER_CONFIG.POOL_MAX, 0);
    // Lists of two hundred friends each
    const listSize = 200;
    const data = {
      version: 1,
      pool: Object.fromEntries(poolIds.map((steamid) => [steamid, { lastSeen: now, map: "de_ancient" }])),
      poolFriends: {
        ids: ids(MAP_FINDER_CONFIG.POOL_FRIENDS_MAX_IDS, 100000),
        crawled: Object.fromEntries(poolIds.map((steamid) => [steamid, now])),
      },
      fof: { ids: ids(MAP_FINDER_CONFIG.FOF_MAX_IDS, 200000), fetchedAt: now, friendsCount: 300 },
      prime: Object.fromEntries(
        ids(MAP_FINDER_CONFIG.PRIME_MAX_IDS, 300000).map((steamid) => [steamid, now])
      ),
      friendLists: Object.fromEntries(
        Array.from({ length: FRIEND_LISTS_MAX_IDS / listSize }, (_, i) => [
          id(400000 + i),
          { at: now, ids: ids(listSize, 500000 + i * listSize) },
        ])
      ),
    };

    await expect(writeMapFinderStore(file, data)).resolves.toBe(true);
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
