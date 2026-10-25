// Shared constants
import { JOIN_TARGET_PREFIXES, STATUS_TYPES } from "../shared/constants.js";

// Core singletons
import appStateManager from "../core/app-state-manager.js";

// Game singletons
import mapFinder, { mapLabel } from "../game/map-finder.js";
import joinManager, {
  getMapJoinId,
  getServerJoinId,
} from "../game/join-manager.js";

// UI and utilities
import StatusManager from "./status-manager.js";
import DOMUtils from "../utils/dom-utils.js";
import Validators from "../utils/validators.js";
import ErrorHandler from "../utils/error-handler.js";
import { t, onLanguageChange } from "../i18n/i18n-manager.js";

// Names and scores come from other players
const escapeHtml = DOMUtils.escapeHtml;

/**
 * "[ 3 : 1 ]" as "3 : 1"
 * @param {string|null} score - Rich presence score
 * @returns {string}
 */
const formatScore = (score) => String(score ?? "").replace(/[[\]]/g, "").trim();

/**
 * Map finder view module
 * Lists maps with known official casual servers. Join on a map takes any of
 * its servers; expanding the map shows each server with its score.
 */
class MapFinderView {
  static expanded = new Set();
  static getMainAuth = () => "";
  static _initialized = false;
  static _lastListHtml = null;

  /**
   * Wire the view once
   * @param {Object} options
   * @param {Function} options.getMainAuth - The API key or token entered in the app
   */
  static initialize({ getMainAuth }) {
    if (this._initialized) return;
    this._initialized = true;
    this.getMainAuth = getMainAuth;

    DOMUtils.getElementById("maps-list")?.addEventListener("click", (event) => {
      const button = event.target.closest('[id^="join-btn-"]');
      if (button) {
        this.handleJoinClick(button);
        return;
      }
      const row = event.target.closest("[data-toggle-map]");
      if (row) this.toggle(row.dataset.toggleMap);
    });

    DOMUtils.getElementById("fof-key-save")?.addEventListener("click", () =>
      this.saveFofKey()
    );

    mapFinder.onChange(() => this.render());
    onLanguageChange(() => this.render());
  }

  /**
   * The view opened: start finding
   */
  static show() {
    mapFinder.start();
    this.render();
  }

  /**
   * The view closed: stop polling
   */
  static hide() {
    mapFinder.stop();
  }

  /**
   * API key usable for friends lists: the main one if it is a key, else the
   * one saved for this, else none
   * @returns {string}
   */
  static getFofKey() {
    const main = this.getMainAuth();
    if (Validators.isApiKey(main)) return main;
    const saved = appStateManager.getState("savedSettings")?.fof_api_key;
    return Validators.isApiKey(saved) ? saved : "";
  }

  /**
   * Expand or collapse a map
   * @param {string} map - Map code
   */
  static toggle(map) {
    if (this.expanded.has(map)) this.expanded.delete(map);
    else this.expanded.add(map);
    this.render();
  }

  /**
   * Start or cancel a join from a map or server button
   * @param {HTMLElement} button - Join button
   */
  static handleJoinClick(button) {
    const joinId = button.id.replace("join-btn-", "");
    if (button.classList.contains("cancel-btn")) {
      joinManager.cancelJoin(joinId);
      return;
    }

    const map = button.closest(".map-card")?.dataset.map;
    if (!map) return;

    if (joinId.startsWith(JOIN_TARGET_PREFIXES.SERVER)) {
      const serverId = joinId.slice(JOIN_TARGET_PREFIXES.SERVER.length);
      const server = mapFinder
        .getServers(map)
        .find((s) => s.serverId === serverId);
      joinManager.startMapJoin({
        map,
        serverId,
        label: `${mapLabel(map)} ${formatScore(server?.score)}`.trim(),
        getCandidateIds: () => mapFinder.getCandidateIds(map, serverId),
      });
    } else {
      joinManager.startMapJoin({
        map,
        serverId: null,
        label: mapLabel(map),
        getCandidateIds: () => mapFinder.getCandidateIds(map),
      });
    }
  }

  /**
   * Save the API key used for friends of friends
   */
  static async saveFofKey() {
    const input = DOMUtils.getElementById("fof-key-input");
    if (!input) return;
    const key = input.value.trim();
    if (key && !Validators.isApiKey(key)) {
      DOMUtils.setText("fof-key-hint", t("mapFinder.fofKeyInvalid"));
      input.classList.add("invalid-input");
      return;
    }

    // An empty field removes the stored key
    const updated = await window.electronAPI.settings.update({
      fof_api_key: key || null,
    });
    if (!updated) {
      ErrorHandler.logError("MapFinderView.saveFofKey", "Could not save settings");
      return;
    }
    appStateManager.setState("savedSettings", updated);

    input.value = "";
    input.classList.remove("invalid-input");
    mapFinder.restartFof();
    this.render();
  }

  /**
   * Render the whole view from the finder's state
   */
  static render() {
    const list = DOMUtils.getElementById("maps-list");
    if (!list) return;

    const joinStates = joinManager.getJoinStates();
    const maps = mapFinder.getMaps();
    const html = maps
      .map((entry) => this.renderMapCard(entry, joinStates))
      .join("");
    // The finder notifies on every refresh, most of which change nothing;
    // rebuilding anyway would restart the status dot animations
    if (html !== this._lastListHtml) {
      list.innerHTML = html;
      this._lastListHtml = html;
    }

    this.renderEmpty(maps.length);
    this.renderStatus();
    this.renderFofKey();
  }

  /**
   * @param {{map: string, label: string, servers: number, freeServers: number}} entry
   * @param {Object} joinStates - Join states by id
   * @returns {string}
   */
  static renderMapCard(entry, joinStates) {
    const expanded = this.expanded.has(entry.map);
    const summary = t("mapFinder.mapSummary", {
      servers: entry.servers,
      free: entry.freeServers,
    });
    const servers = expanded
      ? `<div class="map-servers">${mapFinder
          .getServers(entry.map)
          .map((server) => this.renderServerRow(server, joinStates))
          .join("")}</div>`
      : "";

    return `
      <div class="map-card${expanded ? " expanded" : ""}" data-map="${escapeHtml(entry.map)}">
        <div class="friend map-row" data-toggle-map="${escapeHtml(entry.map)}">
          <div class="friend-info-row">
            <span class="map-expander">${expanded ? "▾" : "▸"}</span>
            <div class="friend-info">
              <span class="personaname">${escapeHtml(entry.label)}</span>
              <span class="game-status">${escapeHtml(summary)}</span>
            </div>
          </div>
          ${this.renderJoinControls(getMapJoinId(entry.map), joinStates)}
        </div>
        ${servers}
      </div>`;
  }

  /**
   * @param {import('../shared/types.js').MapServer} server
   * @param {Object} joinStates - Join states by id
   * @returns {string}
   */
  static renderServerRow(server, joinStates) {
    const details = [
      t("mapFinder.knownPlayers", { count: server.players.length }),
      server.freeSlot ? t("mapFinder.freeSlot") : t("mapFinder.full"),
    ].join(" · ");

    return `
      <div class="friend server-row">
        <div class="friend-info">
          <span class="personaname">${escapeHtml(formatScore(server.score) || t("mapFinder.noScore"))}</span>
          <span class="game-status">${escapeHtml(details)}</span>
        </div>
        ${this.renderJoinControls(getServerJoinId(server.serverId), joinStates)}
      </div>`;
  }

  /**
   * Status dot and Join/Cancel button, with the ids StatusManager updates
   * @param {string} joinId - Map or server join id
   * @param {Object} joinStates - Join states by id
   * @returns {string}
   */
  static renderJoinControls(joinId, joinStates) {
    const state = joinStates[joinId];
    const active = joinManager.isActive(state);
    const joined = state?.status === STATUS_TYPES.JOINED;

    return `
      <div class="join-section">
        <span class="status-dot ${StatusManager.getStatusDotClass(state?.status)}" id="dot-${joinId}"></span>
        <button id="join-btn-${joinId}" class="action-btn${active ? " cancel-btn" : ""}"${joined ? " disabled" : ""}>${active ? t("common.cancel") : t("common.join")}</button>
      </div>`;
  }

  /**
   * Explain an empty list
   * @param {number} mapsCount - Maps shown
   */
  static renderEmpty(mapsCount) {
    const status = mapFinder.getStatus();
    let message = "";
    if (!this.getMainAuth()) {
      message = t("mapFinder.needAuth");
    } else if (!mapsCount) {
      message =
        status.refreshing || !status.lastRefreshAt
          ? t("mapFinder.searchingEmpty")
          : t("mapFinder.nothingFound");
    }
    DOMUtils.setText("maps-empty", message);
    DOMUtils.toggleClass("maps-empty", "hidden", !message);
  }

  /**
   * One line on where the players come from and when they were last checked
   */
  static renderStatus() {
    const status = mapFinder.getStatus();
    const parts = [t("mapFinder.poolCount", { count: status.poolSize })];
    if (status.fof === "ready") {
      parts.push(t("mapFinder.fofCount", { count: status.fofSize }));
    } else if (status.fof === "crawling") {
      parts.push(t("mapFinder.fofCrawling"));
    }
    if (status.refreshing) {
      parts.push(t("mapFinder.searching"));
    } else if (status.lastRefreshAt) {
      const time = new Date(status.lastRefreshAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      parts.push(t("mapFinder.updatedAt", { time }));
    }
    DOMUtils.setText("map-finder-status", parts.join(" · "));
  }

  /**
   * Show where the friends-of-friends key comes from, or ask for one
   */
  static renderFofKey() {
    const mainIsKey = Validators.isApiKey(this.getMainAuth());
    DOMUtils.toggleClass("fof-key-row", "hidden", mainIsKey);

    let hint;
    if (mainIsKey) {
      hint = t("mapFinder.fofUsesMainKey");
    } else if (mapFinder.getStatus().fof === "error") {
      hint = t("mapFinder.fofKeyError");
    } else if (this.getFofKey()) {
      hint = t("mapFinder.fofKeySaved");
    } else {
      hint = t("mapFinder.fofNeedsKey");
    }
    DOMUtils.setText("fof-key-hint", hint);
  }
}

export default MapFinderView;
