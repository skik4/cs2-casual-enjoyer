// Shared constants
import { JOIN_TARGET_PREFIXES, STATUS_TYPES } from "../shared/constants.js";

// Game singletons
import joinManager from "../game/join-manager.js";
import { mapLabel } from "../game/map-finder.js";

// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import { t, onLanguageChange } from "../i18n/i18n-manager.js";

/**
 * What the bar explains for each status
 */
const DETAIL_KEYS = {
  [STATUS_TYPES.CONNECTING]: "joinBar.connecting",
  [STATUS_TYPES.WAITING]: "joinBar.waiting",
  [STATUS_TYPES.MISSING]: "joinBar.missing",
  [STATUS_TYPES.JOINED]: "joinBar.joined",
};

/**
 * Join bar module
 * One line above the tabs about the running join attempt, whatever tab it
 * started from, with a Cancel of its own.
 */
class JoinBar {
  static _initialized = false;

  /**
   * Wire the Cancel button once
   */
  static initialize() {
    if (this._initialized) return;
    this._initialized = true;
    DOMUtils.getElementById("join-bar-cancel")?.addEventListener(
      "click",
      (event) => {
        const joinId = event.currentTarget.dataset.joinId;
        if (joinId) joinManager.cancelJoin(joinId);
      }
    );
    onLanguageChange(() => this.render());
    this.render();
  }

  /**
   * Show the running attempt, or one that has just joined, or nothing
   */
  static render() {
    const bar = DOMUtils.getElementById("join-bar");
    if (!bar) return;

    const states = Object.entries(joinManager.getJoinStates());
    const shown =
      states.find(([, state]) => joinManager.isActive(state)) ||
      states.find(([, state]) => state.status === STATUS_TYPES.JOINED);
    bar.classList.toggle("hidden", !shown);
    if (!shown) return;

    const [joinId, state] = shown;
    bar.dataset.status = state.status;
    DOMUtils.setText(
      "join-bar-title",
      t("joinBar.title", { name: this.nameOf(joinId, state) })
    );
    DOMUtils.setText(
      "join-bar-detail",
      t(DETAIL_KEYS[state.status] || DETAIL_KEYS[STATUS_TYPES.CONNECTING])
    );

    const cancel = DOMUtils.getElementById("join-bar-cancel");
    if (cancel) {
      cancel.dataset.joinId = joinId;
      cancel.textContent = t("common.cancel");
      cancel.classList.toggle("hidden", state.status === STATUS_TYPES.JOINED);
    }
  }

  /**
   * Who or what the attempt joins, before the first answer names it
   * @param {string} joinId - Friend's Steam ID, or a map or server join id
   * @param {import('../shared/types.js').JoinState} state
   * @returns {string}
   */
  static nameOf(joinId, state) {
    if (state.personaname) return state.personaname;
    const row = DOMUtils.getElementById(`friend-${joinId}`);
    const rowName = row?.querySelector(".personaname")?.textContent;
    if (rowName) return rowName;
    if (joinId.startsWith(JOIN_TARGET_PREFIXES.MAP)) {
      return mapLabel(joinId.slice(JOIN_TARGET_PREFIXES.MAP.length));
    }
    return joinId;
  }
}

export default JoinBar;
