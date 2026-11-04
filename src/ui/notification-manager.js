// Shared constants
import {
  NOTIFICATION_TEMPLATES,
  HELP_TEMPLATES,
} from "./notification-templates.js";

// UI and utilities
import ErrorHandler from "../utils/error-handler.js";
import DOMUtils from "../utils/dom-utils.js";
import Validators from "../utils/validators.js";
import i18n from "../i18n/i18n-manager.js";

/**
 * Notification Manager module
 * Handles all notifications, errors and help information
 */
class NotificationManager {
  // Keep lightweight state to re-render texts on language change
  static _lastMain = null; // { kind: 'help-steamid'|'help-apikey'|'privacy'|'error', payload?: any }

  /**
   * Show a notification with close button
   * @param {string} html - HTML content of the notification
   * @param {string} type - Type of notification ('info', 'error')
   */
  static showNotification(html, type = "info") {
    const notificationElement = DOMUtils.getElementById("notifications");
    if (!notificationElement) return;

    // HTML already processed in templates, no need for additional processing
    notificationElement.innerHTML =
      NOTIFICATION_TEMPLATES.CLOSE_BUTTON() +
      `<div class="notification-content ${type}">${html}</div>`;
    notificationElement.style.display = "block";

    const closeBtn = notificationElement.querySelector(
      ".notification-close-btn"
    );
    if (closeBtn) {
      closeBtn.onclick = () => {
        notificationElement.style.display = "none";
        NotificationManager._lastMain = null;
      };
    }
  }

  /**
   * Show error to the user
   * @param {string|Error} error - Text written for the user, or an error
   *   told by its code (ErrorHandler.userMessage)
   * @param {string} steamId - Steam ID for context
   */
  static showError(error, steamId = "") {
    if (ErrorHandler.isPrivacyError(error)) {
      this.showUpdateError(steamId);
    } else {
      this.showNotification(
        NOTIFICATION_TEMPLATES.ERROR_MESSAGE(ErrorHandler.userMessage(error)),
        "error"
      );
      // The error itself, so a language switch tells it again
      NotificationManager._lastMain = { kind: "error", payload: { error } };
    }
  }

  /**
   * Show error updating friends list
   * @param {string} steamId - Steam ID
   */
  static showUpdateError(steamId = "") {
    const currentSteamId =
      steamId || DOMUtils.getElementById("steam-id")?.value.trim() || "";
    // The id becomes a steam:// link: anything but a SteamID64 gets none
    const privacyUrl = Validators.validateSteamId(currentSteamId)
      ? `steam://openurl/https://steamcommunity.com/profiles/${currentSteamId}/edit/settings/`
      : "";

    const linkHtml = privacyUrl
      ? NOTIFICATION_TEMPLATES.PRIVACY_LINK(privacyUrl)
      : "";

    this.showNotification(this.getPrivacyWarningHtml(linkHtml), "error");
    NotificationManager._lastMain = { kind: "privacy", payload: { privacyUrl } };
  }

  /**
   * Get HTML for privacy warning
   * @param {string} linkHtml - HTML for privacy settings link
   * @returns {string} - Privacy warning HTML
   */
  static getPrivacyWarningHtml(linkHtml) {
    return NOTIFICATION_TEMPLATES.PRIVACY_WARNING(linkHtml);
  }

  /**
   * Hide notification
   */
  static hideNotification() {
    const notificationElement = DOMUtils.getElementById("notifications");
    if (notificationElement) {
      notificationElement.style.display = "none";
    }
  }

  /**
   * Show help notification for Steam ID
   */
  static showSteamIdHelp() {
    this.showNotification(HELP_TEMPLATES.STEAM_ID_HELP(), "info");
    NotificationManager._lastMain = { kind: "help-steamid" };
  }

  /**
   * Show help notification for API Key
   */
  static showApiKeyHelp() {
    this.showNotification(HELP_TEMPLATES.API_KEY_HELP(), "info");
    NotificationManager._lastMain = { kind: "help-apikey" };
  }

  /**
   * Re-render texts for currently visible notifications after language change
   */
  static refreshTextsAfterLanguageChange() {
    try {
      // Refresh main notification if visible and we know its kind
      const main = NotificationManager._lastMain;
      const notificationElement = DOMUtils.getElementById("notifications");
      const isVisible = notificationElement && notificationElement.style.display === "block";
      if (!main || !isVisible) return;

      // Update close button tooltip without rebuilding DOM
      const closeBtn = notificationElement.querySelector(".notification-close-btn");
      if (closeBtn) {
        try { closeBtn.title = i18n.t("notifications.closeButtonTitle"); } catch {}
      }

      const contentDiv = notificationElement.querySelector(".notification-content");
      if (!contentDiv) return;

      switch (main.kind) {
        case "help-steamid": {
          const content = HELP_TEMPLATES.STEAM_ID_HELP();
          contentDiv.className = "notification-content info";
          contentDiv.innerHTML = content;
          break;
        }
        case "help-apikey": {
          const content = HELP_TEMPLATES.API_KEY_HELP();
          contentDiv.className = "notification-content info";
          contentDiv.innerHTML = content;
          break;
        }
        case "privacy": {
          const privacyUrl = main.payload?.privacyUrl || "";
          const linkHtml = privacyUrl ? NOTIFICATION_TEMPLATES.PRIVACY_LINK(privacyUrl) : "";
          contentDiv.className = "notification-content error";
          contentDiv.innerHTML = this.getPrivacyWarningHtml(linkHtml);
          break;
        }
        case "error": {
          const errorMessage = ErrorHandler.userMessage(main.payload?.error ?? "");
          contentDiv.className = "notification-content error";
          contentDiv.innerHTML = NOTIFICATION_TEMPLATES.ERROR_MESSAGE(errorMessage);
          break;
        }
        default:
          break;
      }
    } catch { }
  }
}

// Subscribe to language changes for automatic refresh
try {
  i18n.onLanguageChange(() => NotificationManager.refreshTextsAfterLanguageChange());
} catch {}

export default NotificationManager;
