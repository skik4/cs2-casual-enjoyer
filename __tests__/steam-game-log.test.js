/**
 * Jest tests for reading Steam's own game log in the main process: the
 * changes of game server Steam logs for CS2, from the app's start on
 */

import fs from "fs";
import os from "os";
import path from "path";

import SteamGameLog, { parseServerChange } from "../src/main/steam-game-log.js";

/** A log line as Steam writes it, local time to the second */
const lineAt = (date, text = "SSGL: Game server change [730]") => {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `[${stamp}] ${text}\n`;
};

const at = (hours, minutes, seconds) =>
  new Date(2026, 10, 5, hours, minutes, seconds);

describe("parseServerChange", () => {
  test("reads the second of a change of game server, in local time", () => {
    expect(parseServerChange(lineAt(at(23, 7, 55)).trim())).toBe(
      at(23, 7, 55).getTime()
    );
  });

  test("ignores Steam's other lines and other games", () => {
    expect(
      parseServerChange(lineAt(at(23, 7, 54), "SSGL: persona state flags"))
    ).toBeNull();
    expect(
      parseServerChange(
        lineAt(at(23, 7, 54), "SSGL: Game server change [440]").trim()
      )
    ).toBeNull();
    expect(parseServerChange("")).toBeNull();
  });
});

describe("SteamGameLog", () => {
  let dir;
  let file;

  const log = (options = {}) =>
    new SteamGameLog({ locate: async () => file, ...options });
  const append = (...lines) => fs.appendFileSync(file, lines.join(""));

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "casual-enjoyer-steam-log-"));
    file = path.join(dir, "gameprocess_log.txt");
    // What Steam logged before the app started
    fs.writeFileSync(file, lineAt(at(22, 0, 0)) + lineAt(at(22, 5, 0)));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("reads only the changes Steam logs after the start", async () => {
    const steamLog = log();
    await steamLog.start();
    append(
      lineAt(at(23, 7, 52), "SSGL: persona state flags"),
      lineAt(at(23, 7, 55))
    );

    await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
      usable: true,
      changes: [at(23, 7, 55).getTime()],
    });
  });

  test("answers from a moment on, counting a change in that same second", async () => {
    const steamLog = log();
    await steamLog.start();
    append(lineAt(at(23, 7, 50)), lineAt(at(23, 7, 55)));

    const result = await steamLog.serverChangesSince(
      at(23, 7, 55).getTime() + 400
    );
    expect(result.changes).toEqual([at(23, 7, 55).getTime()]);
  });

  test("a question before start() has finished waits for it", async () => {
    const steamLog = log();
    const answer = steamLog.serverChangesSince(0);

    await expect(answer).resolves.toEqual({ usable: true, changes: [] });
  });

  test("keeps reading from where the last read stopped", async () => {
    const steamLog = log();
    await steamLog.start();
    append(lineAt(at(23, 7, 55)));
    await steamLog.serverChangesSince(0);
    append(lineAt(at(23, 19, 52)));

    await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
      usable: true,
      changes: [at(23, 7, 55).getTime(), at(23, 19, 52).getTime()],
    });
  });

  test("a line Steam has not finished writing counts once it has", async () => {
    const steamLog = log();
    await steamLog.start();
    const line = lineAt(at(23, 7, 55));
    append(line.slice(0, 20));
    await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
      usable: true,
      changes: [],
    });

    append(line.slice(20));
    await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
      usable: true,
      changes: [at(23, 7, 55).getTime()],
    });
  });

  test("a file Steam starts anew is read from its beginning", async () => {
    const steamLog = log();
    await steamLog.start();
    // Shorter than what was there at the start
    fs.writeFileSync(file, lineAt(at(23, 30, 0)));

    await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
      usable: true,
      changes: [at(23, 30, 0).getTime()],
    });
  });

  test("Steam's line ends may be Windows ones", async () => {
    const steamLog = log();
    await steamLog.start();
    append(lineAt(at(23, 7, 55)).replace("\n", "\r\n"));

    const result = await steamLog.serverChangesSince(0);
    expect(result.changes).toEqual([at(23, 7, 55).getTime()]);
  });

  test("keeps only the newest changes", async () => {
    const steamLog = log({ maxChanges: 2 });
    await steamLog.start();
    append(lineAt(at(23, 0, 1)), lineAt(at(23, 0, 2)), lineAt(at(23, 0, 3)));

    const result = await steamLog.serverChangesSince(0);
    expect(result.changes).toEqual([
      at(23, 0, 2).getTime(),
      at(23, 0, 3).getTime(),
    ]);
  });

  test("without Steam, or without its log, the log is unusable", async () => {
    await expect(
      new SteamGameLog({ locate: async () => null }).serverChangesSince(0)
    ).resolves.toEqual({ usable: false, changes: [] });

    await expect(
      new SteamGameLog({
        locate: async () => path.join(dir, "missing.txt"),
      }).serverChangesSince(0)
    ).resolves.toEqual({ usable: false, changes: [] });
  });

  test("a log that cannot be read any more is unusable", async () => {
    const steamLog = log();
    await steamLog.start();
    fs.rmSync(file);

    await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
      usable: false,
      changes: [],
    });
  });

  test("a moment that is not a number gets no answer", async () => {
    const steamLog = log();
    for (const since of [undefined, null, "0", NaN, Infinity]) {
      await expect(steamLog.serverChangesSince(since)).resolves.toEqual({
        usable: false,
        changes: [],
      });
    }
  });
});
