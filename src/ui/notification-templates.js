/**
 * Templates of the notifications: errors, the privacy warning, the CS2
 * launch overlay and the two help texts
 */

import { ICON_PATHS } from "../shared/icon-paths.js";
import DOMUtils from "../utils/dom-utils.js";
import { t } from "../i18n/i18n-manager.js";
import { emojiImg } from "./emoji.js";

/**
 * The emoji that heads a help text
 * @param {string} emoji - Unicode emoji
 * @returns {string} HTML span with the emoji
 */
function notificationEmoji(emoji) {
  const image = emojiImg(emoji, "emoji-svg", "margin-right: 0.5rem;");
  return `<span class="notification-emoji">${image}</span>`;
}

export const NOTIFICATION_TEMPLATES = {
  /**
   * Close button for notifications
   */
  CLOSE_BUTTON: () =>
    `<div class="notification-header"><span class="notification-close-btn" title="${t("notifications.closeButtonTitle")}"><img src="${ICON_PATHS.CLOSE_BOLD}" alt="×" style="width: 14px; height: 14px;"></span></div>`,

  /**
   * Error message display
   * @param {string} errorMessage - Error message
   * @returns {string} Error message HTML
   */ ERROR_MESSAGE: (errorMessage) => `
        <div class="notification-main-text" style="color:var(--red-light);font-weight:500;">${DOMUtils.escapeHtml(errorMessage)}</div>
    `,

  /**
   * Privacy settings link
   * @param {string} privacyUrl - Privacy settings URL
   * @returns {string} Privacy link HTML
   */
  PRIVACY_LINK: (privacyUrl) => `
        <a href="${DOMUtils.escapeHtml(privacyUrl)}" class="privacy-link" target="_self" title="${t("notifications.privacy.linkTitle")}">${t("notifications.privacy.linkText")}</a>
    `,

  /**
   * Privacy warning with instructions
   * @param {string} linkHtml - Privacy link HTML
   * @returns {string} Privacy warning HTML
   */
  PRIVACY_WARNING: (linkHtml) => `
        <div class="notification-main-text" style="color:var(--red-light);font-weight:500;">
            ${t("notifications.privacy.warningMain")}
        </div>            
        <div style="margin:8px 0 8px 0;">
            ${linkHtml}
        </div>            
        <div class="note" style="color:var(--text-secondary);font-size:0.95em;margin-bottom:2px;margin-top:15px;border-top:1px solid var(--border-color);padding-top:10px;">
            ${t("notifications.privacy.note")}
        </div>
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
  STEAM_ID_HELP: () => {
    const keyEmoji = notificationEmoji("🆔");
    return `
            <div class="notification-main-text" style="color:var(--blue-primary);font-weight:500;">
                ${keyEmoji} ${t("help.steamId.title")}
            </div>
            <div style="margin:10px 0;text-align:left;">
                <div style="margin-bottom:15px;">
                    <div style="color:var(--blue-primary);font-weight:600;margin-bottom:6px;">
                        ${t("help.steamId.option1Title")}
                    </div>                  
                    <div style="margin-bottom:8px;">
                        <a href="steam://url/SteamIDMyProfile" class="steam-profile-link" target="_self" title="${t("help.steamId.openProfileLinkTitle")}">${t("help.steamId.openProfileLinkText")}</a>
                    </div>
                    <div style="margin-bottom:8px;color:var(--text-primary);">
                        ${t("help.steamId.option1Body")}
                    </div>                
                    <ul style="color:var(--text-secondary);font-size:0.95em;margin-left:10px;padding-left:20px;">
                        <li>${t("help.steamId.option1Bullet1")}</li>
                        <li>${t("help.steamId.option1Bullet2")}</li>
                        <li>${t("help.steamId.option1Bullet3")}</li>
                    </ul>
                </div>
                
                <div>
                    <div style="color:var(--blue-primary);font-weight:600;margin-bottom:6px;">
                        ${t("help.steamId.option2Title")}
                    </div>
                    <div style="margin-bottom:8px;color:var(--text-primary);">
                        ${t("help.steamId.option2Body")}
                    </div>
                </div>
            </div>            
            <div class="note" style="color:var(--text-secondary);font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid var(--border-color);padding-top:10px;">
                ${t("help.steamId.note")}
            </div>
        `;
  },

  /**
   * Help for getting API key
   */
  API_KEY_HELP: () => {
    const keyEmoji = notificationEmoji("🔑");
    return `
        <div class="notification-main-text" style="color:var(--blue-primary);font-weight:500;">
            ${keyEmoji} ${t("help.apiKey.title")}
        </div>
                <div style="margin:10px 0;text-align:left;">
            <div style="margin-bottom:15px;">                
            <div style="color:var(--blue-primary);font-weight:600;margin-bottom:6px;">
                    ${t("help.apiKey.option1Title")}
                </div>                  
                <div style="margin-bottom:8px;">
                    <a id="steam-token-help-link" href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="steam-token-link" target="_self" title="${t("help.apiKey.getTokenLinkTitle")}">${t("help.apiKey.getTokenLinkText")}</a>
                </div>
                <div style="margin-bottom:8px;color:var(--text-primary);">
                    ${t("help.apiKey.option1Body")}
                </div>                
                <ul style="color:var(--text-secondary);font-size:0.95em;margin-left:10px;padding-left:20px;">
                    <li>${t("help.apiKey.option1Bullet1")}</li>
                    <li>${t("help.apiKey.option1Bullet2")}</li>
                    <li>${t("help.apiKey.option1Bullet3")}</li>
                </ul>
            </div>
            
            <div>
                <div style="color:var(--blue-primary);font-weight:600;margin-bottom:6px;">
                    ${t("help.apiKey.option2Title")}
                </div>                  
                <div style="margin-bottom:8px;">
                    <a href="steam://openurl/https://steamcommunity.com/dev/apikey" class="steam-apikey-link" target="_self" title="${t("help.apiKey.getApiKeyLinkTitle")}">${t("help.apiKey.getApiKeyLinkText")}</a>
                </div>
                <div style="margin-bottom:8px;color:var(--text-primary);">
                    ${t("help.apiKey.option2Body1")}
                </div>
                <div style="margin-bottom:8px;color:var(--text-primary);">
                    ${t("help.apiKey.option2Body2")}
                </div>                
                <ul style="color:var(--text-secondary);font-size:0.95em;margin-left:10px;padding-left:20px;">
                    <li>${t("help.apiKey.option2Bullet1")}</li>
                    <li>${t("help.apiKey.option2Bullet2")}</li>
                    <li>${t("help.apiKey.option2Bullet3")}</li>
                </ul>
            </div>
        </div>            
        <div class="note" style="color:var(--text-secondary);font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid var(--border-color);padding-top:10px;">
            ${t("help.apiKey.note1")}<br>
            ${t("help.apiKey.note2")}
        </div>
        `;
  },
};
