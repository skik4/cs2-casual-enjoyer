// Steam's own log of the games it runs
import steamLog from "./steam-log.js";

// UI and utilities
import logger from "../utils/logger.js";

// Steam's lines carry whole seconds
const SECOND_MS = 1000;

/**
 * @param {number} ms - Epoch ms
 * @returns {number} - The start of its second
 */
const secondOf = (ms) => Math.floor(ms / SECOND_MS) * SECOND_MS;

/**
 * Whether CS2 is open on this computer: the app's one answer to that. It
 * comes from Steam's own game log (main/steam-game-log.js), where Steam
 * writes a line the moment CS2's process starts and the moment it ends,
 * with no token and no network. Steam's Web API shows the same 1-1.5 s
 * later, between polls, and only to a working token, so it stands in only
 * while the log cannot answer. What CS2 is doing - menu, match, map - is
 * GSI's to say.
 *
 * The log is trusted until CS2 posts a game state while the log has it
 * closed since before: then it missed a start, and is not used again this
 * run.
 */
class Cs2Process {
  constructor() {
    /** @type {import('../shared/types.js').Cs2ProcessState} */
    this.state = {
      usable: false,
      seen: false,
      running: false,
      fromAppStart: false,
      startedAt: 0,
      exitedAt: 0,
    };
    this.trusted = true;
    this.listeners = new Set();
    this._started = null;
    this._unsubscribe = null;
  }

  /**
   * Hear the main process from now on, and read the log once; safe to
   * call more than once
   * @returns {Promise<void>}
   */
  start() {
    if (!this._started) {
      this._unsubscribe = steamLog.onCs2State((state) => this._take(state));
      this._started = this.check().then(() => {});
    }
    return this._started;
  }

  /**
   * Read the log now, for an answer that cannot wait for the next look
   * @returns {Promise<boolean|null>} - As isOpen answers
   */
  async check() {
    this._take(await steamLog.cs2State());
    return this.isOpen();
  }

  /**
   * @returns {boolean|null} - Whether CS2 is open, or null when the log
   *   cannot tell
   */
  isOpen() {
    return this._answers() ? this.state.running : null;
  }

  /**
   * Whether CS2 has closed since a moment and not opened again. Nothing
   * comes from a closed CS2, so a state it posted in the second it closed
   * came before.
   * @param {number} at - Epoch ms
   * @returns {boolean}
   */
  closedSince(at) {
    return (
      this._answers() &&
      !this.state.running &&
      this.state.exitedAt > 0 &&
      this.state.exitedAt >= secondOf(at)
    );
  }

  /**
   * Whether a CS2 that was open when the app started still is: it read the
   * GSI cfg from before this run
   * @returns {boolean|null} - Null when the log cannot tell
   */
  openSinceAppStart() {
    return this._answers() ? this.state.fromAppStart : null;
  }

  /**
   * CS2 posted a game state. A log that has CS2 closed since before missed
   * its start; it is read again first, since a look may be under way.
   * @param {number} at - When the state came, epoch ms
   * @returns {Promise<void>}
   */
  async noteGameState(at) {
    if (!this._answers() || this.state.running) return;
    await this.check();
    if (!this._answers() || this.state.running) return;
    if (this.state.exitedAt >= secondOf(at)) return;
    logger.warn(
      "Cs2Process",
      "CS2 posts while Steam's game log has it closed; the log is not used again this run"
    );
    this.trusted = false;
    this._notify();
  }

  /**
   * Subscribe to CS2 opening or closing, and to the log ceasing to answer
   * @param {Function} listener - Called with no arguments
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Forget everything and stop hearing the main process (used by tests)
   */
  reset() {
    if (this._unsubscribe) this._unsubscribe();
    this._unsubscribe = null;
    this._started = null;
    this.trusted = true;
    this.state = {
      usable: false,
      seen: false,
      running: false,
      fromAppStart: false,
      startedAt: 0,
      exitedAt: 0,
    };
    this.listeners.clear();
  }

  /**
   * @returns {boolean} - Whether the log answers
   * @private
   */
  _answers() {
    return this.state.usable && this.state.seen && this.trusted;
  }

  /**
   * @param {import('../shared/types.js').Cs2ProcessState} state - A state the log gave
   * @private
   */
  _take(state) {
    const changed = [
      "usable",
      "seen",
      "running",
      "fromAppStart",
      "startedAt",
      "exitedAt",
    ].some((key) => state[key] !== this.state[key]);
    if (!changed) return;
    this.state = { ...state };
    if (this.trusted) this._notify();
  }

  /**
   * @private
   */
  _notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error("Cs2Process", "CS2 process listener failed", {
          error: error.message,
        });
      }
    }
  }
}

const cs2Process = new Cs2Process();
export default cs2Process;
