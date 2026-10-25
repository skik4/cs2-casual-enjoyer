// Shared constants
import { JOIN_JOURNAL_CONFIG } from "../shared/constants.js";

// Game singletons
import gsiManager from "./gsi-manager.js";

// UI and utilities
import logger from "../utils/logger.js";

/**
 * Join journal module
 * Writes what happens during join attempts to a file in the app's data
 * folder: every connect sent, every change in what Steam shows about the user
 * and the target, every state CS2 posts meanwhile and how each attempt ended.
 * It exists to tune the join loop from real joins - when CS2 starts and
 * finishes connecting, how stale a friend's status gets - so it only records
 * facts, one JSON object per line, and decides nothing.
 */
class JoinJournal {
  constructor() {
    this.buffer = [];
    /** @type {Set<string>} */
    this.active = new Set();
    this.trailUntil = 0;
    this._flushTimer = null;
    this._gsiUnsubscribe = null;
    this._lastGsiAt = 0;
    this._lastListed = 0;
  }

  /**
   * Note one event
   * @param {string} event - What happened
   * @param {Object} [data] - Facts about it
   */
  record(event, data = {}) {
    this.buffer.push(JSON.stringify({ t: Date.now(), event, ...data }));
    if (this.buffer.length >= JOIN_JOURNAL_CONFIG.MAX_LINES_PER_APPEND) {
      this.flush();
    } else if (!this._flushTimer) {
      this._flushTimer = setTimeout(
        () => this.flush(),
        JOIN_JOURNAL_CONFIG.FLUSH_MS
      );
    }
  }

  /**
   * Start following CS2's states
   */
  initialize() {
    if (!this._gsiUnsubscribe) {
      this._gsiUnsubscribe = gsiManager.onChange(() => this._noteGsi());
    }
  }

  /**
   * An attempt started: from now on every state CS2 posts is noted
   * @param {string} joinId - Friend's Steam ID, or a map or server join id
   */
  attemptStarted(joinId) {
    this.initialize();
    this.active.add(joinId);
    this.record("attempt-start", { join: joinId });
  }

  /**
   * An attempt ended. CS2's states are still noted for a while, to see how
   * the join lands; an attempt that already ended is not noted again.
   * @param {string} joinId - Friend's Steam ID, or a map or server join id
   * @param {string} reason - Why it ended, e.g. joined, cancelled, left-cs2
   */
  attemptEnded(joinId, reason) {
    if (!this.active.delete(joinId)) return;
    this.trailUntil = Date.now() + JOIN_JOURNAL_CONFIG.TRAIL_MS;
    this.record("attempt-end", { join: joinId, reason });
  }

  /**
   * Hand what was noted to the main process, which appends it to the file
   */
  async flush() {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = null;
    if (!this.buffer.length) return;

    const lines = this.buffer.splice(0);
    const api = window.electronAPI?.joinJournal;
    if (!api) return;
    try {
      await api.append(lines);
    } catch (error) {
      logger.warn("JoinJournal", "Could not write the join journal", {
        error: error.message,
      });
    }
  }

  /**
   * Forget everything and stop following CS2 (used by tests)
   */
  reset() {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    if (this._gsiUnsubscribe) this._gsiUnsubscribe();
    this.buffer = [];
    this.active.clear();
    this.trailUntil = 0;
    this._flushTimer = null;
    this._gsiUnsubscribe = null;
    this._lastGsiAt = 0;
    this._lastListed = 0;
  }

  /**
   * Note a state CS2 just posted: every one while an attempt runs or shortly
   * after, and otherwise whenever the number of players it lists changes
   * @private
   */
  _noteGsi() {
    // Listeners also hear CS2 going quiet; only a new post counts
    if (gsiManager.receivedAt === this._lastGsiAt) return;
    this._lastGsiAt = gsiManager.receivedAt;

    const payload = gsiManager.lastPayload;
    const players = payload?.allplayers;
    const listed =
      players && typeof players === "object" ? Object.keys(players).length : 0;
    const following = this.active.size > 0 || Date.now() < this.trailUntil;
    if (!following && listed === this._lastListed) return;
    this._lastListed = listed;

    this.record("gsi", {
      map: payload?.map?.name ?? null,
      mode: payload?.map?.mode ?? null,
      phase: payload?.map?.phase ?? null,
      round: payload?.map?.round ?? null,
      activity: payload?.player?.activity ?? null,
      player: payload?.player?.steamid ?? null,
      team: payload?.player?.team ?? null,
      listed,
    });
  }
}

// Singleton instance
const joinJournal = new JoinJournal();

export default joinJournal;
