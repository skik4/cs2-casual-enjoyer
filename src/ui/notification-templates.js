/**
 * Templates of the notifications: errors, the privacy warning, the CS2
 * launch overlay and the two help texts
 */

import { ICON_PATHS } from "../shared/icon-paths.js";
import DOMUtils from "../utils/dom-utils.js";
import { t } from "../i18n/i18n-manager.js";

/**
 * One way to do what a help text explains: its name, the Steam link that
 * starts it, what to do there and what to expect. The look is all in
 * notifications.css, so every help text reads the same.
 * @param {Object} section
 * @param {string} section.title - Name of the way
 * @param {string} [section.link] - Link HTML
 * @param {string[]} section.texts - Paragraphs
 * @param {string[]} [section.points] - Short points after them
 * @returns {string} Section HTML
 */
function helpSection({ title, link = "", texts, points = [] }) {
  const paragraphs = texts
    .map((text) => `<p class="notification-text">${text}</p>`)
    .join("");
  const list = points.length
    ? `<ul class="notification-list">${points.map((point) => `<li>${point}</li>`).join("")}</ul>`
    : "";
  return `
        <div class="notification-section">
            <div class="notification-section-title">${title}</div>
            ${link}
            ${paragraphs}
            ${list}
        </div>`;
}

export const NOTIFICATION_TEMPLATES = {
  /**
   * Close button for notifications: the app's square button, as the
   * account bar's refresh is
   */
  CLOSE_BUTTON: () =>
    `<div class="notification-header"><button type="button" class="icon-btn notification-close-btn" title="${t("notifications.closeButtonTitle")}"><img src="${ICON_PATHS.CLOSE}" alt="×" class="icon-16"></button></div>`,

  /**
   * Error message display
   * @param {string} errorMessage - Error message
   * @returns {string} Error message HTML
   */
  ERROR_MESSAGE: (errorMessage) => `
        <div class="notification-main-text">${DOMUtils.escapeHtml(errorMessage)}</div>
    `,

  /**
   * Privacy settings link
   * @param {string} privacyUrl - Privacy settings URL
   * @returns {string} Privacy link HTML
   */
  PRIVACY_LINK: (privacyUrl) => `
        <a href="${DOMUtils.escapeHtml(privacyUrl)}" class="link-btn privacy-link" target="_self" title="${t("notifications.privacy.linkTitle")}">${t("notifications.privacy.linkText")}</a>
    `,

  /**
   * Privacy warning with instructions
   * @param {string} linkHtml - Privacy link HTML, empty without a SteamID64
   * @returns {string} Privacy warning HTML
   */
  PRIVACY_WARNING: (linkHtml) => `
        <div class="notification-main-text">${t("notifications.privacy.warningMain")}</div>
        ${linkHtml ? `<div class="notification-section">${linkHtml}</div>` : ""}
        <div class="note">${t("notifications.privacy.note")}</div>
    `,

  /**
   * CS2 Launch notification templates
   */
  CS2_LAUNCH: {
    /**
     * Initial state when asking user to launch CS2
     */
    INITIAL: () => ({
      title: t("notifications.cs2Launch.initial.title"),
      message: t("notifications.cs2Launch.initial.message"),
      hint: t("notifications.cs2Launch.initial.hint"),
      launchButton: t("notifications.cs2Launch.initial.launchButton"),
      closeButton: t("notifications.cs2Launch.initial.closeButton"),
    }),

    /**
     * Loading state when CS2 is being launched
     */
    LAUNCHING: () => ({
      title: t("notifications.cs2Launch.launching.title"),
      message: t("notifications.cs2Launch.launching.message"),
      hint: t("notifications.cs2Launch.launching.hint"),
      launchButton: t("notifications.cs2Launch.launching.launchButtonHtml"),
      closeButton: t("notifications.cs2Launch.launching.closeButton"),
    }),

    /**
     * State when CS2 did not reach the lobby before the launch deadline
     */
    TIMEOUT: () => ({
      title: t("notifications.cs2Launch.timeout.title"),
      message: t("notifications.cs2Launch.timeout.message"),
      hint: t("notifications.cs2Launch.timeout.hint"),
      launchButton: t("notifications.cs2Launch.timeout.launchButton"),
      closeButton: t("notifications.cs2Launch.timeout.closeButton"),
    }),

    /**
     * Complete CS2 launch notification HTML template
     * @returns {string} Complete CS2 notification HTML
     */
    FULL_TEMPLATE: () => {
      const initial = NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL();
      return `
            <div class="cs2-launch-content" data-phase="initial">
                <div class="cs2-launch-title">${initial.title}</div>
                <div class="cs2-launch-message">${initial.message}</div>                
                <div class="cs2-launch-buttons">
                    <button id="launch-cs2-btn" class="action-btn btn-primary">${initial.launchButton}</button>
                    <button id="close-cs2-launch" class="action-btn cancel-btn">${initial.closeButton}</button>
                </div>
                <div class="cs2-launch-hint">${initial.hint}</div>
            </div>
        `;
    },
  },
};

export const HELP_TEMPLATES = {
  /**
   * Help for getting Steam ID
   */
  STEAM_ID_HELP: () => `
        <div class="notification-main-text">${t("help.steamId.title")}</div>
        ${helpSection({
          title: t("help.steamId.option1Title"),
          link: `<a href="steam://url/SteamIDMyProfile" class="link-btn steam-profile-link" target="_self" title="${t("help.steamId.openProfileLinkTitle")}">${t("help.steamId.openProfileLinkText")}</a>`,
          texts: [t("help.steamId.option1Body")],
          points: [
            t("help.steamId.option1Bullet1"),
            t("help.steamId.option1Bullet2"),
            t("help.steamId.option1Bullet3"),
          ],
        })}
        ${helpSection({
          title: t("help.steamId.option2Title"),
          texts: [t("help.steamId.option2Body")],
        })}
        <div class="note">${t("help.steamId.note")}</div>
    `,

  /**
   * Help for getting API key
   */
  API_KEY_HELP: () => `
        <div class="notification-main-text">${t("help.apiKey.title")}</div>
        ${helpSection({
          title: t("help.apiKey.option1Title"),
          link: `<a id="steam-token-help-link" href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="link-btn steam-token-link" target="_self" title="${t("help.apiKey.getTokenLinkTitle")}">${t("help.apiKey.getTokenLinkText")}</a>`,
          texts: [t("help.apiKey.option1Body")],
          points: [
            t("help.apiKey.option1Bullet1"),
            t("help.apiKey.option1Bullet2"),
            t("help.apiKey.option1Bullet3"),
          ],
        })}
        ${helpSection({
          title: t("help.apiKey.option2Title"),
          link: `<a href="steam://openurl/https://steamcommunity.com/dev/apikey" class="link-btn steam-apikey-link" target="_self" title="${t("help.apiKey.getApiKeyLinkTitle")}">${t("help.apiKey.getApiKeyLinkText")}</a>`,
          texts: [t("help.apiKey.option2Body1"), t("help.apiKey.option2Body2")],
          points: [
            t("help.apiKey.option2Bullet1"),
            t("help.apiKey.option2Bullet2"),
            t("help.apiKey.option2Bullet3"),
          ],
        })}
        <div class="note">${t("help.apiKey.note1")} ${t("help.apiKey.note2")}</div>
    `,
};
