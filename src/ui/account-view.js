// UI and utilities
import SteamAPI from "../steam/steam-api.js";
import DOMUtils from "../utils/dom-utils.js";
import { t, onLanguageChange } from "../i18n/i18n-manager.js";

/**
 * How long before its expiry a token is called out as expiring
 */
const EXPIRY_WARNING_MS = 60 * 60 * 1000;

/**
 * How often the bar rechecks the token's time left
 */
const CLOCK_MS = 60 * 1000;

/**
 * A date as "26.10, 12:33"
 * @param {Date} date
 * @returns {string}
 */
function formatShortDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}, ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/**
 * Account view module
 * The account bar - who is signed in and how long the token lasts - and the
 * panel with the credential fields. The panel is open whenever the app
 * cannot work yet (no valid token or key, an expired token, no friends
 * loaded) and while the user edits the account; the bar shows otherwise.
 */
class AccountView {
  /** @type {import('../shared/types.js').AccountFacts|null} */
  static facts = null;
  static editing = false;
  static _names = new Map();
  static _pendingName = null;
  static _clock = null;
  static _initialized = false;

  /**
   * Wire the bar and panel buttons once
   * @param {Object} options
   * @param {Function} options.onRefresh - Reloads the friends list
   */
  static initialize({ onRefresh }) {
    if (this._initialized) return;
    this._initialized = true;

    DOMUtils.getElementById("account-edit-btn")?.addEventListener(
      "click",
      () => {
        this.open();
        DOMUtils.getElementById("auth")?.focus();
      }
    );
    DOMUtils.getElementById("account-status")?.addEventListener(
      "click",
      () => {
        if (this.describeAuth(this.facts).state !== "ok") this.open();
      }
    );
    DOMUtils.getElementById("account-close-btn")?.addEventListener(
      "click",
      () => this.close()
    );
    DOMUtils.getElementById("refresh-friends-btn")?.addEventListener(
      "click",
      () => onRefresh()
    );
    onLanguageChange(() => this.render());
  }

  /**
   * Take in what input validation found and redraw
   * @param {import('../shared/types.js').AccountFacts} facts
   */
  static update(facts) {
    this.facts = facts;
    this.render();
    this._loadName();
    if (!this._clock && facts?.tokenInfo) {
      this._clock = setInterval(() => this.render(), CLOCK_MS);
    }
  }

  /**
   * Whether the app cannot work without the panel
   * @param {import('../shared/types.js').AccountFacts|null} [facts]
   * @returns {boolean}
   */
  static needsSetup(facts = this.facts) {
    return (
      !facts ||
      !facts.validAuth ||
      !facts.validSteamId ||
      facts.tokenExpired ||
      !facts.hasFriends
    );
  }

  /**
   * Show the panel even though the app could work without it
   */
  static open() {
    this.editing = true;
    this.render();
  }

  /**
   * Leave editing; the panel stays only if the app still needs it
   */
  static close() {
    this.editing = false;
    this.render();
  }

  /**
   * Draw the bar or the panel from the last facts
   */
  static render() {
    const facts = this.facts;
    const setup = this.needsSetup(facts);
    const panelOpen = setup || this.editing;
    DOMUtils.toggleClass("account-panel", "hidden", !panelOpen);
    DOMUtils.toggleClass("account-bar", "hidden", panelOpen);
    DOMUtils.toggleClass("account-close-btn", "hidden", setup);
    this.renderBar(facts);
    this.renderSteamIdStep(facts);
  }

  /**
   * @param {import('../shared/types.js').AccountFacts|null} facts
   */
  static renderBar(facts) {
    if (!facts) return;
    const name = this._names.get(facts.steamId) || facts.steamId;
    DOMUtils.setText("account-name", name);
    DOMUtils.setText("account-avatar", [...name][0]?.toUpperCase() || "?");

    const { state, text } = this.describeAuth(facts);
    DOMUtils.setText("account-status", text);
    const status = DOMUtils.getElementById("account-status");
    if (status) status.dataset.state = state;
  }

  /**
   * What the bar says about the credential
   * @param {import('../shared/types.js').AccountFacts|null} facts
   * @param {number} [now] - Current time
   * @returns {{state: "ok"|"warn"|"expired", text: string}}
   */
  static describeAuth(facts, now = Date.now()) {
    if (!facts?.tokenInfo) {
      return { state: "ok", text: facts?.isKey ? t("account.apiKey") : "" };
    }
    const expiresAt = facts.tokenInfo.expires * 1000;
    const left = expiresAt - now;
    if (left <= 0) {
      return { state: "expired", text: t("account.tokenExpired") };
    }
    if (left < EXPIRY_WARNING_MS) {
      return {
        state: "warn",
        text: t("account.tokenExpiresIn", {
          minutes: Math.max(1, Math.round(left / 60000)),
        }),
      };
    }
    return {
      state: "ok",
      text: t("account.tokenValidUntil", {
        date: formatShortDate(new Date(expiresAt)),
      }),
    };
  }

  /**
   * The SteamID step: read from a token, typed in for an API key
   * @param {import('../shared/types.js').AccountFacts|null} facts
   */
  static renderSteamIdStep(facts) {
    const fromToken = facts?.tokenInfo?.steamid;
    let title;
    if (fromToken) {
      title = t("account.steamIdFromToken", { steamid: fromToken });
    } else if (facts?.isKey) {
      title = t("account.steamIdForKey");
    } else {
      title = t("account.steamIdPending");
    }
    DOMUtils.setText("steamid-step-title", title);
    DOMUtils.toggleClass("steamid-input-row", "hidden", !facts?.isKey);

    const number = DOMUtils.getElementById("steamid-step-num");
    if (number) {
      const done = Boolean(facts?.validSteamId);
      number.textContent = done ? "✓" : "3";
      number.classList.toggle("done", done);
    }
  }

  /**
   * Fetch the user's Steam name once per account, for the bar
   * @private
   */
  static _loadName() {
    const facts = this.facts;
    if (!facts?.validSteamId || !facts.validAuth || facts.tokenExpired) return;
    if (this._names.has(facts.steamId) || this._pendingName === facts.steamId) {
      return;
    }

    const steamId = facts.steamId;
    this._pendingName = steamId;
    SteamAPI.getPresence([steamId], facts.auth)
      .then((presence) => {
        const name = presence.get(steamId)?.personaname;
        if (!name) return;
        this._names.set(steamId, name);
        this.render();
      })
      .catch(() => {})
      .finally(() => {
        if (this._pendingName === steamId) this._pendingName = null;
      });
  }

  /**
   * Forget everything (used by tests)
   */
  static reset() {
    if (this._clock) clearInterval(this._clock);
    this._clock = null;
    this.facts = null;
    this.editing = false;
    this._names.clear();
    this._pendingName = null;
  }
}

export default AccountView;
