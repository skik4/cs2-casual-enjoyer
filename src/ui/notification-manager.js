import ErrorHandler from '../utils/error-handler.js';
import DOMUtils from '../utils/dom-utils.js';
import { NOTIFICATION_TEMPLATES, HELP_TEMPLATES } from './html-templates.js';

/**
 * Notification Manager module
 * Handles all notifications, errors, token information display, and help information
 */
class NotificationManager {
    /**
     * Show a notification with close button
     * @param {string} html - HTML content of the notification
     * @param {string} type - Type of notification ('info', 'error')
     */
    static showNotification(html, type = 'info') {
        const notificationElement = DOMUtils.getElementById('notifications');
        if (!notificationElement) return;

        notificationElement.innerHTML = NOTIFICATION_TEMPLATES.CLOSE_BUTTON + `<div class="notification-content ${type}">${html}</div>`;
        notificationElement.style.display = 'block';

        const closeBtn = notificationElement.querySelector('.notification-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                notificationElement.style.display = 'none';
            };
        }
    }

    /**
     * Show persistent notification about token (steamid and expiration)
     * @param {{steamid: string, expires: number, expiresDate: Date}} tokenInfo
     */
    static showTokenInfoNotification(tokenInfo) {
        this.hideTokenInfoNotification();
        const notificationElement = DOMUtils.getElementById('notifications');
        if (!notificationElement) return;

        const now = Date.now();
        const expiresMs = tokenInfo.expires * 1000;
        const expiresStr = tokenInfo.expiresDate.toLocaleString();
        let expired = expiresMs < now;
        let warnHtml = ''; if (expired) {
            warnHtml = NOTIFICATION_TEMPLATES.TOKEN_EXPIRED_WARNING;
        }

        const html = NOTIFICATION_TEMPLATES.TOKEN_INFO(tokenInfo.steamid, expiresStr, warnHtml);
        const infoDiv = document.createElement('div');
        infoDiv.id = 'token-info-notification';
        infoDiv.className = 'mb-xs';
        infoDiv.innerHTML = html;
        notificationElement.parentNode.insertBefore(infoDiv, notificationElement);
    }

    /**
     * Hide token info notification
     */
    static hideTokenInfoNotification() {
        const infoDiv = DOMUtils.getElementById('token-info-notification');
        if (infoDiv && infoDiv.parentNode) {
            infoDiv.parentNode.removeChild(infoDiv);
        }
    }

    /**
     * Show error to the user
     * @param {string|Error} message - Error message
     * @param {string} steamId - Steam ID for context
     */
    static showError(message, steamId = '') {
        const errorMessage = ErrorHandler.formatErrorMessage(message);

        if (ErrorHandler.isPrivacyError(message)) {
            this.showUpdateError(steamId);
        } else {
            this.showNotification(
                NOTIFICATION_TEMPLATES.ERROR_MESSAGE(errorMessage),
                'error'
            );
        }
    }    /**
     * Show error updating friends list
     * @param {string} steamId - Steam ID
     */
    static showUpdateError(steamId = '') {
        const currentSteamId = steamId || (DOMUtils.getElementById('steam-id')?.value.trim() || '');
        const privacyUrl = currentSteamId ?
            `steam://openurl/https://steamcommunity.com/profiles/${currentSteamId}/edit/settings/` : '';

        const linkHtml = privacyUrl ? NOTIFICATION_TEMPLATES.PRIVACY_LINK(privacyUrl) : '';

        this.showNotification(this.getPrivacyWarningHtml(linkHtml), 'error');
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
        const notificationElement = DOMUtils.getElementById('notifications');
        if (notificationElement) {
            notificationElement.style.display = 'none';
        }
    }

    /**
     * Show help notification for Steam ID
     */
    static showSteamIdHelp() {
        this.showNotification(HELP_TEMPLATES.STEAM_ID_HELP, 'info');
    }

    /**
     * Show help notification for API Key
     */
    static showApiKeyHelp() {
        this.showNotification(HELP_TEMPLATES.API_KEY_HELP, 'info');
    }
}

export default NotificationManager;
