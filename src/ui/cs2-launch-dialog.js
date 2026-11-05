// Shared constants
import { NOTIFICATION_TEMPLATES } from "./notification-templates.js";

// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import logger from "../utils/logger.js";
import { onLanguageChange, t } from "../i18n/i18n-manager.js";

/**
 * The first texts of the offer when no join waits on it. The join's own
 * speak of joining; its launching and timeout texts are about the game
 * alone and serve both.
 * @returns {{title: string, message: string, hint: string}}
 */
function launchOnlyTexts() {
  return {
    title: t("notifications.cs2Launch.launchOnly.title"),
    message: t("notifications.cs2Launch.launchOnly.message"),
    hint: t("notifications.cs2Launch.launchOnly.hint"),
  };
}

/**
 * The overlay that offers to launch CS2 before a join. ask() answers the
 * join manager's one question - may the join go on - and the overlay stays
 * up until the user has settled it one way or the other. The GSI status
 * makes the same offer with no join waiting: the "launch" mode.
 */
class Cs2LaunchDialog {
  /**
   * Takes down the offer made with no join waiting, while it is up. A
   * join's question cannot wait behind it, so the join takes the overlay.
   * @type {Function|null}
   * @private
   */
  static _withdrawOffer = null;

  /**
   * Offer to launch CS2 and wait for the user's answer
   * @param {CS2Manager} cs2Manager - Launches CS2 and waits for its lobby
   * @param {Object} [options]
   * @param {"join"|"launch"} [options.mode] - "join", the default, when a
   *   join waits on the answer. "launch" when nothing does and the overlay
   *   only offers to launch CS2: its first texts say so, a Close before
   *   Launch leaves everything as it was, it never opens over an overlay
   *   that is up already, and a join's question takes the overlay from it.
   * @returns {Promise<boolean>} - True once CS2 has reached its lobby. False
   *   when the user closes the overlay, when the launch fails, or when the
   *   page has no overlay to ask with; in the "launch" mode also when the
   *   overlay is up already or a join takes it over. A launch that times
   *   out keeps the overlay up for another try and answers nothing until
   *   the user acts.
   */
  static ask(cs2Manager, { mode = "join" } = {}) {
    const launchOnly = mode === "launch";
    logger.info(
      "Cs2LaunchDialog",
      launchOnly
        ? "Offering to launch CS2, no join waiting"
        : "Offering to launch CS2"
    );

    return new Promise((resolve) => {
      const overlay = this._overlay();
      if (!overlay) {
        logger.error("Cs2LaunchDialog", "CS2 launch overlay not found");
        resolve(false);
        return;
      }

      // One overlay, one question: the join's own offer, or this one, is up
      if (launchOnly && this.isOpen()) {
        logger.info("Cs2LaunchDialog", "The launch overlay is up already");
        resolve(false);
        return;
      }
      // A join's question takes the overlay from an offer no join waits on
      this._withdrawOffer?.();

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
      // Where the keyboard was, to put it back once the offer goes
      const opener = launchOnly ? document.activeElement : null;

      if (launchOnly) {
        // Kept on the content, so a language switch renders the same texts
        const content = overlay.querySelector(".cs2-launch-content");
        if (content) content.dataset.mode = mode;
        this.render("initial");
      }

      overlay.classList.remove("hidden");
      overlay.style.display = "flex";

      const detach = () => {
        launchBtn.removeEventListener("click", handleLaunch);
        closeBtn.removeEventListener("click", handleClose);
        if (this._withdrawOffer === withdraw) this._withdrawOffer = null;
      };

      const finish = (answer) => {
        detach();
        this._hide();
        opener?.focus?.();
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
        // A launch under way is called off before the overlay goes. With no
        // join waiting there is nothing else to call off: a Close before
        // Launch leaves everything as it was.
        if (cs2Manager && (!launchOnly || state.isLaunching)) {
          cs2Manager.cancelLaunchOperations();
        }
        finish(false);
      };

      // A join's question takes the overlay over. This offer leaves the
      // overlay as it is and calls off its launch under way; answered, it
      // can no longer render into the join's overlay or hide it.
      const withdraw = () => {
        if (state.isResolved) return;
        logger.info("Cs2LaunchDialog", "A join takes the launch overlay over");
        state.isResolved = true;
        if (state.isLaunching) cs2Manager.cancelLaunchOperations();
        detach();
        resolve(false);
      };

      launchBtn.addEventListener("click", handleLaunch);
      closeBtn.addEventListener("click", handleClose);
      if (launchOnly) {
        this._withdrawOffer = withdraw;
        // The keyboard follows the offer: Enter launches, Tab reaches Close
        launchBtn.focus();
      }
    });
  }

  /**
   * Whether the overlay is up, whichever question it asks
   * @returns {boolean}
   */
  static isOpen() {
    const overlay = this._overlay();
    return Boolean(overlay) && !overlay.classList.contains("hidden");
  }

  /**
   * Render a phase of the overlay. The phase is stored on the content
   * element so a language switch can re-render it instead of guessing it
   * from the launch button state; the mode is read from there too.
   * @param {"initial"|"launching"|"timeout"} phase - Phase to render
   */
  static render(phase) {
    const overlay = this._overlay();
    if (!overlay) return;

    const content = overlay.querySelector(".cs2-launch-content");
    const templates = NOTIFICATION_TEMPLATES.CS2_LAUNCH;
    let tpl;
    if (phase === "launching") {
      tpl = templates.LAUNCHING();
    } else if (phase === "timeout") {
      tpl = templates.TIMEOUT();
    } else if (content?.dataset.mode === "launch") {
      tpl = { ...templates.INITIAL(), ...launchOnlyTexts() };
    } else {
      tpl = templates.INITIAL();
    }

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
