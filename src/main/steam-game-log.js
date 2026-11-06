import { promises as fs } from "fs";
import path from "path";

import { findSteamPath } from "./cs2-locator.js";

/**
 * Steam's own log of the games it runs, logs/gameprocess_log.txt in the
 * Steam folder. Steam writes it without any launch option, and it logs a
 * line each time CS2 changes game server, joining or leaving one:
 * "[2026-11-05 23:07:55] SSGL: Game server change [730]". In the joins of
 * 2026-11-05 it logged one 0-3 s after every connect CS2 accepted and none
 * after the five it turned away, each time before the target's join token
 * changed for the user's arrival. The join loop asks it whether a new token
 * is the user's own arrival.
 */
const SERVER_CHANGE_LINE =
  /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\] SSGL: Game server change \[730\]/;

// Steam's lines carry whole seconds
const SECOND_MS = 1000;

/**
 * When a log line says CS2 changed game server
 * @param {string} line - One line of the log
 * @returns {number|null} - Epoch ms of the line's second, local time as
 *   Steam writes it; null for any other line
 */
export function parseServerChange(line) {
  const match = SERVER_CHANGE_LINE.exec(line);
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match.map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
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
 * Reads the server changes Steam logs from the app's start on. Nothing
 * watches the file: it is read when the join loop asks, from where the last
 * read stopped.
 */
export default class SteamGameLog {
  /**
   * @param {Object} [options]
   * @param {() => Promise<string|null>} [options.locate] - Finds the file
   * @param {number} [options.maxChanges] - Server changes kept, newest
   */
  constructor({ locate = locateLog, maxChanges = 200 } = {}) {
    this.locate = locate;
    this.maxChanges = maxChanges;
    /** @type {Promise<void>|null} */
    this._ready = null;
    this.file = null;
    this.offset = 0;
    this.fileId = null;
    // The start of a line Steam has not finished writing
    this.rest = "";
    /** @type {number[]} */
    this.changes = [];
  }

  /**
   * Find the file and skip what it already holds: only changes from now on
   * can follow a connect of this run. Safe to call more than once.
   * @returns {Promise<void>}
   */
  start() {
    if (!this._ready) {
      this._ready = (async () => {
        try {
          const file = await this.locate();
          if (!file) return;
          const stat = await fs.stat(file);
          this.file = file;
          this.offset = stat.size;
          this.fileId = stat.ino;
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
      await this._readNewLines();
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
      }
      if (this.changes.length > this.maxChanges) {
        this.changes.splice(0, this.changes.length - this.maxChanges);
      }
    } finally {
      await handle.close();
    }
  }
}
