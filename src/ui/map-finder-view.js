// Shared constants
import { JOIN_TARGET_PREFIXES, PINNED_MAPS_JOIN_ID } from "../shared/constants.js";
import { mapLabel } from "../shared/map-labels.js";

// Core singletons
import appStateManager from "../core/app-state-manager.js";

// Game singletons
import mapFinder, { PRIME_CHECK } from "../game/map-finder.js";
import joinManager, {
  getMapJoinId,
  getServerJoinId,
} from "../game/join-manager.js";
import userLocation from "../game/user-location.js";
import mapKeeper from "../game/map-keeper.js";

// UI and utilities
import ViewTabs from "./view-tabs.js";
import {
  formatScore,
  joinButtonLook,
  slotAttributes,
  statusLabel,
} from "./join-status.js";
import DOMUtils from "../utils/dom-utils.js";
import Validators from "../utils/validators.js";
import logger from "../utils/logger.js";
import {
  t,
  tPlural,
  getLanguage,
  onLanguageChange,
} from "../i18n/i18n-manager.js";

// Names and scores come from other players
const escapeHtml = DOMUtils.escapeHtml;

/**
 * A count with its thousands set apart as the user's language writes them
 * @param {number} count
 * @returns {string} - E.g. "19 510" in Russian, "19,510" in English
 */
function formatCount(count) {
  return Number(count || 0).toLocaleString(getLanguage() === "ru" ? "ru-RU" : "en-US");
}

// A clear button waits this long for its second click, as a fake friend's
// remove button does
const CLEAR_CONFIRM_MS = 3000;

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
  static _lastSourcesHtml = null;
  // Clear buttons waiting for their second click: source -> timer
  static _armedClear = new Map();
  // Whether the pool's clear asks whom to forget
  static _poolClearAsk = false;

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
    DOMUtils.getElementById("map-sources")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (button && !button.disabled) {
        this.handleSourceAction(button.dataset.source, button.dataset.action);
      }
    });
    DOMUtils.getElementById("fof-key-toggle")?.addEventListener("click", () => {
      this.keyDetailsOpen = !this.keyDetailsOpen;
      this.renderFofKey();
    });
    DOMUtils.getElementById("maps-prime-only")?.addEventListener("click", () =>
      this.setPrimeOnly(!mapFinder.primeOnly)
    );

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

    // Whether a player has shown a sign of Prime: for the journal, and for
    // Prime only
    const isPrime = (player) => mapFinder.isPrimePlayer(player);
    // What the friend check says about a server: for the journal only
    const primeCheck = (serverId) =>
      mapFinder.getPrimeCheck(serverId)?.verdict ?? null;
    if (joinId.startsWith(JOIN_TARGET_PREFIXES.SERVER)) {
      const serverId = joinId.slice(JOIN_TARGET_PREFIXES.SERVER.length);
      const server = mapFinder
        .getServers(map)
        .find((s) => s.serverId === serverId);
      // A server the user picked is joined whatever Prime only says
      joinManager.startMapJoin({
        map,
        serverId,
        label: `${mapLabel(map)} ${formatScore(server?.score)}`.trim(),
        getCandidateIds: () => mapFinder.getCandidateIds(map, serverId),
        isPrime,
        primeCheck,
      });
    } else {
      joinManager.startMapJoin({
        map,
        serverId: null,
        label: mapLabel(map),
        getCandidateIds: () => mapFinder.getCandidateIds(map),
        primeOnly: () => mapFinder.primeOnly,
        isPrime,
        primeCheck,
      });
    }
  }

  /**
   * Turn Prime only on or off, and keep it that way in the settings
   * @param {boolean} on
   */
  static async setPrimeOnly(on) {
    mapFinder.setPrimeOnly(on);
    const updated = await window.electronAPI.settings.update({
      maps_prime_only: on ? true : null,
    });
    if (!updated) {
      logger.error("MapFinderView", "Could not save settings");
      return;
    }
    appStateManager.setState("savedSettings", updated);
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
    // Nothing is read yet: lists are read when the user asks
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
      logger.error("MapFinderView", "Could not save settings");
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
    this.renderPrimeOnly();
    this.renderFofKey();
    this.renderSources();
  }

  /**
   * The Prime only switch next to the search status
   */
  static renderPrimeOnly() {
    const button = DOMUtils.getElementById("maps-prime-only");
    if (!button) return;
    button.textContent = t("mapFinder.primeOnly");
    button.title = t("mapFinder.primeOnlyTitle");
    button.setAttribute("aria-pressed", String(mapFinder.primeOnly));
  }

  /**
   * A click on a source's button
   * @param {"pool"|"poolFriends"|"fof"} source - Whose row
   * @param {string} action - read, clear, clear-all, clear-no-prime or cancel
   */
  static handleSourceAction(source, action) {
    if (action === "read") {
      if (source === "poolFriends") mapFinder.readPoolFriends();
      else if (source === "fof") mapFinder.readFof();
      return;
    }
    if (source === "pool") {
      // The pool asks whom to forget rather than for a second click
      this._poolClearAsk = action === "clear";
      if (action === "clear-all") mapFinder.clearPool();
      if (action === "clear-no-prime") mapFinder.clearPool({ keepPrime: true });
      this.renderSources();
      return;
    }
    if (action === "clear") {
      this.confirmClear(source, () =>
        source === "fof" ? mapFinder.clearFof() : mapFinder.clearPoolFriends()
      );
    }
  }

  /**
   * Clear on a second click within a few seconds; the first only asks
   * @param {string} source - Whose clear button
   * @param {Function} clear - What the button clears
   */
  static confirmClear(source, clear) {
    const timer = this._armedClear.get(source);
    if (timer) {
      clearTimeout(timer);
      this._armedClear.delete(source);
      clear();
    } else {
      this._armedClear.set(
        source,
        setTimeout(() => {
          this._armedClear.delete(source);
          this.renderSources();
        }, CLEAR_CONFIRM_MS)
      );
    }
    this.renderSources();
  }

  /**
   * Where the players come from, one row per source: how many, what is
   * being read, and the buttons. Reading lists takes the key and a click.
   */
  static renderSources() {
    const box = DOMUtils.getElementById("map-sources");
    if (!box) return;
    const status = mapFinder.getStatus();
    const hasKey = Boolean(this.getFofKey());
    const rows = [
      this._sourceRow("pool", status.poolSize, "", this._poolActions(status)),
      this._sourceRow(
        "poolFriends",
        status.poolFriendsSize,
        this._readingText(status.poolFriends, status.poolFriendsProgress),
        this._readButton("poolFriends", {
          hasKey,
          running: status.poolFriends === "crawling",
          lists: status.poolFriendsDue,
        }) + this._clearButton("poolFriends", status.poolFriendsSize)
      ),
      this._sourceRow(
        "fof",
        status.fofSize,
        this._readingText(status.fof, status.fofProgress) ||
          this._fofReadAt(status.fofFetchedAt),
        this._readButton("fof", {
          hasKey,
          running: status.fof === "crawling",
          lists: status.fofLists,
        }) + this._clearButton("fof", status.fofSize)
      ),
    ];
    const html = rows.join("");
    if (html !== this._lastSourcesHtml) {
      box.innerHTML = html;
      this._lastSourcesHtml = html;
    }
  }

  /**
   * @param {string} source - pool, poolFriends or fof
   * @param {number} count - Players it holds
   * @param {string} state - What is going on, may be empty
   * @param {string} actions - Its buttons
   * @returns {string}
   * @private
   */
  static _sourceRow(source, count, state, actions) {
    const name = t(`mapFinder.source.${source}`);
    const title = t(`mapFinder.source.${source}Title`);
    return `
      <div class="source-row" data-source-row="${source}">
        <span class="source-name" title="${escapeHtml(title)}">${escapeHtml(name)}</span>
        <span class="source-count">${escapeHtml(formatCount(count))}</span>
        <span class="source-state">${escapeHtml(state)}</span>
        <span class="source-actions">${actions}</span>
      </div>`;
  }

  /**
   * The pool's clear: one button, or once clicked, whom to forget
   * @param {Object} status - mapFinder.getStatus()
   * @returns {string}
   * @private
   */
  static _poolActions(status) {
    if (!this._poolClearAsk) {
      return this._button("pool", "clear", t("mapFinder.clear"), {
        title: t("mapFinder.clearPoolTitle"),
        className: "clear-btn",
        disabled: !status.poolSize,
      });
    }
    const withoutPrime = status.poolSize - status.poolPrimeSize;
    return `
      <span>${escapeHtml(t("mapFinder.clearPoolAsk"))}</span>
      ${this._button("pool", "clear-all", t("mapFinder.clearPoolAll"), { className: "clear-btn armed" })}
      ${this._button("pool", "clear-no-prime", t("mapFinder.clearPoolNoPrime", { count: withoutPrime }), {
        title: t("mapFinder.clearPoolNoPrimeTitle"),
        className: "clear-btn armed",
        disabled: !withoutPrime,
      })}
      ${this._button("pool", "cancel", t("mapFinder.cancel"))}`;
  }

  /**
   * "Read lists": off without a key or with no list to read, gone while a
   * read runs
   * @param {string} source - poolFriends or fof
   * @param {{hasKey: boolean, running: boolean, lists: number}} facts -
   *   lists: how many lists a read would take
   * @returns {string}
   * @private
   */
  static _readButton(source, { hasKey, running, lists }) {
    if (running) return "";
    let title = t(`mapFinder.read.${source}`, { count: lists });
    if (!hasKey) title = t("mapFinder.read.needsKey");
    else if (!lists) title = t(`mapFinder.read.${source}None`);
    return this._button(source, "read", t("mapFinder.read.button"), {
      title,
      disabled: !hasKey || !lists,
    });
  }

  /**
   * A clear that takes a second click
   * @param {string} source - poolFriends or fof
   * @param {number} count - Players it would forget
   * @returns {string}
   * @private
   */
  static _clearButton(source, count) {
    const armed = this._armedClear.has(source);
    return this._button(
      source,
      "clear",
      t(armed ? "mapFinder.confirmClear" : "mapFinder.clear"),
      {
        title: t(source === "fof" ? "mapFinder.clearFofTitle" : "mapFinder.clearPoolFriendsTitle"),
        className: `clear-btn${armed ? " armed" : ""}`,
        disabled: !count && !armed,
      }
    );
  }

  /**
   * @param {string} source
   * @param {string} action
   * @param {string} text
   * @param {{title?: string, className?: string, disabled?: boolean}} [options]
   * @returns {string}
   * @private
   */
  static _button(source, action, text, options = {}) {
    const { title = "", className = "", disabled = false } = options;
    const classes = ["link-btn", className].filter(Boolean).join(" ");
    const attrs = [
      `class="${classes}"`,
      `data-source="${source}"`,
      `data-action="${action}"`,
      title ? `title="${escapeHtml(title)}"` : "",
      disabled ? "disabled" : "",
    ].filter(Boolean);
    return `<button ${attrs.join(" ")}>${escapeHtml(text)}</button>`;
  }

  /**
   * @param {string} state - The read's state
   * @param {{done: number, total: number}} progress
   * @returns {string} - "reading 5 of 40…", or nothing when no read runs
   * @private
   */
  static _readingText(state, progress) {
    if (state === "crawling") {
      return t("mapFinder.read.progress", {
        done: progress.done,
        total: progress.total,
      });
    }
    return state === "error" ? t("mapFinder.read.failed") : "";
  }

  /**
   * @param {number} fetchedAt - When friends of friends were last read
   * @returns {string}
   * @private
   */
  static _fofReadAt(fetchedAt) {
    if (!fetchedAt) return "";
    const date = new Date(fetchedAt)
      .toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit" })
      .replace("/", ".");
    return t("mapFinder.read.at", { date });
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
   * @param {{map: string, label: string, servers: number, freeServers: number, primeServers: number}} entry
   * @param {Object} joinStates - Join states by id
   * @returns {string}
   */
  static renderMapCard(entry, joinStates) {
    const expanded = this.expanded.has(entry.map);
    const where = tPlural("mapFinder.servers", entry.servers);
    // With every server listed, a tag says how many show a sign of Prime;
    // with Prime only on, all of them do. A tag rather than more words, so
    // its count does not run into the free slots' count beside it.
    const prime =
      !mapFinder.primeOnly && entry.primeServers
        ? `<span class="prime-tag" title="${escapeHtml(
            t("mapFinder.primeServersTitle", {
              count: entry.primeServers,
              total: entry.servers,
            })
          )}">${escapeHtml(t("mapFinder.primeServersTag", { count: entry.primeServers }))}</span>`
        : "";
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
            <span class="game-line"><span class="game-where">${escapeHtml(where)}</span>${prime}${this.renderLabel(joinId, joinStates, slot)}</span>
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
          <span class="game-line">${this.renderPrimeTag(server)}${this.renderLabel(joinId, joinStates, slot)}</span>
        </div>
        ${this.renderJoinButton(joinId, joinStates, slot)}
      </div>`;
  }

  /**
   * The Prime tag of a server where a player shows a sign of Prime. Its
   * title says what the friend check found; where every such player sits
   * with a friend who shows no sign of Prime, the tag dims to "Prime?".
   * A mark only: the server stays listed and joinable either way.
   * @param {import('../shared/types.js').MapServer} server
   * @returns {string} - Nothing without a sign of Prime there
   */
  static renderPrimeTag(server) {
    if (!(server.primePlayers > 0)) return "";
    const check = mapFinder.getPrimeCheck(server.serverId);
    const doubt = check?.verdict === PRIME_CHECK.FRIEND;
    // The reason says more than "unknown" does
    const found = check ? (check.reason ?? check.verdict) : "";
    const title = [
      t("mapFinder.primeTagTitle", { count: server.primePlayers }),
      found && t(`mapFinder.primeCheck.${found}`),
    ]
      .filter(Boolean)
      .join(" ");
    return `<span class="prime-tag${doubt ? " doubt" : ""}" data-prime-check="${escapeHtml(found)}" title="${escapeHtml(title)}">${escapeHtml(t(doubt ? "mapFinder.primeTagDoubt" : "mapFinder.primeTag"))}</span>`;
  }

  /**
   * Status label, with the id and slot facts StatusManager updates. The id
   * holds a map code or a server id, both from other players' rich
   * presence, so it is escaped like the rest of the row; the parser gives
   * the element the raw id back, so getElementById still finds it.
   * @param {string} joinId - Map or server join id
   * @param {Object} joinStates - Join states by id
   * @param {import('./join-status.js').SlotFacts} slot
   * @returns {string}
   */
  static renderLabel(joinId, joinStates, slot) {
    const look = statusLabel(joinStates[joinId]?.status, slot);
    return `<span id="status-${escapeHtml(joinId)}" class="status-label status-${look.kind}" ${slotAttributes(slot)}>${escapeHtml(look.text)}</span>`;
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
   * Join, Wait for a slot or Cancel button, with the id StatusManager
   * updates, escaped for the same reason as the label's
   * @param {string} joinId - Map or server join id
   * @param {Object} joinStates - Join states by id
   * @param {import('./join-status.js').SlotFacts} slot
   * @returns {string}
   */
  static renderJoinButton(joinId, joinStates, slot) {
    const look = joinButtonLook(joinStates[joinId]?.status, slot);
    return `
      <div class="join-section">
        <button id="join-btn-${escapeHtml(joinId)}" class="${look.className}" ${slotAttributes(slot)}${look.disabled ? " disabled" : ""}>${escapeHtml(look.text)}</button>
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
    } else if (!mapsCount && mapFinder.primeOnly && status.hiddenServers) {
      message = t("mapFinder.noPrimeServers");
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
    // A read of friends lists shows in its own source row, where it has room
    DOMUtils.setText("map-finder-status", parts.join(" · "));
  }

  /**
   * One line on the key that reads friends lists; the key field opens on
   * request or when the key failed
   */
  static renderFofKey() {
    const mainIsKey = Validators.isApiKey(this.getMainAuth());
    const savedKey = !mainIsKey && Boolean(this.getFofKey());
    const status = mapFinder.getStatus();

    let keyText = t("mapFinder.keyNotSet");
    if (mainIsKey) keyText = t("mapFinder.keyMain");
    else if (savedKey) keyText = t("mapFinder.keySaved");
    DOMUtils.setText("fof-summary", keyText);

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
