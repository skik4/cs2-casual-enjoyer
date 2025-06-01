import { STATUS_TYPES } from '../shared/constants.js';
import ErrorHandler from '../utils/error-handler.js';

/**
 * UI Manager module
 * Handles all UI rendering and updates
 */
class UIManager {
    constructor() {
        this.lastRenderedFriends = [];    }

    /**
     * Get element by ID
     * @param {string} id - Element ID
     * @returns {HTMLElement|null} - Found element or null
     */
    static $id(id) {
        return document.getElementById(id);
    }

    /**
     * Status dot CSS class mapping
     */
    static get STATUS_DOT_CLASSES() {
        return {
            [STATUS_TYPES.WAITING]: 'dot-waiting',
            [STATUS_TYPES.CONNECTING]: 'dot-connecting',
            [STATUS_TYPES.JOINED]: 'dot-joined',
            [STATUS_TYPES.CANCELLED]: 'dot-cancelled',
            [STATUS_TYPES.MISSING]: 'dot-missing'
        };
    }

    /**
     * Get the appropriate CSS class for a status dot
     * @param {string} status - Join status
     * @returns {string} - CSS class for the status dot
     */
    static getStatusDotClass(status) {
        return this.STATUS_DOT_CLASSES[status] || this.STATUS_DOT_CLASSES[STATUS_TYPES.CANCELLED];
    }

    /**
     * Update the status dot appearance based on join status
     * @param {string} friend_id - Steam ID of the friend
     * @param {string} status - Join status
     */
    static updateDot(friend_id, status) {
        const dot = this.$id('dot-' + friend_id);
        if (dot) {
            dot.className = 'status-dot ' + this.getStatusDotClass(status);
        }
    }

    /**
     * Update the join button appearance and behavior
     * @param {string} friend_id - Steam ID of the friend
     * @param {string} status - Join status
     */
    static updateJoinButton(friend_id, status) {
        const btn = this.$id('join-btn-' + friend_id);
        if (!btn) return;

        const isActive = status === STATUS_TYPES.WAITING ||
            status === STATUS_TYPES.CONNECTING ||
            status === STATUS_TYPES.MISSING;

        if (isActive) {
            btn.textContent = "Cancel";
            btn.classList.add('cancel-btn');
        } else {
            btn.textContent = "Join";
            btn.classList.remove('cancel-btn');
        }

        btn.disabled = (status === STATUS_TYPES.JOINED);
    }

    /**
     * Render the list of friends in the UI
     * @param {import('../shared/types.js').Friend[]} friends - Array of friend objects
     * @param {Object} joinStates - Map of join states by friend Steam ID
     */
    static renderFriendsList(friends, joinStates = {}) {
        const friendsContainer = this.$id('friends');
        if (!friendsContainer) return;

        this.lastRenderedFriends = Array.isArray(friends) ? [...friends] : [];

        // Sort friends alphabetically
        let sortedFriends = [...friends].sort((a, b) => {
            const nameA = (a.personaname || '').toLowerCase();
            const nameB = (b.personaname || '').toLowerCase();
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        });        
        
        // Apply filter
        const filterInput = this.$id('friend-filter-input');
        let filteredFriends = sortedFriends;

        if (filterInput) {
            const filterValue = filterInput.value.trim().toLowerCase();
            if (filterValue) {
                filteredFriends = sortedFriends.filter(f => {
                    const name = (f.personaname || '').toLowerCase();
                    return name.includes(filterValue);
                });
            }
        }
        
        // Render friends
        let html = '';
        for (const friend of filteredFriends) {
            const avatarUrl = friend.avatarfull || friend.avatar || friend.avatarmedium || '';
            const joinState = joinStates[friend.steamid];
            const isMissing = joinState && joinState.status === STATUS_TYPES.MISSING;

            html += this.renderFriendItem(friend, joinState, isMissing, avatarUrl);
        }

        // Set the generated HTML to the friends container
        friendsContainer.innerHTML = html;
    }

    /**
     * Render individual friend item HTML
     * @param {import('../shared/types.js').Friend} friend - Friend object
     * @param {import('../shared/types.js').JoinState} joinState - Join state
     * @param {boolean} isMissing - Whether friend is missing
     * @param {string} avatarUrl - Avatar URL
     * @returns {string} - Friend item HTML
     */
    static renderFriendItem(friend, joinState, isMissing, avatarUrl) {
        const isActive = joinState && (
            joinState.status === STATUS_TYPES.WAITING ||
            joinState.status === STATUS_TYPES.CONNECTING ||
            isMissing
        );

        return `
            <div class="friend" id="friend-${friend.steamid}">
                <div class="friend-info-row">
                    <img src="${avatarUrl}" alt="avatar" class="friend-avatar">
                    <div class="friend-info">
                        <span class="personaname">${friend.personaname}</span>
                        ${friend.status || isMissing ?
                `<span class="game-status" style="font-weight:400;color:#bfc9d8;">${isMissing ? 'Temporarily not in Casual' : friend.status
                }</span>` : ''}
                    </div>
                </div>
                <div class="join-section" id="join-section-${friend.steamid}">
                    <span class="status-dot ${isMissing ? 'dot-missing' : 'dot-cancelled'}" id="dot-${friend.steamid}"></span>
                    <button id="join-btn-${friend.steamid}" class="action-btn${isActive ? ' cancel-btn' : ''}">${isActive ? 'Cancel' : 'Join'}</button>
                </div>
            </div>
        `;
    }    /**
     * Show a notification with close button
     * @param {string} html - HTML content of the notification
     */    static showNotification(html, type = 'info') {
        const errorElement = this.$id('error');
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
        const errorElement = this.$id('error');
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
        } const html = `
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
        const infoDiv = this.$id('token-info-notification');
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
        const currentSteamId = steamId || (this.$id('steam_id')?.value.trim() || '');
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
        const errorElement = this.$id('error');
        if (errorElement) {
            errorElement.style.display = 'none';
        }
    }

    /**
     * Show help notification for Steam ID
     */
    static showSteamIdHelp() {
        const helpHtml = `
            <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
                🆔 How to Get Your SteamID64
            </div>
            <div style="margin:10px 0;text-align:left;">
                <div style="margin-bottom:15px;">
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 1: Quick Link (Recommended)
                    </div>
                    <div style="margin-bottom:8px;">
                        <a href="steam://url/SteamIDMyProfile" class="privacy-link" target="_self" style="font-weight:600;text-decoration:underline;">Open your Steam profile in the Steam client.</a>
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        Your profile will open in the Steam client. Click on the URL in the address bar at the top of the Steam window - this automatically copies it to your clipboard. Then paste it into the <strong>SteamID64</strong> field below.
                    </div>
                    <div style="color:#bfc9d8;font-size:0.95em;margin-left:10px;">
                        • Fast and automatic<br>
                        • Works with any Steam profile URL format<br>
                        • The app converts URLs to SteamID64 automatically
                    </div>
                </div>
                
                <div>
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 2: Manual Entry
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        If you already know your <strong>SteamID64</strong> (17-digit number), you can enter it directly.
                    </div>
                </div>
            </div>            
            <div class="note" style="color:#aaa;font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid #353a40;padding-top:10px;">
                Your SteamID64 used to identify your account in Steam Web API requests.
            </div>
        `;
        this.showNotification(helpHtml, 'info');
    }

    /**
     * Show help notification for API Key
     */
    static showApiKeyHelp() {
        const helpHtml = `
            <div class="notification-main-text" style="color:#2d8cf0;font-weight:500;">
                🔑 How to Get Your Steam API Token or Key
            </div>
            <div style="margin:10px 0;text-align:left;">
                <div style="margin-bottom:15px;">
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 1: Token (Recommended)
                    </div>
                    <div style="margin-bottom:8px;">
                        <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="privacy-link" target="_self" style="font-weight:600;text-decoration:underline;">Get your Steam Web API Token in the Steam client.</a>
                    </div>                    
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        On the opened page, press <strong>Ctrl+A</strong> (select all), then <strong>Ctrl+C</strong> (copy), and <strong>Ctrl+V</strong> to paste it into the Steam Web API Token / Key field.
                    </div>
                    <div style="color:#bfc9d8;font-size:0.95em;margin-left:10px;">
                        • The app will extract your token and SteamID automatically<br>
                        • Your friend list can stay private<br>
                        • A token is valid for about 24 hours
                    </div>
                </div>
                
                <div>
                    <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                        Option 2: API Key
                    </div>
                    <div style="margin-bottom:8px;">
                        <a href="steam://openurl/https://steamcommunity.com/dev/apikey" class="privacy-link" target="_self" style="font-weight:600;text-decoration:underline;">Get your Steam Web API Key in the Steam client.</a>
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        Register a new API key by entering <strong>localhost</strong> as your domain, accept the terms, and copy your key.
                    </div>
                    <div style="margin-bottom:8px;color:#f3f6fa;">
                        Click the <strong>SteamID64</strong> field label below to open your Steam profile, then copy your profile URL and paste it into the SteamID64 field.
                    </div>
                    <div style="color:#bfc9d8;font-size:0.95em;margin-left:10px;">
                        • You may need to confirm via Steam Guard or email<br>
                        • Set your friend list to public at least once for caching<br>
                        • Make it public again temporarily to update your friends list
                    </div>
                </div>
            </div>            <div class="note" style="color:#aaa;font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid #353a40;padding-top:10px;">
                Your credentials are stored locally only.<br>
                All requests are made only through the official Steam Web API.
            </div>
        `;
        this.showNotification(helpHtml, 'info');
    }
}

export default UIManager;