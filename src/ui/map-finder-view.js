// Shared constants
import { JOIN_TARGET_PREFIXES } from "../shared/constants.js";

// Core singletons
import appStateManager from "../core/app-state-manager.js";

// Game singletons
import mapFinder, { mapLabel } from "../game/map-finder.js";
import joinManager, {
  getMapJoinId,
  getServerJoinId,
} from "../game/join-manager.js";

// UI and utilities
import ViewTabs from "./view-tabs.js";
import {
  joinButtonLook,
  slotAttributes,
  statusLabel,
} from "./join-status.js";
import DOMUtils from "../utils/dom-utils.js";
import Validators from "../utils/validators.js";
import ErrorHandler from "../utils/error-handler.js";
import { t, tPlural, onLanguageChange } from "../i18n/i18n-manager.js";

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
  static keyDetailsOpen = false;
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
    DOMUtils.getElementById("fof-key-delete")?.addEventListener("click", () =>
      this.deleteFofKey()
    );
    DOMUtils.getElementById("fof-key-toggle")?.addEventListener("click", () => {
      this.keyDetailsOpen = !this.keyDetailsOpen;
      this.renderFofKey();
    });

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
    if (!Validators.isApiKey(key)) {
      DOMUtils.setText("fof-key-hint", t("mapFinder.fofKeyInvalid"));
      input.classList.add("invalid-input");
      return;
    }

    if (!(await this._storeFofKey(key))) return;
    input.value = "";
    input.classList.remove("invalid-input");
    this.keyDetailsOpen = false;
    // A new key reads the friends lists again
    mapFinder.restartFof();
    this.render();
  }

  /**
   * Remove the stored key. Friends of friends already read stay: the key is
   * only needed to read the lists again, so it can be used once and deleted.
   */
  static async deleteFofKey() {
    if (!(await this._storeFofKey(null))) return;
    this.keyDetailsOpen = false;
    this.render();
  }

  /**
   * Save or remove the friends-of-friends key
   * @param {string|null} key - Key to store, null to remove it
   * @returns {Promise<boolean>} - Whether the settings were saved
   * @private
   */
  static async _storeFofKey(key) {
    const updated = await window.electronAPI.settings.update({
      fof_api_key: key,
    });
    if (!updated) {
      ErrorHandler.logError("MapFinderView", "Could not save settings");
      return false;
    }
    appStateManager.setState("savedSettings", updated);
    return true;
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
    // The finder notifies on every refresh, most of which change nothing
    if (html !== this._lastListHtml) {
      list.innerHTML = html;
      this._lastListHtml = html;
    }

    ViewTabs.setCount("maps", maps.length);
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
    const joinId = getMapJoinId(entry.map);
    const free = entry.freeServers > 0;
    const slot = {
      free,
      casual: true,
      // With several servers, say how many of them have room
      idleText:
        free && entry.servers > 1
          ? t("mapFinder.freeServers", { count: entry.freeServers })
          : undefined,
    };
    const servers = expanded
      ? `<div class="map-servers">${mapFinder
          .getServers(entry.map)
          .map((server) => this.renderServerRow(server, joinStates))
          .join("")}</div>`
      : "";

    return `
      <div class="map-card${expanded ? " expanded" : ""}" data-map="${escapeHtml(entry.map)}">
        <div class="friend map-row" data-toggle-map="${escapeHtml(entry.map)}">
          <span class="map-expander" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
          <div class="friend-info">
            <span class="personaname">${escapeHtml(entry.label)}</span>
            <span class="game-line"><span class="game-where">${escapeHtml(tPlural("mapFinder.servers", entry.servers))}</span>${this.renderLabel(joinId, joinStates, slot)}</span>
          </div>
          ${this.renderJoinButton(joinId, joinStates, slot)}
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
    const joinId = getServerJoinId(server.serverId);
    const slot = { free: server.freeSlot, casual: true };
    const score = formatScore(server.score);
    // The round in progress is the one after those already played
    const title =
      score && server.rounds !== null
        ? t("mapFinder.round", { round: server.rounds + 1, score })
        : t("mapFinder.noScore");
    const known = t("mapFinder.knownPlayers", { count: server.players.length });

    return `
      <div class="friend server-row">
        <div class="friend-info">
          <span class="personaname">${escapeHtml(title)}</span>
          <span class="game-line"><span class="game-where">${escapeHtml(known)}</span>${this.renderLabel(joinId, joinStates, slot)}</span>
        </div>
        ${this.renderJoinButton(joinId, joinStates, slot)}
      </div>`;
  }

  /**
   * Status label, with the id and slot facts StatusManager updates
   * @param {string} joinId - Map or server join id
   * @param {Object} joinStates - Join states by id
   * @param {import('./join-status.js').SlotFacts} slot
   * @returns {string}
   */
  static renderLabel(joinId, joinStates, slot) {
    const look = statusLabel(joinStates[joinId]?.status, slot);
    return `<span id="status-${joinId}" class="status-label status-${look.kind}" ${slotAttributes(slot)}>${escapeHtml(look.text)}</span>`;
  }

  /**
   * Join, Wait for a slot or Cancel button, with the id StatusManager updates
   * @param {string} joinId - Map or server join id
   * @param {Object} joinStates - Join states by id
   * @param {import('./join-status.js').SlotFacts} slot
   * @returns {string}
   */
  static renderJoinButton(joinId, joinStates, slot) {
    const look = joinButtonLook(joinStates[joinId]?.status, slot);
    return `
      <div class="join-section">
        <button id="join-btn-${joinId}" class="${look.className}" ${slotAttributes(slot)}${look.disabled ? " disabled" : ""}>${escapeHtml(look.text)}</button>
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
   * One line next to the tabs: when the servers were last checked and among
   * how many players
   */
  static renderStatus() {
    const status = mapFinder.getStatus();
    const parts = [];
    if (status.lastRefreshAt) {
      const time = new Date(status.lastRefreshAt).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      parts.push(t("mapFinder.updatedAt", { time }));
    } else if (status.refreshing) {
      parts.push(t("mapFinder.searching"));
    }
    if (status.polled) {
      parts.push(tPlural("mapFinder.searchingAmong", status.polled));
    }
    if (status.fof === "crawling") parts.push(t("mapFinder.fofCrawling"));
    DOMUtils.setText("map-finder-status", parts.join(" · "));
  }

  /**
   * One line on where the players come from and the friends-of-friends key;
   * the key field opens on request or when the key failed
   */
  static renderFofKey() {
    const mainIsKey = Validators.isApiKey(this.getMainAuth());
    const savedKey = !mainIsKey && Boolean(this.getFofKey());
    const status = mapFinder.getStatus();

    let keyText = t("mapFinder.keyNotSet");
    if (mainIsKey) keyText = t("mapFinder.keyMain");
    else if (savedKey) keyText = t("mapFinder.keySaved");
    DOMUtils.setText(
      "fof-summary",
      `${t("mapFinder.sources", {
        pool: status.poolSize,
        fof: status.fofSize,
      })} · ${keyText}`
    );

    const open = !mainIsKey && (this.keyDetailsOpen || status.fof === "error");
    DOMUtils.toggleClass("fof-key-details", "hidden", !open);
    DOMUtils.toggleClass("fof-key-toggle", "hidden", mainIsKey);
    let toggleText = t("mapFinder.setKey");
    if (open) toggleText = t("mapFinder.hideKey");
    else if (savedKey) toggleText = t("mapFinder.changeKey");
    DOMUtils.setText("fof-key-toggle", toggleText);

    DOMUtils.toggleClass("fof-key-row", "hidden", mainIsKey);
    DOMUtils.toggleClass("fof-key-delete", "hidden", !savedKey);

    let hint;
    if (mainIsKey) {
      hint = t("mapFinder.fofUsesMainKey");
    } else if (status.fof === "error") {
      hint = t("mapFinder.fofKeyError");
    } else if (savedKey) {
      hint = t("mapFinder.fofKeySaved");
    } else if (status.fofSize) {
      hint = t("mapFinder.fofKeptWithoutKey", { count: status.fofSize });
    } else {
      hint = t("mapFinder.fofNeedsKey");
    }
    DOMUtils.setText("fof-key-hint", hint);
  }
}

export default MapFinderView;
