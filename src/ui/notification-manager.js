import ErrorHandler from '../utils/error-handler.js';
import DOMUtils from '../utils/dom-utils.js';

/**
 * Notification Manager module
 * Handles all notifications, errors, and token information display
 */
class NotificationManager {
    /**
     * Show a notification with close button
     * @param {string} html - HTML content of the notification
     * @param {string} type - Type of notification ('info', 'error', etc.)
     */
    static showNotification(html, type = 'info') {
        const errorElement = DOMUtils.getElementById('error');
        if (!errorElement) return;

        const closeBtnHtml = `<div class="notification-header"><span class="notification-close-btn" title="Close">&times;</span></div>`;
        errorElement.innerHTML = closeBtnHtml + `<div class="notification-content ${type}">${html}</div>`;
        errorElement.style.display = 'block';

        const closeBtn = errorElement.querySelector('.notification-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                errorElement.style.display = 'none';
            };
        }
    }

    /**
     * Show persistent notification about token (steamid and expiration)
     * @param {{steamid: string, expires: number, expiresDate: Date}} tokenInfo
     */
    static showTokenInfoNotification(tokenInfo) {
        this.hideTokenInfoNotification();
        const errorElement = DOMUtils.getElementById('error');
        if (!errorElement) return;

        const now = Date.now();
        const expiresMs = tokenInfo.expires * 1000;
        const expiresStr = tokenInfo.expiresDate.toLocaleString();
        let expired = expiresMs < now;
        let warnHtml = '';

        if (expired) {
            warnHtml = `
                <div style="color:#ff4444;font-weight:500;margin-top:8px;">
                    Your token has expired.<br>
                    <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="privacy-link" target="_self">Get a new one</a><br>
                </div>
            `;
        } 
        
        const html = `
            <div class="notification-content info">
                <div style="color:#2d8cf0;font-weight:500;">
                    Steam Web API Token detected.<br>
                    <span style="font-size:0.98em;">SteamID: <b>${tokenInfo.steamid}</b></span><br>
                    <span style="font-size:0.98em;">Token expires: <b>${expiresStr}</b></span>
                </div>
                ${warnHtml}
            </div>
        `;

        const infoDiv = document.createElement('div');
        infoDiv.id = 'token-info-notification';
        infoDiv.innerHTML = html;
        infoDiv.style.marginBottom = '8px';
        errorElement.parentNode.insertBefore(infoDiv, errorElement);
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
                `<div class="notification-main-text" style="color:#ff4444;font-weight:500;">${errorMessage}</div>`,
                'error'
            );
        }
    }

    /**
     * Show error updating friends list
     * @param {string} steamId - Steam ID
     */
    static showUpdateError(steamId = '') {
        const currentSteamId = steamId || (DOMUtils.getElementById('steam-id')?.value.trim() || '');
        const privacyUrl = currentSteamId ?
            `steam://openurl/https://steamcommunity.com/profiles/${currentSteamId}/edit/settings/` : '';

        const linkHtml = privacyUrl ?
            `<a href="${privacyUrl}" class="privacy-link" style="color:#2d8cf0;text-decoration:underline;" 
                title="Open privacy settings in Steam">Open your Steam privacy settings</a>` : '';

        this.showNotification(this.getPrivacyWarningHtml(linkHtml), 'error');
    }

    /**
     * Get HTML for privacy warning
     * @param {string} linkHtml - HTML for privacy settings link
     * @returns {string} - Privacy warning HTML
     */
    static getPrivacyWarningHtml(linkHtml) {
        return `
            <div class="notification-main-text" style="color:#ff4444;font-weight:500;">
                No friends list returned. This could be because your friends list is set to private.
            </div>            
            <div style="margin:8px 0 8px 0;">
                ${linkHtml}
            </div>            
            <div class="note" style="color:#aaa;font-size:0.95em;margin-bottom:2px;margin-top:15px;border-top:1px solid #353a40;padding-top:10px;">
                After setting your friends list to public, click "Update Friend List", then you can set it back to private.
            </div>
        `;
    }

    /**
     * Hide notification
     */
    static hideError() {
        const errorElement = DOMUtils.getElementById('error');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }
}

export default NotificationManager;
