// Game singletons
import joinManager from "../game/join-manager.js";
import mapKeeper from "../game/map-keeper.js";

// UI and utilities
import FriendsRenderer from "./friends-renderer.js";
import DOMUtils from "../utils/dom-utils.js";
import tutorialManager from "./tutorial/tutorial-manager.js";
import { TUTORIAL_STEPS } from "./tutorial/tutorial-steps.js";

/**
 * Friends view
 * The Friends tab's filter, and the Join and Cancel buttons of its rows.
 * FriendsRenderer draws the rows; this wires what the user does to them.
 */
class FriendsView {
  /**
   * Wire the filter and the list, once at startup
   */
  static initialize() {
    // Friend filter input - use incremental update to preserve animations
    const filterInput = DOMUtils.getElementById("friend-filter-input");
    if (filterInput) {
      filterInput.addEventListener("input", () => {
        if (FriendsRenderer.lastRenderedFriends) {
          const joinStates = joinManager.getJoinStates();
          // Use the same incremental update as normal rendering
          FriendsRenderer.renderFriendsList(
            FriendsRenderer.lastRenderedFriends,
            joinStates
          );
        }
      });
    }

    this.setupFriendListeners();
  }

  /**
   * Join and cancel buttons of the friends list. The container stays in
   * place, so one delegated listener serves every render.
   */
  static setupFriendListeners() {
    const friendsContainer = DOMUtils.getElementById("friends");
    if (!friendsContainer) return;

    friendsContainer.addEventListener("click", (event) => {
      const button = event.target.closest('[id^="join-btn-"]');
      if (!button) return;

      const steamId = button.id.replace("join-btn-", "");
      if (!steamId) return;

      // Check if tutorial is active
      if (tutorialManager.isActive) {
        const currentStep = tutorialManager.stateManager.getCurrentStep();
        const { FRIENDS_LIST, JOIN, CONNECTION, DONE } = TUTORIAL_STEPS;

        // On the join step the click is the way on
        if (currentStep === JOIN) {
          event.preventDefault();
          event.stopPropagation();
          tutorialManager.nextStep();
          return;
        }

        // The other list steps - do nothing but prevent default action
        if (
          currentStep === FRIENDS_LIST ||
          currentStep === CONNECTION ||
          currentStep === DONE
        ) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (button.classList.contains("cancel-btn")) {
        joinManager.cancelJoin(steamId);
      } else {
        // Following a friend, the user no longer keeps a map
        mapKeeper.userJoined(null);
        joinManager.startJoin(steamId);
      }
    });
  }
}

export default FriendsView;
