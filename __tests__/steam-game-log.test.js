/**
 * Jest tests for reading Steam's own game log in the main process: the
 * changes of game server Steam logs for CS2, from the app's start on, and
 * CS2's game process starting and ending
 */

import fs from "fs";
import os from "os";
import path from "path";

import SteamGameLog, {
  parseCs2Process,
  parseServerChange,
} from "../src/main/steam-game-log.js";

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

// CS2's process lines as Steam writes them
const CS2_EXE = String.raw`"E:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe" -steam`;
const START = (pid) =>
  `AppID 730 adding PID ${pid} as a tracked process ${CS2_EXE}`;
const EXIT = (pid) => `AppID 730 no longer tracking PID ${pid}, exit code 0`;
const GONE = "Remove 730 from running list";
const STEAM_START = "Client version: 1769025840";

describe("parseCs2Process", () => {
  test("reads CS2 starting and ending, and Steam itself starting", () => {
    expect(parseCs2Process(lineAt(at(23, 7, 26), START(1234)).trim())).toEqual({
      kind: "start",
      at: at(23, 7, 26).getTime(),
      pid: "1234",
    });
    expect(parseCs2Process(lineAt(at(1, 1, 7), EXIT(1234)).trim())).toEqual({
      kind: "exit",
      at: at(1, 1, 7).getTime(),
      pid: "1234",
    });
    expect(parseCs2Process(lineAt(at(1, 1, 7), GONE).trim())).toEqual({
      kind: "gone",
      at: at(1, 1, 7).getTime(),
    });
    expect(parseCs2Process(lineAt(at(9, 0, 0), STEAM_START).trim())).toEqual({
      kind: "steam-start",
      at: at(9, 0, 0).getTime(),
    });
  });

  test("ignores other games and Steam's other lines", () => {
    for (const text of [
      'AppID 2457220 adding PID 99 as a tracked process "x.exe"',
      "AppID 2457220 no longer tracking PID 99, exit code 0",
      "Remove 2457220 from running list",
      "SSGL: Game server change [730]",
      "SSGL: persona state flags",
    ]) {
      expect(parseCs2Process(lineAt(at(9, 0, 0), text).trim())).toBeNull();
    }
  });
});

describe("SteamGameLog and CS2's process", () => {
  let dir;
  let file;

  const log = (options = {}) =>
    new SteamGameLog({ locate: async () => file, ...options });
  const write = (...lines) => fs.writeFileSync(file, lines.join(""));
  const append = (...lines) => fs.appendFileSync(file, lines.join(""));
  const ms = (hours, minutes, seconds) => at(hours, minutes, seconds).getTime();
  const until = async (check) => {
    for (let i = 0; i < 200 && !check(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "casual-enjoyer-steam-log-"));
    file = path.join(dir, "gameprocess_log.txt");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("a CS2 open when the app starts is read back from what Steam logged", async () => {
    write(
      lineAt(at(20, 0, 0), STEAM_START),
      lineAt(at(20, 1, 0), START(1234)),
      lineAt(at(20, 30, 0))
    );

    await expect(log().cs2State()).resolves.toEqual({
      usable: true,
      seen: true,
      running: true,
      fromAppStart: true,
      startedAt: ms(20, 1, 0),
      exitedAt: 0,
    });
  });

  test("CS2 closing after the app's start leaves none open, and none from before", async () => {
    write(lineAt(at(20, 1, 0), START(1234)));
    const steamLog = log();
    await steamLog.start();
    append(lineAt(at(21, 0, 0), EXIT(1234)), lineAt(at(21, 0, 0), GONE));

    await expect(steamLog.cs2State()).resolves.toEqual({
      usable: true,
      seen: true,
      running: false,
      fromAppStart: false,
      startedAt: 0,
      exitedAt: ms(21, 0, 0),
    });
  });

  test("a CS2 started after the app's start is open, but is not one from before", async () => {
    write(
      lineAt(at(19, 0, 0), START(1111)),
      lineAt(at(19, 50, 0), EXIT(1111)),
      lineAt(at(19, 50, 0), GONE)
    );
    const steamLog = log();
    await steamLog.start();
    append(lineAt(at(21, 0, 0), START(2222)));

    await expect(steamLog.cs2State()).resolves.toEqual({
      usable: true,
      seen: true,
      running: true,
      fromAppStart: false,
      startedAt: ms(21, 0, 0),
      exitedAt: ms(19, 50, 0),
    });
  });

  test("a PID that comes back for a later CS2 is not the one from before", async () => {
    write(lineAt(at(20, 1, 0), START(1234)));
    const steamLog = log();
    await steamLog.start();
    append(lineAt(at(21, 0, 0), EXIT(1234)), lineAt(at(21, 5, 0), START(1234)));

    await expect(steamLog.cs2State()).resolves.toMatchObject({
      running: true,
      fromAppStart: false,
    });
  });

  test("a log that has never shown CS2 says so", async () => {
    write(lineAt(at(20, 0, 0), STEAM_START), lineAt(at(20, 30, 0)));

    await expect(log().cs2State()).resolves.toMatchObject({
      usable: true,
      seen: false,
      running: false,
    });
  });

  test("Steam starting again leaves nothing of what it tracked before", async () => {
    write(lineAt(at(20, 1, 0), START(1234)), lineAt(at(22, 0, 0), STEAM_START));

    await expect(log().cs2State()).resolves.toMatchObject({
      running: false,
      fromAppStart: false,
    });
  });

  test("a start line Steam is still writing at the app's start is read once it is whole", async () => {
    const line = lineAt(at(20, 1, 0), START(1234));
    write(lineAt(at(20, 0, 0), STEAM_START), line.slice(0, 30));
    const steamLog = log();
    await expect(steamLog.cs2State()).resolves.toMatchObject({
      running: false,
    });

    append(line.slice(30));
    await expect(steamLog.cs2State()).resolves.toMatchObject({
      running: true,
      // Written as the app started: counted as one that came after
      fromAppStart: false,
    });
  });

  test("without Steam, or without its log, CS2's process is unknown", async () => {
    const unknown = {
      usable: false,
      seen: false,
      running: false,
      fromAppStart: false,
      startedAt: 0,
      exitedAt: 0,
    };
    await expect(
      new SteamGameLog({ locate: async () => null }).cs2State()
    ).resolves.toEqual(unknown);
    await expect(log().cs2State()).resolves.toEqual(unknown);
  });

  test("watch tells each change of CS2's process once, and nothing else", async () => {
    write(lineAt(at(20, 1, 0), START(1234)));
    const steamLog = log({ lookMs: 5 });
    const told = [];
    await steamLog.watch((state) => told.push(state));

    try {
      // Steam writes other lines: nothing to tell
      append(lineAt(at(21, 0, 0), "SSGL: persona state flags"));
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(told).toEqual([]);

      append(lineAt(at(21, 0, 1), EXIT(1234)), lineAt(at(21, 0, 1), GONE));
      await until(() => told.length > 0);
      expect(told).toEqual([
        {
          usable: true,
          seen: true,
          running: false,
          fromAppStart: false,
          startedAt: 0,
          exitedAt: ms(21, 0, 1),
        },
      ]);

      // The join loop's server changes are still all there
      append(lineAt(at(21, 2, 0)));
      await expect(steamLog.serverChangesSince(0)).resolves.toEqual({
        usable: true,
        changes: [ms(21, 2, 0)],
      });
    } finally {
      steamLog.stop();
    }
  });
});
