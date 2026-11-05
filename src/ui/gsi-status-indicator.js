// Game singletons
import gsiManager from "../game/gsi-manager.js";

// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import { t, onLanguageChange } from "../i18n/i18n-manager.js";

/**
 * Tooltip text for each indicator state
 */
const TITLE_KEYS = {
  active: "gsi.active",
  waiting: "gsi.waiting",
  restart: "gsi.restart",
  "other-account": "gsi.otherAccount",
  unavailable: "gsi.unavailable",
  error: "gsi.error",
};

/**
 * The one state that offers to launch CS2: GSI is set up and waits only for
 * the game to start. The others report something a launch would not fix.
 */
const LAUNCH_STATE = "waiting";

/**
 * GSI status indicator in the footer
 * Says in words whether the app hears from CS2 directly; the tooltip tells
 * what that means and what to do. "Waiting for CS2" is a button as well,
 * offering to launch the game.
 */
class GsiStatusIndicator {
  static _initialized = false;
  /** @type {Function|null} */
  static _onLaunch = null;

  /**
   * Render now and on every GSI or language change
   * @param {Object} [options]
   * @param {Function} [options.onLaunch] - Offers to launch CS2, called by a
   *   click on "Waiting for CS2". Without it no state is clickable.
   */
  static initialize({ onLaunch = null } = {}) {
    if (this._initialized) return;
    this._initialized = true;
    this._onLaunch = onLaunch;

    const indicator = DOMUtils.getElementById("gsi-status");
    indicator?.addEventListener("click", () => this._launch());
    // role="button" brings no keys of its own, so they act as on a real
    // button: Enter on keydown, Space on keyup. Neither keydown reaches the
    // page - Space would scroll it, and Enter would go on to press the
    // Launch button the offer moves focus to.
    indicator?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!this._isLaunchable()) return;
      event.preventDefault();
      if (event.key === "Enter" && !event.repeat) this._launch();
    });
    indicator?.addEventListener("keyup", (event) => {
      if (event.key === " ") this._launch();
    });

    gsiManager.onChange(() => this.render());
    onLanguageChange(() => this.render());
    this.render();
  }

  /**
   * Update the indicator from the current GSI state
   */
  static render() {
    const indicator = DOMUtils.getElementById("gsi-status");
    if (!indicator) return;

    const state = gsiManager.getIndicatorState();
    const known = TITLE_KEYS[state] ? state : "unavailable";
    const launchable = this._isLaunchable(state);
    indicator.dataset.state = state;
    indicator.title = launchable
      ? `${t(TITLE_KEYS[known])}\n${t("gsi.launchHint")}`
      : t(TITLE_KEYS[known]);
    // A button only while it does something: the other states stay plain
    // text, out of the Tab order
    if (launchable) {
      indicator.setAttribute("role", "button");
      indicator.tabIndex = 0;
    } else {
      indicator.removeAttribute("role");
      indicator.removeAttribute("tabindex");
    }
    DOMUtils.setText("gsi-status-label", t(`gsi.label.${known}`));
  }

  /**
   * @param {string} [state] - Indicator state, the current one by default
   * @returns {boolean} - Whether the indicator offers to launch CS2
   * @private
   */
  static _isLaunchable(state = gsiManager.getIndicatorState()) {
    return state === LAUNCH_STATE && typeof this._onLaunch === "function";
  }

  /**
   * Offer the launch, if the state still offers it: CS2 may have posted
   * since the indicator last rendered
   * @private
   */
  static _launch() {
    if (this._isLaunchable()) this._onLaunch();
  }
}

export default GsiStatusIndicator;
