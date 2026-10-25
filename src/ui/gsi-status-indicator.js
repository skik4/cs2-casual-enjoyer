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
 * GSI status indicator in the footer
 * Says in words whether the app hears from CS2 directly; the tooltip tells
 * what that means and what to do.
 */
class GsiStatusIndicator {
  static _initialized = false;

  /**
   * Render now and on every GSI or language change
   */
  static initialize() {
    if (this._initialized) return;
    this._initialized = true;
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
    indicator.dataset.state = state;
    indicator.title = t(TITLE_KEYS[known]);
    DOMUtils.setText("gsi-status-label", t(`gsi.label.${known}`));
  }
}

export default GsiStatusIndicator;
