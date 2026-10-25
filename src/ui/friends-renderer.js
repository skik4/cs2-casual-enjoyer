// Shared constants
import { FRIENDS_TEMPLATES } from "./html-templates.js";
import { TUTORIAL_MOCK_FRIEND } from "../shared/constants.js";
import { t } from "../i18n/i18n-manager.js";

// Core singletons
import appStateManager from "../core/app-state-manager.js";

// Game singletons
import { mapLabel } from "../game/map-finder.js";

// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import ViewTabs from "./view-tabs.js";
import { joinButtonLook, statusLabel } from "./join-status.js";

/**
 * "[ 3 : 1 ]" as "3 : 1"
 * @param {string|null} score - Rich presence score
 * @returns {string}
 */
const formatScore = (score) => String(score ?? "").replace(/[[\]]/g, "").trim();

/**
 * Sort by name, ignoring case
 * @param {import('../shared/types.js').Friend} a
 * @param {import('../shared/types.js').Friend} b
 * @returns {number}
 */
const byName = (a, b) =>
  (a.personaname || "").localeCompare(b.personaname || "", undefined, {
    sensitivity: "base",
  });

/**
 * Friends Renderer module
 * Handles rendering of friends list in the UI
 */
class FriendsRenderer {
  // Cache for last rendered friends (for re-rendering on filter)
  static lastRenderedFriends = [];
  // Manually tracked IDs, rendered in their own tab
  static lastRenderedFakeFriends = [];

  /**
   * Render the manually tracked IDs in their own tab, each with a remove button
   * @param {import('../shared/types.js').Friend[]} friends - Manually tracked entries
   * @param {Object} joinStates - Map of join states by Steam ID
   */
  static renderFakeFriendsList(friends, joinStates = {}) {
    const container = DOMUtils.getElementById("fake-friends");
    if (!container) return;

    const sorted = (Array.isArray(friends) ? [...friends] : []).sort(byName);
    FriendsRenderer.lastRenderedFakeFriends = sorted;

    this.updateFriendsListIncremental(container, sorted, joinStates, {
      removable: true,
    });
    DOMUtils.toggleClass("fake-friends-empty", "hidden", sorted.length > 0);
    ViewTabs.setCount("fake", sorted.length);
  }

  /**
   * Render the list of friends in the UI
   * @param {import('../shared/types.js').Friend[]} friends - Array of friend objects
   * @param {Object} joinStates - Map of join states by friend Steam ID
   */
  static renderFriendsList(friends, joinStates = {}) {
    const friendsContainer = DOMUtils.getElementById("friends");
    if (!friendsContainer) return;

    // During the tutorial a made-up friend leads the list
    const showTutorialMockFriend = appStateManager.getState(
      "showTutorialMockFriend"
    );
    const others = (Array.isArray(friends) ? friends : [])
      .filter((f) => f.steamid !== TUTORIAL_MOCK_FRIEND.steamid)
      .sort(byName);
    const friendsToRender = showTutorialMockFriend
      ? [TUTORIAL_MOCK_FRIEND, ...others]
      : others;
    FriendsRenderer.lastRenderedFriends = friendsToRender;

    const filterValue = (
      DOMUtils.getElementById("friend-filter-input")?.value || ""
    )
      .trim()
      .toLowerCase();
    const filteredFriends = filterValue
      ? friendsToRender.filter((f) =>
          (f.personaname || "").toLowerCase().includes(filterValue)
        )
      : friendsToRender;

    // Incremental update keeps rows in place while statuses change
    this.updateFriendsListIncremental(
      friendsContainer,
      filteredFriends,
      joinStates
    );
    // "Nobody in casual" only means something once the friends list is in
    const listLoaded =
      (appStateManager.getState("savedFriendsIds") || []).length > 0;
    DOMUtils.toggleClass(
      "friends-empty",
      "hidden",
      friendsToRender.length > 0 || !listLoaded
    );
    ViewTabs.setCount("friends", friendsToRender.length);
  }

  /**
   * Update friends list incrementally to preserve DOM elements and animations
   * @param {HTMLElement} container - Friends container element
   * @param {import('../shared/types.js').Friend[]} friends - Array of friend objects
   * @param {Object} joinStates - Map of join states by friend Steam ID
   * @param {{removable?: boolean}} [options] - Show a remove button on new items
   */
  static updateFriendsListIncremental(
    container,
    friends,
    joinStates = {},
    options = {}
  ) {
    // Get current friend elements in the DOM
    const existingElements = new Map();
    for (const element of [...container.children]) {
      existingElements.set(element.id.replace("friend-", ""), element);
    }

    // Remove friends that are no longer in the list
    const visibleFriendIds = new Set(friends.map((f) => f.steamid));
    for (const [friendId, element] of existingElements) {
      if (!visibleFriendIds.has(friendId)) {
        element.remove();
        existingElements.delete(friendId);
      }
    }

    // Update or create friend elements, in order
    let lastInsertedElement = null;
    for (const friend of friends) {
      const model = this.rowModel(
        friend,
        joinStates[friend.steamid],
        options.removable
      );
      let element = existingElements.get(friend.steamid);
      if (element) {
        this.updateFriendElement(element, model);
      } else {
        element = this.createFriendElement(model);
      }

      const nextSibling = lastInsertedElement
        ? lastInsertedElement.nextElementSibling
        : container.firstElementChild;
      if (element !== nextSibling) container.insertBefore(element, nextSibling);
      lastInsertedElement = element;
    }
  }

  /**
   * Everything a row shows about a friend
   * @param {import('../shared/types.js').Friend} friend - Friend object
   * @param {import('../shared/types.js').JoinState} [joinState] - Join state
   * @param {boolean} [removable] - Whether to show a remove button
   * @returns {Object} - Model for FRIENDS_TEMPLATES.FRIEND_ITEM
   */
  static rowModel(friend, joinState, removable = false) {
    const casual = Boolean(friend.in_casual_mode);
    const slot = {
      free: Boolean(friend.join_available),
      casual,
      // Out of casual there is no slot to speak of; the line says where they are
      idleText: casual ? undefined : "",
    };

    const score = formatScore(friend.game_score);
    let whereHtml;
    if (casual && friend.game_map) {
      whereHtml =
        `<span class="game-map">${DOMUtils.escapeHtml(mapLabel(friend.game_map))}</span>` +
        (score
          ? `<span class="game-score">${DOMUtils.escapeHtml(score)}</span>`
          : "");
    } else {
      const text = friend.status || t("join.notInCS2");
      whereHtml = `<span class="game-text">${DOMUtils.escapeHtml(text)}</span>`;
    }

    return {
      steamid: friend.steamid,
      avatarUrl: friend.avatarfull || friend.avatar || friend.avatarmedium || "",
      personaname: friend.personaname || "",
      whereHtml,
      slot,
      label: statusLabel(joinState?.status, slot),
      button: joinButtonLook(joinState?.status, slot),
      removable,
    };
  }

  /**
   * Create a new friend DOM element
   * @param {Object} model - From rowModel
   * @returns {HTMLElement} - Friend DOM element
   */
  static createFriendElement(model) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = FRIENDS_TEMPLATES.FRIEND_ITEM(model);
    return wrapper.firstElementChild;
  }

  /**
   * Update an existing row in place. Its remove button is left alone, so a
   * removal waiting for its confirming click survives a refresh.
   * @param {HTMLElement} element - Existing friend DOM element
   * @param {Object} model - From rowModel
   */
  static updateFriendElement(element, model) {
    const avatar = element.querySelector(".friend-avatar");
    if (avatar && avatar.getAttribute("src") !== model.avatarUrl) {
      avatar.setAttribute("src", model.avatarUrl);
    }

    const name = element.querySelector(".personaname");
    if (name && name.textContent !== model.personaname) {
      name.textContent = model.personaname;
    }

    const where = element.querySelector(".game-where");
    if (where && where.innerHTML !== model.whereHtml) {
      where.innerHTML = model.whereHtml;
    }

    const label = element.querySelector(`#status-${model.steamid}`);
    if (label) {
      this.writeSlotFacts(label, model.slot);
      const className = `status-label status-${model.label.kind}`;
      if (label.className !== className) label.className = className;
      if (label.textContent !== model.label.text) {
        label.textContent = model.label.text;
      }
    }

    const button = element.querySelector(`#join-btn-${model.steamid}`);
    if (button) {
      this.writeSlotFacts(button, model.slot);
      if (button.className !== model.button.className) {
        button.className = model.button.className;
      }
      if (button.textContent !== model.button.text) {
        button.textContent = model.button.text;
      }
      if (button.disabled !== model.button.disabled) {
        button.disabled = model.button.disabled;
      }
    }
  }

  /**
   * Store slot facts where StatusManager reads them on the next status change
   * @param {HTMLElement} element - Status label or join button
   * @param {import('./join-status.js').SlotFacts} slot
   */
  static writeSlotFacts(element, slot) {
    element.dataset.free = slot.free ? "1" : "0";
    element.dataset.casual = slot.casual ? "1" : "0";
    if (slot.idleText === undefined) delete element.dataset.idleText;
    else element.dataset.idleText = slot.idleText;
  }
}

export default FriendsRenderer;
