// Shared constants
import { JOIN_TARGET_PREFIXES, PINNED_MAPS_JOIN_ID } from "../shared/constants.js";

// Core singletons
import appStateManager from "../core/app-state-manager.js";

// Game singletons
import mapFinder, { mapLabel } from "../game/map-finder.js";
import joinManager, {
  getMapJoinId,
  getServerJoinId,
} from "../game/join-manager.js";
import userLocation from "../game/user-location.js";
import mapKeeper from "../game/map-keeper.js";

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

// A clear button waits this long for its second click, as a fake friend's
// remove button does
const CLEAR_CONFIRM_MS = 3000;

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
  // Clear buttons waiting for their second click: id -> timer
  static _armedClear = new Map();

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
      const keep = event.target.closest("[data-keep-map]");
      if (keep) {
        mapKeeper.toggle(keep.dataset.keepMap);
        return;
      }
      if (event.target.closest("[data-unpin-all]")) {
        mapKeeper.clear();
        return;
      }
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
    DOMUtils.getElementById("pool-clear")?.addEventListener("click", () =>
      this.confirmClear("pool-clear", () => mapFinder.clearPool())
    );
    DOMUtils.getElementById("fof-clear")?.addEventListener("click", () =>
      this.confirmClear("fof-clear", () => mapFinder.restartFof())
    );
    DOMUtils.getElementById("fof-key-toggle")?.addEventListener("click", () => {
      this.keyDetailsOpen = !this.keyDetailsOpen;
      this.renderFofKey();
    });

    mapFinder.onChange(() => this.render());
    // Where the user is decides which rows to block
    userLocation.onChange(() => this.render());
    mapKeeper.onChange(() => this.render());
    onLanguageChange(() => this.render());
  }

  /**
   * The view opened: start finding
   */
  static show() {
    mapFinder.setNeed("view", true);
    this.render();
  }

  /**
   * The view closed: the finder goes on only for a join or a kept map
   */
  static hide() {
    mapFinder.setNeed("view", false);
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
      mapKeeper.userCancelled(joinId);
      joinManager.cancelJoin(joinId);
      return;
    }
    if (joinId === PINNED_MAPS_JOIN_ID) {
      mapKeeper.join();
      return;
    }

    const map = button.closest(".map-card")?.dataset.map;
    if (!map) return;
    // Joining a map not pinned, the user no longer keeps the pinned ones
    mapKeeper.userJoined(map);

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
    const html =
      this.renderPinnedRow(maps, joinStates) +
      maps.map((entry) => this.renderMapCard(entry, joinStates)).join("");
    // The finder notifies on every refresh, most of which change nothing
    if (html !== this._lastListHtml) {
      list.innerHTML = html;
      this._lastListHtml = html;
    }

    ViewTabs.setCount("maps", maps.length);
    this.renderEmpty(maps.length);
    this.renderStatus();
    this.renderFofKey();
    this.renderClearButtons();
  }

  /**
   * Clear on a second click within a few seconds; the first only asks
   * @param {string} id - Button id
   * @param {Function} clear - What the button clears
   */
  static confirmClear(id, clear) {
    const timer = this._armedClear.get(id);
    if (timer) {
      clearTimeout(timer);
      this._armedClear.delete(id);
      clear();
    } else {
      this._armedClear.set(
        id,
        setTimeout(() => {
          this._armedClear.delete(id);
          this.renderClearButtons();
        }, CLEAR_CONFIRM_MS)
      );
    }
    this.renderClearButtons();
  }

  /**
   * The clear buttons: idle, or asking for the second click. One with
   * nothing to clear is off.
   */
  static renderClearButtons() {
    const status = mapFinder.getStatus();
    const buttons = [
      ["pool-clear", "clearPool", status.poolSize + status.poolFriendsSize],
      ["fof-clear", "clearFof", status.fofSize],
    ];
    for (const [id, key, count] of buttons) {
      const button = DOMUtils.getElementById(id);
      if (!button) continue;
      const armed = this._armedClear.has(id);
      button.textContent = t(armed ? "mapFinder.confirmClear" : `mapFinder.${key}`);
      button.title = t(`mapFinder.${key}Title`);
      button.classList.toggle("armed", armed);
      button.disabled = !count && !armed;
    }
  }

  /**
   * The pinned maps above the list, with one Join that takes a server of
   * any of them
   * @param {Array<{map: string, freeServers: number}>} maps - Known maps
   * @param {Object} joinStates - Join states by id
   * @returns {string} - Nothing while no map is pinned
   */
  static renderPinnedRow(maps, joinStates) {
    const pinned = mapKeeper.getMaps();
    if (!pinned.length) return "";
    const freeServers = maps
      .filter((entry) => pinned.includes(entry.map))
      .reduce((sum, entry) => sum + entry.freeServers, 0);
    const here = pinned.includes(userLocation.getMap());
    let idleText;
    if (here) idleText = t("join.onPinnedMap");
    else if (freeServers > 1) {
      idleText = t("mapFinder.freeServers", { count: freeServers });
    }
    const slot = { free: freeServers > 0, casual: true, here, idleText };

    return `
      <div class="friend pinned-row">
        <div class="friend-info">
          <span class="personaname">${escapeHtml(t("mapFinder.pinnedTitle"))}</span>
          <span class="game-line"><span class="game-where">${escapeHtml(mapKeeper.getLabel())}</span>${this.renderLabel(PINNED_MAPS_JOIN_ID, joinStates, slot)}</span>
        </div>
        <button class="link-btn unpin-all-btn" data-unpin-all>${escapeHtml(t("mapFinder.unpinAll"))}</button>
        ${this.renderJoinButton(PINNED_MAPS_JOIN_ID, joinStates, slot)}
      </div>`;
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
    const here = entry.map === userLocation.getMap();
    let idleText;
    if (here) idleText = t("join.onThisMap");
    // With several servers, say how many of them have room
    else if (free && entry.servers > 1) {
      idleText = t("mapFinder.freeServers", { count: entry.freeServers });
    }
    const slot = { free, casual: true, here, idleText };
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
          ${this.renderKeepButton(entry.map)}
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
    const slot = {
      free: server.freeSlot,
      casual: true,
      here: server.serverId === userLocation.getServerId(),
      over: server.over,
    };
    const score = formatScore(server.score);
    let title = t("mapFinder.noScore");
    if (score && server.over) title = t("mapFinder.finalScore", { score });
    // The round in progress is the one after those already played
    else if (score && server.rounds !== null) {
      title = t("mapFinder.round", { round: server.rounds + 1, score });
    }

    return `
      <div class="friend server-row">
        <div class="friend-info">
          <span class="personaname">${escapeHtml(title)}</span>
          <span class="game-line">${this.renderLabel(joinId, joinStates, slot)}</span>
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
   * Pin that adds a map to the pinned ones
   * @param {string} map - Map code
   * @returns {string}
   */
  static renderKeepButton(map) {
    const kept = mapKeeper.isKept(map);
    const title = t(kept ? "mapFinder.keeping" : "mapFinder.keep");
    return `
      <button class="icon-btn keep-btn${kept ? " active" : ""}" data-keep-map="${escapeHtml(map)}" title="${escapeHtml(title)}" aria-pressed="${kept}">
        <img src="assets/icons-svg/keep.svg" alt="" />
      </button>`;
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
    if (status.poolFriends === "crawling") {
      parts.push(t("mapFinder.poolFriendsCrawling"));
    }
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
        poolFriends: status.poolFriendsSize,
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
