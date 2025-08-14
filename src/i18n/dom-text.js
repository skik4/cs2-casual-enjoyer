import STRINGS from "./strings.js";
import DOMUtils from "../utils/dom-utils.js";

/**
 * Apply static UI strings to DOM elements that are defined in index.html
 * This keeps HTML clean and enables future localization.
 */
export function applyStaticStrings() {
  try {
    // Document/app titles
    if (typeof document !== "undefined") {
      document.title = STRINGS.common.appTitle;
    }

    const windowBarTitle = document.querySelector(".window-bar-title");
    if (windowBarTitle) windowBarTitle.textContent = STRINGS.common.appTitle;

    // Tutorial button
    const tutorialBtn = DOMUtils.getElementById("tutorial-btn");
    if (tutorialBtn) {
      tutorialBtn.title = STRINGS.common.showTutorialTitle;
      const icon = tutorialBtn.querySelector("img");
      const iconHtml = icon ? icon.outerHTML : "";
      tutorialBtn.innerHTML = `${iconHtml} ${STRINGS.common.tutorial}`;
    }

    // Window controls
    const minimizeBtn = DOMUtils.getElementById("window-minimize");
    if (minimizeBtn) minimizeBtn.title = STRINGS.common.minimize;
    const closeBtn = DOMUtils.getElementById("window-close");
    if (closeBtn) closeBtn.title = STRINGS.common.close;

    // Labels and titles
    const apiKeyHelp = DOMUtils.getElementById("api-key-help");
    if (apiKeyHelp) {
      apiKeyHelp.title = STRINGS.index.apiTokenKeyTitle;
      apiKeyHelp.textContent = STRINGS.index.apiTokenKeyLabel;
    }

    const steamIdHelp = DOMUtils.getElementById("steam-id-help");
    if (steamIdHelp) {
      steamIdHelp.title = STRINGS.index.steamId64Title;
      steamIdHelp.textContent = STRINGS.index.steamId64Label;
    }

    // Inputs
    const friendFilterInput = DOMUtils.getElementById("friend-filter-input");
    if (friendFilterInput) {
      friendFilterInput.placeholder = STRINGS.index.friendFilterPlaceholder;
    }

    // Update friends UI
    const updateFriendsBtn = DOMUtils.getElementById("update-friends-btn");
    if (updateFriendsBtn) {
      updateFriendsBtn.textContent = STRINGS.index.updateFriendsButton;
      updateFriendsBtn.title = STRINGS.index.updateFriendsButtonTitle;
    }
    const updateHint = DOMUtils.getElementById("update-hint");
    if (updateHint) {
      updateHint.textContent = STRINGS.index.updateHint;
    }

    // Footer titles
    const footerSteamLink = document.querySelector(
      ".footer-social-link[href^='steam://']"
    );
    if (footerSteamLink)
      footerSteamLink.title = STRINGS.index.footerSteamProfileTitle;

    const footerGithubLink = document.querySelector(
      ".footer-social-link[href^='https://github.com']"
    );
    if (footerGithubLink)
      footerGithubLink.title = STRINGS.index.footerGithubProfileTitle;
  } catch (e) {
    // Silent fail for safety in early boot
  }
}

export default { applyStaticStrings };


