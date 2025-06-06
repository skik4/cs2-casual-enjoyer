/**
 * HTML Templates module
 * Contains all HTML templates organized by module usage
 */

// =============================================================================
// NOTIFICATION MANAGER TEMPLATES
// =============================================================================

export const NOTIFICATION_TEMPLATES = {
    /**
     * Close button for notifications
     */
    CLOSE_BUTTON: `<div class="notification-header"><span class="notification-close-btn" title="Close">&times;</span></div>`,
    
    /**
     * Warning for expired token
     */
    TOKEN_EXPIRED_WARNING: `
        <div style="color:#ff4444;font-weight:500;margin-top:8px;">
            Your token has expired.<br>
            <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="privacy-link" target="_self">Get a new one</a><br>
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
                Steam Web API Token detected.<br>
                <span style="font-size:0.98em;">SteamID: <b>${steamid}</b></span><br>
                <span style="font-size:0.98em;">Token expires: <b>${expiresStr}</b></span>
            </div>
            ${warnHtml}
        </div>
    `,
    
    /**
     * Error message display
     * @param {string} errorMessage - Error message
     * @returns {string} Error message HTML
     */
    ERROR_MESSAGE: (errorMessage) => `
        <div class="notification-main-text" style="color:#ff4444;font-weight:500;">${errorMessage}</div>
    `,
    
    /**
     * Privacy settings link
     * @param {string} privacyUrl - Privacy settings URL
     * @returns {string} Privacy link HTML
     */
    PRIVACY_LINK: (privacyUrl) => `
        <a href="${privacyUrl}" class="privacy-link" style="color:#2d8cf0;text-decoration:underline;" 
            title="Open privacy settings in Steam">Open your Steam privacy settings</a>
    `,
    
    /**
     * Privacy warning with instructions
     * @param {string} linkHtml - Privacy link HTML
     * @returns {string} Privacy warning HTML
     */
    PRIVACY_WARNING: (linkHtml) => `
        <div class="notification-main-text" style="color:#ff4444;font-weight:500;">
            No friends list returned. This could be because your friends list is set to private.
        </div>            
        <div style="margin:8px 0 8px 0;">
            ${linkHtml}
        </div>            
        <div class="note" style="color:#aaa;font-size:0.95em;margin-bottom:2px;margin-top:15px;border-top:1px solid #353a40;padding-top:10px;">
            After setting your friends list to public, click "Update Friend List", then you can set it back to private.
        </div>
    `
};

// =============================================================================
// HELP MANAGER TEMPLATES
// =============================================================================

export const HELP_TEMPLATES = {
    /**
     * Help for getting Steam ID
     */
    STEAM_ID_HELP: `
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
    `,

    /**
     * Help for getting API key
     */
    API_KEY_HELP: `
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
        </div>            
        <div class="note" style="color:#aaa;font-size:0.95em;margin-top:15px;text-align:center;border-top:1px solid #353a40;padding-top:10px;">
            Your credentials are stored locally only.<br>
            All requests are made only through the official Steam Web API.
        </div>
    `
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
    FRIEND_ITEM: (steamid, avatarUrl, personaname, statusText, hasStatus, isMissing, isActive) => `
        <div class="friend" id="friend-${steamid}">
            <div class="friend-info-row">
                <img src="${avatarUrl}" alt="avatar" class="friend-avatar">
                <div class="friend-info">
                    <span class="personaname">${personaname}</span>
                    ${hasStatus ? `<span class="game-status" style="font-weight:400;color:#bfc9d8;">${statusText}</span>` : ''}
                </div>
            </div>
            <div class="join-section" id="join-section-${steamid}">
                <span class="status-dot ${isMissing ? 'dot-missing' : 'dot-cancelled'}" id="dot-${steamid}"></span>
                <button id="join-btn-${steamid}" class="action-btn${isActive ? ' cancel-btn' : ''}">${isActive ? 'Cancel' : 'Join'}</button>
            </div>
        </div>
    `
};

// =============================================================================
// EXPORT ALL TEMPLATES
// =============================================================================

export default {
    NOTIFICATION_TEMPLATES,
    HELP_TEMPLATES,
    FRIENDS_TEMPLATES
};
