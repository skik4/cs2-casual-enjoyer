// UI and utilities
import logger from "../utils/logger.js";

/**
 * Whether the app's window is minimized, as the main process reports it,
 * and whether it has the keyboard focus, as the page hears it. The page
 * cannot see a minimize by itself: with backgroundThrottling off, Electron
 * keeps its visibilityState "visible". A window without the focus may still
 * be in sight, on a second screen beside CS2 for one; only a minimized one
 * is out of sight for sure.
 */
class WindowState {
  constructor() {
    this.minimized = false;
    this.focused = true;
    this.listeners = new Set();
    this._followed = false;
  }

  /**
   * Hear the window from now on; wired once, however often called. The
   * main process is asked as well, since a page reloaded in a minimized
   * window hears no minimize; a report that comes first wins over that
   * answer, which may be older.
   */
  follow() {
    if (this._followed) return;
    this._followed = true;

    if (typeof document !== "undefined" && document.hasFocus) {
      this.focused = document.hasFocus();
    }
    if (typeof window === "undefined") return;
    window.addEventListener?.("focus", () => this._set("focused", true));
    window.addEventListener?.("blur", () => this._set("focused", false));

    const bridge = window.electronAPI?.window;
    if (!bridge?.onMinimized) return;
    let heard = false;
    bridge.onMinimized((minimized) => {
      heard = true;
      this._set("minimized", Boolean(minimized));
    });
    bridge.isMinimized?.().then((minimized) => {
      if (!heard) this._set("minimized", Boolean(minimized));
    });
  }

  /**
   * @returns {boolean} - Whether the window is minimized
   */
  isMinimized() {
    return this.minimized;
  }

  /**
   * @returns {boolean} - Whether the window has the keyboard focus
   */
  isFocused() {
    return this.focused;
  }

  /**
   * Subscribe to the window being minimized or restored, focused or left
   * @param {(what: "minimized"|"focused") => void} listener - Told what changed
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * @param {"minimized"|"focused"} key - What changed
   * @param {boolean} value - Its new value
   * @private
   */
  _set(key, value) {
    if (this[key] === value) return;
    this[key] = value;
    for (const listener of [...this.listeners]) {
      try {
        listener(key);
      } catch (error) {
        logger.error("WindowState", "Window listener failed", {
          error: error.message,
        });
      }
    }
  }
}

const windowState = new WindowState();
export default windowState;
