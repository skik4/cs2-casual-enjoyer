/**
 * HTML Templates module
 * Contains all HTML templates organized by module usage
 */

import { ICON_PATHS } from "../shared/icon-paths.js";
import { replaceEmojisWithSVG, getEmojiSVG } from "../utils/emoji-svg.js";
import { t } from "../i18n/i18n-manager.js";

// =============================================================================
// EMOJI PROCESSING HELPERS
// =============================================================================

/**
 * Process HTML template and replace emojis with SVG equivalents
 * @param {string} htmlTemplate - HTML template string
 * @param {string} className - CSS class for emoji SVGs
 * @returns {Promise<string>} Processed HTML with SVG emojis
 */
async function processEmojisInTemplate(htmlTemplate, className = "emoji-svg") {
  return await replaceEmojisWithSVG(htmlTemplate, className);
}

/**
 * Create notification emoji span with SVG
 * @param {string} emoji - Unicode emoji
 * @returns {Promise<string>} HTML span with SVG emoji
 */
async function createNotificationEmoji(emoji) {
  const svgEmoji = await getEmojiSVG(
    emoji,
    "emoji-svg",
    "margin-right: 0.5rem;"
  );
  return `<span class="notification-emoji">${svgEmoji}</span>`;
}

// =============================================================================
// NOTIFICATION MANAGER TEMPLATES
// =============================================================================

export const NOTIFICATION_TEMPLATES = {
  /**
   * Close button for notifications
   */
  CLOSE_BUTTON: () =>
    `<div class="notification-header"><span class="notification-close-btn" title="${t("notifications.closeButtonTitle")}"><img src="${ICON_PATHS.CLOSE_BOLD}" alt="×" style="width: 14px; height: 14px;"></span></div>`,

  /**
   * Warning for expired token
   */
  TOKEN_EXPIRED_WARNING: () => `
        <div style="color:#f1c40f;font-weight:500;margin-top:8px;">
            ${t("notifications.tokenExpired.message")}<br>
            <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="steam-token-link" target="_self" title="${t("notifications.tokenExpired.getNewLinkTitle")}">${t("notifications.tokenExpired.getNewLinkText")}</a><br>
        </div>
    `,

  /**
   * Token information display
   * @param {string} steamid - Steam ID
   * @param {string} expiresStr - Expiration date string
   * @param {string} warnHtml - Warning HTML (if expired)
   * @returns {string} Token info HTML
   */
  TOKEN_INFO: (steamid, expiresStr, warnHtml) => `
        <div class="notification-content info">
            <div style="color:#2d8cf0;font-weight:500;">
                ${t("notifications.tokenInfo.detected")}<br>
                <span style="font-size:0.98em;">${t("notifications.tokenInfo.steamIdLabel")} <b>${steamid}</b></span><br>
                <span style="font-size:0.98em;">${t("notifications.tokenInfo.expiresLabel")} <b>${expiresStr}</b></span>
            </div>
            ${warnHtml}
        </div>
    `,

  /**
   * Error message display
   * @param {string} errorMessage - Error message
   * @returns {string} Error message HTML
   */ ERROR_MESSAGE: (errorMessage) => `
        <div class="notification-main-text" style="color:#ff4444;font-weight:500;">${errorMessage}</div>
    `,

  /**
   * Privacy settings link
   * @param {string} privacyUrl - Privacy settings URL
   * @returns {string} Privacy link HTML
   */
  PRIVACY_LINK: (privacyUrl) => `
        <a href="${privacyUrl}" class="privacy-link" target="_self" title="${t("notifications.privacy.linkTitle")}">${t("notifications.privacy.linkText")}</a>
    `,

  /**
   * Privacy warning with instructions
   * @param {string} linkHtml - Privacy link HTML
   * @returns {string} Privacy warning HTML
   */
  PRIVACY_WARNING: (linkHtml) => `
        <div class="notification-main-text" style="color:#ff4444;font-weight:500;">
            ${t("notifications.privacy.warningMain")}
        </div>            
        <div style="margin:8px 0 8px 0;">
            ${linkHtml}
        </div>            
        <div class="note" style="color:#aaa;font-size:0.95em;margin-bottom:2px;margin-top:15px;border-top:1px solid #353a40;padding-top:10px;">
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
     * Complete CS2 launch notification HTML template
     * @returns {string} Complete CS2 notification HTML
     */
    FULL_TEMPLATE: () => {
      const initial = NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL();
      return `
            <div class="cs2-launch-content">
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

// =============================================================================
// HELP MANAGER TEMPLATES
// =============================================================================

export const HELP_TEMPLATES = {
  /**
   * Help for getting Steam ID (with SVG emoji)
   */
  STEAM_ID_HELP: async () => {
    const keyEmoji = await createNotificationEmoji("🆔");
    return `
            <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
                ${keyEmoji} ${t("help.steamId.title")}
            </div>
            <div style="margin:10px 0;text-align:left;">
                <div style="margin-bottom:15px;">
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        ${t("help.steamId.option1Title")}
                    </div>                  
                    <div style="margin-bottom:8px;">
                        <a href="steam://url/SteamIDMyProfile" class="steam-profile-link" target="_self" title="${t("help.steamId.openProfileLinkTitle")}">${t("help.steamId.openProfileLinkText")}</a>
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        ${t("help.steamId.option1Body")}
                    </div>                
                    <ul style="color:#bfc9d8;font-size:0.95em;margin-left:10px;padding-left:20px;">
                        <li>${t("help.steamId.option1Bullet1")}</li>
                        <li>${t("help.steamId.option1Bullet2")}</li>
                        <li>${t("help.steamId.option1Bullet3")}</li>
                    </ul>
                </div>
                
                <div>
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        ${t("help.steamId.option2Title")}
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        ${t("help.steamId.option2Body")}
                    </div>
                </div>
            </div>            
            <div class="note" style="color:#aaa;font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid #353a40;padding-top:10px;">
                ${t("help.steamId.note")}
            </div>
        `;
  },

  /**
   * Help for getting API key (with SVG emoji)
   */
  API_KEY_HELP: async () => {
    const keyEmoji = await createNotificationEmoji("🔑");
    return `
        <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
            ${keyEmoji} ${t("help.apiKey.title")}
        </div>
                <div style="margin:10px 0;text-align:left;">
            <div style="margin-bottom:15px;">                
            <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                    ${t("help.apiKey.option1Title")}
                </div>                  
                <div style="margin-bottom:8px;">
                    <a id="steam-token-help-link" href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="steam-token-link" target="_self" title="${t("help.apiKey.getTokenLinkTitle")}">${t("help.apiKey.getTokenLinkText")}</a>
                </div>
                <div style="margin-bottom:8px;color:#f3f6fa;">
                    ${t("help.apiKey.option1Body")}
                </div>                
                <ul style="color:#bfc9d8;font-size:0.95em;margin-left:10px;padding-left:20px;">
                    <li>${t("help.apiKey.option1Bullet1")}</li>
                    <li>${t("help.apiKey.option1Bullet2")}</li>
                    <li>${t("help.apiKey.option1Bullet3")}</li>
                </ul>
            </div>
            
            <div>
                <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                    ${t("help.apiKey.option2Title")}
                </div>                  
                <div style="margin-bottom:8px;">
                    <a href="steam://openurl/https://steamcommunity.com/dev/apikey" class="steam-apikey-link" target="_self" title="${t("help.apiKey.getApiKeyLinkTitle")}">${t("help.apiKey.getApiKeyLinkText")}</a>
                </div>
                <div style="margin-bottom:8px;color:#f3f6fa;">
                    ${t("help.apiKey.option2Body1")}
                </div>
                <div style="margin-bottom:8px;color:#f3f6fa;">
                    ${t("help.apiKey.option2Body2")}
                </div>                
                <ul style="color:#bfc9d8;font-size:0.95em;margin-left:10px;padding-left:20px;">
                    <li>${t("help.apiKey.option2Bullet1")}</li>
                    <li>${t("help.apiKey.option2Bullet2")}</li>
                    <li>${t("help.apiKey.option2Bullet3")}</li>
                </ul>
            </div>
        </div>            
        <div class="note" style="color:#aaa;font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid #353a40;padding-top:10px;">
            ${t("help.apiKey.note1")}<br>
            ${t("help.apiKey.note2")}
        </div>
        `;
  },
};

// =============================================================================
// FRIENDS RENDERER TEMPLATES
// =============================================================================

export const FRIENDS_TEMPLATES = {
  /**
   * Individual friend item
   * @param {string} steamid - Steam ID
   * @param {string} avatarUrl - Avatar URL
   * @param {string} personaname - Display name
   * @param {string} statusText - Game status text
   * @param {boolean} hasStatus - Whether friend has status
   * @param {boolean} isMissing - Whether friend is missing
   * @param {boolean} isActive - Whether join is active
   * @returns {string} Friend item HTML
   */
  FRIEND_ITEM: (
    steamid,
    avatarUrl,
    personaname,
    statusText,
    hasStatus,
    isMissing,
    isActive
  ) => `
        <div class="friend" id="friend-${steamid}">
            <div class="friend-info-row">
                <img src="${avatarUrl}" alt="avatar" class="friend-avatar">
                <div class="friend-info">
                    <span class="personaname">${personaname}</span>
                    ${hasStatus ? `<span class="game-status" style="font-weight:400;color:#bfc9d8;">${statusText}</span>` : ""}
                </div>
            </div>
            <div class="join-section" id="join-section-${steamid}">
                <span class="status-dot ${isMissing ? "dot-missing" : "dot-cancelled"}" id="dot-${steamid}"></span>
                <button id="join-btn-${steamid}" class="action-btn${isActive ? " cancel-btn" : ""}" data-i18n="${isActive ? "common.cancel" : "common.join"}" data-i18n-attr="text">${isActive ? t("common.cancel") : t("common.join")}</button>
            </div>
        </div>
    `,
};

// =============================================================================
// TUTORIAL MANAGER TEMPLATES
// =============================================================================

export const TUTORIAL_TEMPLATES = {
  /**
   * Generate tutorial steps with SVG emojis
   * @returns {Promise<Array>} Tutorial steps with processed SVG emojis
   */
  async getStepsWithSVG() {
    const steps = [
      {
        title: t("tutorial.step1Title"),
        content: `
                    ${t("tutorial.step1Content")}               
                    <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                        ${t("tutorial.keyHint")}
                    </div>
                `,
        target: null,
        icon: "🎮",
      },
      {
        title: t("tutorial.step2Title"),
        content: t("tutorial.step2Content"),
        target: "#api-key-help",
        icon: "🔑",
      },
      {
        title: t("tutorial.step3Title"),
        content: `
                    ${t("tutorial.step3Content")}
                `,
        target: "#steam-token-help-link",
        icon: "🌐",
      },
      {
        title: t("tutorial.step4Title"),
        content: `
                    ${t("tutorial.step4Content")}
                `,
        target: "#auth",
        icon: "📋",
      },
      {
        title: t("tutorial.step5Title"),
        content: t("tutorial.step5Content"),
        target: "#update-friends-btn",
        icon: "🔄",
      },
      {
        title: t("tutorial.step6Title"),
        content: t("tutorial.step6Content"),
        target: "#friend-filter-input",
        icon: "🔍",
      },
      {
        title: t("tutorial.step7Title"),
        content: t("tutorial.step7Content"),
        target: "#friends",
        icon: "👥",
      },
      {
        title: t("tutorial.step8Title"),
        content: `
                    ${t("tutorial.step8Content")}
                `,
        target: ".friend .action-btn",
        icon: "🚀",
      },
      {
        title: t("tutorial.step9Title"),
        content: `
                    ${t("tutorial.step9ContentTop")}
                    <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                        ${t("tutorial.step9ContentNote1")}<br>
                        ${t("tutorial.step9ContentNote2")}<br>
                        ${t("tutorial.step9ContentNote3")}
                    </div>
                `,
        target: ".status-dot",
        icon: "🟡",
      },
      {
        title: t("tutorial.step10Title"),
        content: `
                    ${t("tutorial.step10ContentTop")}
                    <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                        ${t("tutorial.step10ContentNote1")}<br>
                        ${t("tutorial.step10ContentNote2")}
                    </div>
                    <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                        <span id='github-releases-link' style='color:#2d8cf0;cursor:pointer;text-decoration:underline;'>
                            ${t("tutorial.githubReleases")}
                        </span>
                    </div>
                `,
        target: null,
        icon: "🎉",
      },
    ];

    // Process each step to replace emojis with SVG
    const processedSteps = await Promise.all(
      steps.map(async (step) => ({
        ...step,
        icon: await getEmojiSVG(step.icon, "emoji-svg"),
        content: await processEmojisInTemplate(step.content),
      }))
    );

    return processedSteps;
  },

  /**
   * Tutorial modal content with SVG emoji support
   * @param {string} icon - Tutorial step icon (SVG HTML or Unicode emoji)
   * @param {string} title - Tutorial step title
   * @param {number} currentStepNumber - Current step number (1-based)
   * @param {number} totalSteps - Total number of steps
   * @param {string} content - Tutorial step content
   * @param {boolean} isFirstStep - Whether this is the first step
   * @param {boolean} isLastStep - Whether this is the last step
   * @returns {Promise<string>} Tutorial modal HTML with SVG emojis
   */
  MODAL_CONTENT_SVG: async (
    icon,
    title,
    currentStepNumber,
    totalSteps,
    content,
    isFirstStep,
    isLastStep
  ) => {
    const processedIcon = icon?.includes("<svg")
      ? icon
      : await getEmojiSVG(icon || "📖", "emoji-svg");
    const processedContent = await processEmojisInTemplate(content);

    return `
        <div class="tutorial-header">
            <h3 class="tutorial-title">
                <span class="tutorial-icon">${processedIcon}</span>
                ${title}
            </h3>
            <div class="tutorial-progress">
                <span class="tutorial-step-counter">${t("tutorial.stepCounter", { current: currentStepNumber, total: totalSteps })}</span>
                <div class="tutorial-progress-bar">
                    <div class="tutorial-progress-fill" style="width: ${(currentStepNumber / totalSteps) * 100}%"></div>
                </div>
            </div>        
        </div>
        <div class="tutorial-content">${processedContent}</div>        
        <div class="tutorial-controls">
            <button class="tutorial-btn tutorial-btn-secondary">
                ${t("common.skipTutorial")}
            </button>            
            <div class="tutorial-nav-buttons">
                <button class="tutorial-btn tutorial-btn-secondary" 
                        ${isFirstStep ? "disabled" : ""}>
                    ${t("common.previous")}
                </button>
                <button class="tutorial-btn tutorial-btn-primary">
                    ${isLastStep ? t("common.finish") : t("common.next")}
                </button>
            </div>
        </div>`;
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

// Export emoji processing helpers
export { processEmojisInTemplate, createNotificationEmoji };

// =============================================================================
// EXPORT ALL TEMPLATES
// =============================================================================

export default {
  NOTIFICATION_TEMPLATES,
  HELP_TEMPLATES,
  FRIENDS_TEMPLATES,
  TUTORIAL_TEMPLATES,
};
