// Shared constants
import { NOTIFICATION_TEMPLATES } from "./notification-templates.js";

// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import logger from "../utils/logger.js";
import { onLanguageChange } from "../i18n/i18n-manager.js";

/**
 * The overlay that offers to launch CS2 before a join. ask() answers the
 * join manager's one question - may the join go on - and the overlay stays
 * up until the user has settled it one way or the other.
 */
class Cs2LaunchDialog {
  /**
   * Offer to launch CS2 and wait for the user's answer
   * @param {CS2Manager} cs2Manager - Launches CS2 and waits for its lobby
   * @returns {Promise<boolean>} - True once CS2 has reached its lobby. False
   *   when the user closes the overlay, when the launch fails, or when the
   *   page has no overlay to ask with. A launch that times out keeps the
   *   overlay up for another try and answers nothing until the user acts.
   */
  static ask(cs2Manager) {
    logger.info("Cs2LaunchDialog", "Offering to launch CS2");

    return new Promise((resolve) => {
      const overlay = this._overlay();
      if (!overlay) {
        logger.error("Cs2LaunchDialog", "CS2 launch overlay not found");
        resolve(false);
        return;
      }

      overlay.innerHTML = NOTIFICATION_TEMPLATES.CS2_LAUNCH.FULL_TEMPLATE();
      const launchBtn = DOMUtils.getElementById("launch-cs2-btn");
      const closeBtn = DOMUtils.getElementById("close-cs2-launch");
      if (!launchBtn || !closeBtn) {
        logger.error(
          "Cs2LaunchDialog",
          "CS2 launch buttons not found after template creation"
        );
        resolve(false);
        return;
      }

      // One answer only: a lobby reached, a Close or a failed launch, whichever
      // comes first; a launch under way keeps a second click from starting one
      const state = { isLaunching: false, isResolved: false };

      overlay.classList.remove("hidden");
      overlay.style.display = "flex";

      const finish = (answer) => {
        launchBtn.removeEventListener("click", handleLaunch);
        closeBtn.removeEventListener("click", handleClose);
        this._hide();
        resolve(answer);
      };

      const handleLaunch = async () => {
        if (state.isLaunching || state.isResolved) return;
        state.isLaunching = true;
        this.render("launching");

        try {
          let timedOut = false;
          const success = await cs2Manager.launchAndWaitForLobby((status) => {
            logger.debug("Cs2LaunchDialog", "CS2 launch progress", { status });
            if (status === "timeout") timedOut = true;
          });

          if (success && !state.isResolved) {
            state.isResolved = true;
            finish(true);
          } else if (timedOut && !state.isResolved) {
            // Keep the overlay open and let the user retry: the same button
            // runs handleLaunch again once isLaunching is cleared.
            logger.warn("Cs2LaunchDialog", "CS2 launch timed out");
            state.isLaunching = false;
            this.render("timeout");
          }
        } catch (error) {
          logger.error("Cs2LaunchDialog", "Error during CS2 launch process", {
            error: error.message,
          });
          if (!state.isResolved) {
            state.isResolved = true;
            finish(false);
          }
        }
      };

      const handleClose = () => {
        if (state.isResolved) return;
        logger.info("Cs2LaunchDialog", "Close clicked during the launch offer");
        state.isResolved = true;
        // A launch under way is called off before the overlay goes
        if (cs2Manager) cs2Manager.cancelLaunchOperations();
        finish(false);
      };

      launchBtn.addEventListener("click", handleLaunch);
      closeBtn.addEventListener("click", handleClose);
    });
  }

  /**
   * Render a phase of the overlay. The phase is stored on the content
   * element so a language switch can re-render it instead of guessing it
   * from the launch button state.
   * @param {"initial"|"launching"|"timeout"} phase - Phase to render
   */
  static render(phase) {
    const overlay = this._overlay();
    if (!overlay) return;

    const templates = NOTIFICATION_TEMPLATES.CS2_LAUNCH;
    let tpl;
    if (phase === "launching") {
      tpl = templates.LAUNCHING();
    } else if (phase === "timeout") {
      tpl = templates.TIMEOUT();
    } else {
      tpl = templates.INITIAL();
    }

    const content = overlay.querySelector(".cs2-launch-content");
    const title = overlay.querySelector(".cs2-launch-title");
    const message = overlay.querySelector(".cs2-launch-message");
    const hint = overlay.querySelector(".cs2-launch-hint");
    const launchBtn = overlay.querySelector("#launch-cs2-btn");
    const closeBtn = overlay.querySelector("#close-cs2-launch");

    if (content) content.dataset.phase = phase;
    if (title) title.textContent = tpl.title;
    if (message) message.textContent = tpl.message;
    if (hint) hint.textContent = tpl.hint;
    if (launchBtn) {
      launchBtn.innerHTML = tpl.launchButton;
      launchBtn.disabled = phase === "launching";
    }
    if (closeBtn) closeBtn.textContent = tpl.closeButton;
  }

  /**
   * Re-render the phase on show in the new language, if the overlay is up
   */
  static refreshTexts() {
    const overlay = this._overlay();
    if (!overlay || overlay.style.display === "none") return;
    const content = overlay.querySelector(".cs2-launch-content");
    this.render(content?.dataset.phase || "initial");
  }

  /**
   * @returns {HTMLElement|null} - The overlay, if the page has one
   * @private
   */
  static _overlay() {
    return DOMUtils.getElementById("cs2-launch-notification");
  }

  /**
   * Take the overlay down
   * @private
   */
  static _hide() {
    const overlay = this._overlay();
    if (!overlay) return;
    overlay.style.display = "none";
    overlay.classList.add("hidden");
  }
}

onLanguageChange(() => Cs2LaunchDialog.refreshTexts());

export default Cs2LaunchDialog;
