// Core singletons
import appStateManager from "./app-state-manager.js";

// Game singletons
import joinManager from "../game/join-manager.js";

// UI and utilities
import UIManager from "../ui/ui-manager.js";
import SteamAPI from "../steam/steam-api.js";
import Validators from "../utils/validators.js";
import DOMUtils from "../utils/dom-utils.js";

/**
 * Input management module
 * Handles user input validation and processing
 */
class AppInputManager {
  constructor() {
    this.validationManager = null;
  }

  /**
   * Set validation manager reference
   * @param {Object} validationManager - Reference to validation manager
   */
  setValidationManager(validationManager) {
    this.validationManager = validationManager;
  } /**
   * Get Steam ID input element
   * @returns {HTMLElement|null} - Steam ID input element
   */
  getSteamIdInput() {
    return DOMUtils.getElementById("steam-id");
  }

  /**
   * Get Auth input element
   * @returns {HTMLElement|null} - Auth input element
   */
  getAuthInput() {
    return DOMUtils.getElementById("auth");
  }

  /**
   * Get Steam ID from input
   * @returns {string} - Steam ID value
   */
  getSteamId() {
    const steamIdInput = this.getSteamIdInput();
    return steamIdInput ? steamIdInput.value.trim() : "";
  }

  /**
   * Get API auth from input
   * @returns {string} - API auth value
   */ getAuth() {
    const authInput = this.getAuthInput();
    if (!authInput) return "";
    return Validators.extractApiKeyOrToken(authInput.value.trim());
  }

  /**
   * Handle Steam ID paste event
   * @param {ClipboardEvent} event - Paste event
   */
  async handleSteamIdPaste(event) {
    const pastedText = (event.clipboardData || window.clipboardData).getData(
      "text"
    );
    if (!pastedText.includes("steamcommunity.com")) return;

    event.preventDefault();

    const urlValidation = Validators.validateSteamUrl(pastedText);
    if (!urlValidation.valid) {
      UIManager.showError(urlValidation.error);
      return;
    }

    const steamIdInput = this.getSteamIdInput();
    if (!steamIdInput) return;

    if (urlValidation.type === "steamid") {
      steamIdInput.value = urlValidation.value;
      this.validateInputs();
    } else if (urlValidation.type === "vanity") {
      const auth = this.getAuth();
      if (!auth) {
        UIManager.showError(
          "Please enter your API Key first to resolve vanity URLs"
        );
        return;
      }

      const originalValue = steamIdInput.value;
      steamIdInput.value = "Resolving vanity URL...";
      steamIdInput.disabled = true;

      try {
        const steamId = await SteamAPI.resolveVanityUrl(
          urlValidation.value,
          auth
        );
        if (steamId) {
          steamIdInput.value = steamId;
          UIManager.hideNotification();
        } else {
          steamIdInput.value = originalValue;
          UIManager.showError(
            "Could not resolve vanity URL. Please enter SteamID64 manually."
          );
        }
      } catch (error) {
        steamIdInput.value = originalValue;
        UIManager.showError("Error resolving vanity URL: " + error.message);
      } finally {
        steamIdInput.disabled = false;
        this.validateInputs();
      }
    }
  }

  /**
   * Handle auth input changes
   */
  handleAuthInput() {
    const authInput = this.getAuthInput();
    if (!authInput) return;

    const val = authInput.value.trim();
    const token = Validators.extractTokenIfAny(val);

    // Reset join states when auth changes
    joinManager.resetAll();

    if (token) {
      const info = Validators.parseWebApiToken(token);
      if (info && info.steamid) {
        const steamIdInput = this.getSteamIdInput();
        if (
          steamIdInput &&
          (!steamIdInput.value || steamIdInput.value !== info.steamid)
        ) {
          steamIdInput.value = info.steamid;
        }
        this.validateInputs(); // This will handle token notification and validation
      } else {
        UIManager.hideTokenInfoNotification();
        this.validateInputs();
      }
    } else {
      UIManager.hideTokenInfoNotification();
      this.validateInputs();
    }
  }

  /**
   * Validate input fields and update UI
   */
  validateInputs() {
    const steamId = this.getSteamId();
    const auth = this.getAuth();
    const updateBtn = DOMUtils.getElementById("update-friends-btn");

    const validSteamId = Validators.validateSteamId(steamId);
    const validApiKey = Validators.validateApiAuth(auth);
    const savedSettings = appStateManager.getState("savedSettings");
    const hasSaved =
      savedSettings && savedSettings.steam_id && savedSettings.auth;

    // Check for token expiration
    let isTokenExpired = false;
    const authInput = DOMUtils.getElementById("auth");
    const val = authInput ? authInput.value.trim() : "";
    const token = Validators.extractTokenIfAny(val);

    // Also check saved settings for token expiration
    let savedToken = null;
    if (!token && savedSettings && savedSettings.auth) {
      savedToken = Validators.extractTokenIfAny(savedSettings.auth);
    }

    const tokenToCheck = token || savedToken;
    if (tokenToCheck) {
      const info = Validators.parseWebApiToken(tokenToCheck);
      if (info) {
        const now = Date.now();
        const expiresMs = info.expires * 1000;
        isTokenExpired = expiresMs < now;

        // Show token info notification only for current input token
        if (token) {
          UIManager.showTokenInfoNotification(info);
        }
      }
    } else {
      UIManager.hideTokenInfoNotification();
    }

    // Button should be disabled if token is expired
    const enableBtn =
      ((validSteamId && validApiKey) || hasSaved) && !isTokenExpired;

    if (updateBtn) updateBtn.disabled = !enableBtn;

    // Update input field styles
    const steamIdInput = this.getSteamIdInput();
    if (steamIdInput) {
      if (steamId && validSteamId) {
        steamIdInput.classList.remove("invalid-input");
        steamIdInput.classList.add("valid-input");
      } else {
        steamIdInput.classList.remove("valid-input");
        if (steamId) steamIdInput.classList.add("invalid-input");
        else steamIdInput.classList.remove("invalid-input");
      }
    }

    if (authInput) {
      // Remove all validation classes first
      authInput.classList.remove(
        "invalid-input",
        "valid-input",
        "expired-token-input"
      );

      if (authInput.value.trim()) {
        if (validApiKey) {
          // Valid token/key - check if expired
          if (isTokenExpired) {
            authInput.classList.add("expired-token-input");
          } else {
            authInput.classList.add("valid-input");
          }
        } else {
          // Invalid token/key
          authInput.classList.add("invalid-input");
        }
      }
    }

    // Check if we should start auto-refresh
    if (this.validationManager) {
      this.validationManager.checkAndStartAutoRefresh(
        hasSaved,
        validSteamId,
        validApiKey,
        isTokenExpired
      );
    }
  }
}

// Singleton instance
const appInputManager = new AppInputManager();

export default appInputManager;

//  export default AppInputManager;
