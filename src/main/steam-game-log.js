import { promises as fs } from "fs";
import path from "path";

import { findSteamPath } from "./cs2-locator.js";

/**
 * Steam's own log of the games it runs, logs/gameprocess_log.txt in the
 * Steam folder. Steam writes it without any launch option, and two kinds of
 * its lines matter here.
 *
 * A line each time CS2 changes game server, joining or leaving one:
 * "[2026-11-05 23:07:55] SSGL: Game server change [730]". In the joins of
 * 2026-11-05 it logged one 0-3 s after every connect CS2 accepted and none
 * after the five it turned away, each time before the target's join token
 * changed for the user's arrival. The join loop asks it whether a new token
 * is the user's own arrival.
 *
 * CS2's game process coming and going: "AppID 730 adding PID 1234 as a
 * tracked process ..." when it starts, then "AppID 730 no longer tracking
 * PID 1234, exit code 0" and "Remove 730 from running list" when it ends.
 * All 146 starts in the user's log of 2026-02 to 2026-11 have their end.
 * This is the app's one answer to whether CS2 is open: Steam writes it the
 * moment the process starts or ends, with no token and no network, while
 * its Web API shows the same 1-1.5 s later and only to a working token.
 */
const STAMP = String.raw`^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\] `;
const SERVER_CHANGE_LINE = new RegExp(
  STAMP + String.raw`SSGL: Game server change \[730\]`
);
const CS2_START_LINE = new RegExp(
  STAMP + String.raw`AppID 730 adding PID (\d+) as a tracked process`
);
const CS2_EXIT_LINE = new RegExp(
  STAMP + String.raw`AppID 730 no longer tracking PID (\d+)`
);
const CS2_GONE_LINE = new RegExp(STAMP + "Remove 730 from running list");
// Steam itself starting: nothing it tracked before runs under it
const STEAM_START_LINE = new RegExp(STAMP + "Client version: ");

// Steam's lines carry whole seconds
const SECOND_MS = 1000;

// How much of what Steam logged before the app started is read back, for
// the CS2 processes running at that moment. A CS2 session adds a few dozen
// lines; the user's log held 662 KB for nine months.
const TAIL_BYTES = 1024 * 1024;

// How often the file is looked at for CS2 starting or ending. Windows
// reports nothing while Steam keeps its logs open (four minutes of Steam
// writing gave no event, 2026-11-07), so its size is checked instead; a
// look is one stat of a local file, and Steam's lines carry whole seconds.
const LOOK_MS = SECOND_MS;

/**
 * The second a log line was written
 * @param {RegExpExecArray} match - A match of one of the line patterns
 * @returns {number} - Epoch ms, local time as Steam writes it
 */
function stampOf(match) {
  const [year, month, day, hours, minutes, seconds] = match
    .slice(1, 7)
    .map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
}

/**
 * When a log line says CS2 changed game server
 * @param {string} line - One line of the log
 * @returns {number|null} - Epoch ms of the line's second, local time as
 *   Steam writes it; null for any other line
 */
export function parseServerChange(line) {
  const match = SERVER_CHANGE_LINE.exec(line);
  return match ? stampOf(match) : null;
}

/**
 * What a log line says about CS2's game process
 * @param {string} line - One line of the log
 * @returns {{kind: "start"|"exit"|"gone"|"steam-start", at: number, pid?: string}|null}
 *   - A CS2 process started or ended, CS2 has no process left, or Steam
 *   itself started; null for any other line
 */
export function parseCs2Process(line) {
  let match = CS2_START_LINE.exec(line);
  if (match) return { kind: "start", at: stampOf(match), pid: match[7] };
  match = CS2_EXIT_LINE.exec(line);
  if (match) return { kind: "exit", at: stampOf(match), pid: match[7] };
  match = CS2_GONE_LINE.exec(line);
  if (match) return { kind: "gone", at: stampOf(match) };
  match = STEAM_START_LINE.exec(line);
  if (match) return { kind: "steam-start", at: stampOf(match) };
  return null;
}

/**
 * Where Steam keeps the log
 * @returns {Promise<string|null>} - The file, or null without Steam
 */
async function locateLog() {
  const steamPath = await findSteamPath();
  return steamPath ? path.join(steamPath, "logs", "gameprocess_log.txt") : null;
}

/**
 * What is known of CS2's process with no log to read
 * @returns {import('../shared/types.js').Cs2ProcessState}
 */
const noCs2State = () => ({
  usable: false,
  seen: false,
  running: false,
  fromAppStart: false,
  startedAt: 0,
  exitedAt: 0,
});

/**
 * Reads the server changes Steam logs from the app's start on, and follows
 * CS2's game process. The file is read when asked and on each look that
 * finds it grown (see LOOK_MS), from where the last read stopped.
 */
export default class SteamGameLog {
  /**
   * @param {Object} [options]
   * @param {() => Promise<string|null>} [options.locate] - Finds the file
   * @param {number} [options.maxChanges] - Server changes kept, newest
   * @param {number} [options.lookMs] - How often watch looks at the file
   */
  constructor({ locate = locateLog, maxChanges = 200, lookMs = LOOK_MS } = {}) {
    this.locate = locate;
    this.maxChanges = maxChanges;
    this.lookMs = lookMs;
    /** @type {Promise<void>|null} */
    this._ready = null;
    this.file = null;
    this.offset = 0;
    this.fileId = null;
    // The start of a line Steam has not finished writing
    this.rest = "";
    /** @type {number[]} */
    this.changes = [];
    /**
     * CS2 processes Steam tracks: PID -> when it started
     * @type {Map<string, number>}
     */
    this.cs2 = new Map();
    /**
     * Those of them that ran when the app started, as long as they run
     * @type {Set<string>}
     */
    this.cs2AtStart = new Set();
    // When a CS2 process last ended, 0 if never seen
    this.cs2ExitedAt = 0;
    // Whether the log has shown CS2 at all: until it has, its silence says
    // nothing, since a Steam that wrote these lines otherwise would look
    // the same
    this.cs2Seen = false;
    // Reads run one after the other: two at once would take the same lines
    this._reading = Promise.resolve();
    this._lookTimer = null;
  }

  /**
   * Find the file and read back the end of what it already holds, for the
   * CS2 processes running now. Server changes are taken from now on only:
   * only those can follow a connect of this run. Safe to call more than
   * once.
   * @returns {Promise<void>}
   */
  start() {
    if (!this._ready) {
      this._ready = (async () => {
        try {
          const file = await this.locate();
          if (!file) return;
          const handle = await fs.open(file, "r");
          try {
            const stat = await handle.stat();
            const from = Math.max(0, stat.size - TAIL_BYTES);
            const buffer = Buffer.alloc(stat.size - from);
            const { bytesRead } = await handle.read(
              buffer,
              0,
              buffer.length,
              from
            );
            // Whole lines only; one Steam is still writing is read later in
            // full. Latin-1 keeps one character per byte.
            const text = buffer.toString("latin1", 0, bytesRead);
            const end = text.lastIndexOf("\n") + 1;
            const lines = text.slice(0, end).split(/\r?\n/);
            // The read began inside a line
            if (from > 0) lines.shift();
            for (const line of lines) this._takeProcessLine(line);
            this.cs2AtStart = new Set(this.cs2.keys());
            this.file = file;
            this.offset = from + end;
            this.fileId = stat.ino;
          } finally {
            await handle.close();
          }
        } catch {
          // No log: every question gets "unusable" until the next run
          this.file = null;
        }
      })();
    }
    return this._ready;
  }

  /**
   * When Steam logged CS2 changing game server, from a moment on
   * @param {number} since - Epoch ms; a change logged in the same second counts
   * @returns {Promise<{usable: boolean, changes: number[]}>} - Epoch ms of each
   *   change's second, oldest first. Unusable when there is no log to read.
   */
  async serverChangesSince(since) {
    if (!Number.isFinite(since)) return { usable: false, changes: [] };
    await this.start();
    if (!this.file) return { usable: false, changes: [] };
    try {
      await this._read();
    } catch {
      return { usable: false, changes: [] };
    }
    const from = Math.floor(since / SECOND_MS) * SECOND_MS;
    return {
      usable: true,
      changes: this.changes.filter((at) => at >= from),
    };
  }

  /**
   * CS2's game process as Steam tracks it, with what Steam appended so far
   * @returns {Promise<import('../shared/types.js').Cs2ProcessState>}
   */
  async cs2State() {
    await this.start();
    if (!this.file) return noCs2State();
    try {
      await this._read();
    } catch {
      return noCs2State();
    }
    return this._cs2Now();
  }

  /**
   * Look at the file every lookMs (LOOK_MS) and tell each change of CS2's
   * process
   * @param {(state: import('../shared/types.js').Cs2ProcessState) => void} onChange
   * @returns {Promise<void>} - Resolves once the first state is known
   */
  async watch(onChange) {
    this.stop();
    await this.start();
    if (!this.file) return;
    let last = JSON.stringify(this._cs2Now());
    let size = -1;
    let looking = false;
    this._lookTimer = setInterval(async () => {
      if (looking) return;
      looking = true;
      try {
        const stat = await fs.stat(this.file);
        // Only a file that changed has anything new
        if (stat.size === size && stat.ino === this.fileId) return;
        size = stat.size;
        const state = await this.cs2State();
        const now = JSON.stringify(state);
        if (now !== last) {
          last = now;
          onChange(state);
        }
      } catch {
        // Gone for a moment, Steam starting anew: the next look tries again
      } finally {
        looking = false;
      }
    }, this.lookMs);
  }

  /**
   * Stop looking at the file
   */
  stop() {
    if (this._lookTimer) clearInterval(this._lookTimer);
    this._lookTimer = null;
  }

  /**
   * @returns {import('../shared/types.js').Cs2ProcessState}
   * @private
   */
  _cs2Now() {
    return {
      usable: true,
      seen: this.cs2Seen,
      running: this.cs2.size > 0,
      fromAppStart: this.cs2AtStart.size > 0,
      startedAt: this.cs2.size ? Math.max(...this.cs2.values()) : 0,
      exitedAt: this.cs2ExitedAt,
    };
  }

  /**
   * Read what Steam appended since the last read, after any read under way
   * @returns {Promise<void>}
   * @private
   */
  _read() {
    const run = this._reading.then(() => this._readNewLines());
    this._reading = run.catch(() => {});
    return run;
  }

  /**
   * Read what Steam appended since the last read
   * @private
   */
  async _readNewLines() {
    const handle = await fs.open(this.file, "r");
    try {
      const stat = await handle.stat();
      // A shorter file or another file under the name: Steam started anew
      if (stat.size < this.offset || stat.ino !== this.fileId) {
        this.offset = 0;
        this.rest = "";
        this.fileId = stat.ino;
      }
      if (stat.size === this.offset) return;

      const buffer = Buffer.alloc(stat.size - this.offset);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        this.offset
      );
      this.offset += bytesRead;
      const lines = (this.rest + buffer.toString("latin1", 0, bytesRead)).split(
        /\r?\n/
      );
      this.rest = lines.pop();
      for (const line of lines) {
        const at = parseServerChange(line);
        if (at !== null) this.changes.push(at);
        else this._takeProcessLine(line);
      }
      if (this.changes.length > this.maxChanges) {
        this.changes.splice(0, this.changes.length - this.maxChanges);
      }
    } finally {
      await handle.close();
    }
  }

  /**
   * Follow CS2's processes by one log line
   * @param {string} line - One line of the log
   * @private
   */
  _takeProcessLine(line) {
    // Most lines are about something else
    if (!line.includes(" 730 ") && !line.includes("Client version")) return;
    const event = parseCs2Process(line);
    if (!event) return;
    if (event.kind !== "steam-start") this.cs2Seen = true;
    switch (event.kind) {
      case "start":
        this.cs2.set(event.pid, event.at);
        break;
      case "exit":
        this.cs2.delete(event.pid);
        // A later process may get the same PID
        this.cs2AtStart.delete(event.pid);
        this._noteExit(event.at);
        break;
      case "gone":
        // Steam logs it right after the process's own end, which is noted
        if (this.cs2.size > 0) this._noteExit(event.at);
        this.cs2.clear();
        this.cs2AtStart.clear();
        break;
      case "steam-start":
        this.cs2.clear();
        this.cs2AtStart.clear();
        break;
    }
  }

  /**
   * @param {number} at - When a CS2 process ended
   * @private
   */
  _noteExit(at) {
    this.cs2ExitedAt = Math.max(this.cs2ExitedAt, at);
  }
}
