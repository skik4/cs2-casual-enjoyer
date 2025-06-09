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
            <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="steam-token-link" target="_self">Get a new one</a><br>
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
     */    ERROR_MESSAGE: (errorMessage) => `
        <div class="notification-main-text" style="color:#ff4444;font-weight:500;">${errorMessage}</div>
    `,

    /**
     * Privacy settings link
     * @param {string} privacyUrl - Privacy settings URL
     * @returns {string} Privacy link HTML
     */
    PRIVACY_LINK: (privacyUrl) => `
        <a href="${privacyUrl}" class="privacy-link" target="_self" title="Open privacy settings in Steam">Open your Steam privacy settings</a>
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
    `,

    /**
     * CS2 Launch notification templates
     */
    CS2_LAUNCH: {
        /**
         * Initial state when asking user to launch CS2
         */
        INITIAL: {
            title: 'Launch CS2 First',
            message: 'You need to launch Counter-Strike 2 before joining your friend\'s game.',
            hint: 'Wait for the game to fully load before trying to join again.',
            launchButton: 'Launch CS2',
            cancelButton: 'Cancel'
        },

        /**
         * Loading state when CS2 is being launched
         */
        LAUNCHING: {
            title: 'Launching CS2...',
            message: 'Starting Counter-Strike 2. Please wait for the game to fully load.',
            hint: 'The notification will close automatically when CS2 is detected.',
            launchButton: '<span class="loading-spinner"></span> Launching...',
            cancelButton: 'Cancel'
        },

        /**
         * Complete CS2 launch notification HTML template
         * @returns {string} Complete CS2 notification HTML
         */
        FULL_TEMPLATE: () => `
            <div class="cs2-launch-content">
                <div class="cs2-launch-title">${NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.title}</div>
                <div class="cs2-launch-message">${NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.message}</div>
                <div class="cs2-launch-buttons">
                    <button id="launch-cs2-btn" class="action-btn btn-primary">${NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.launchButton}</button>
                    <button id="cancel-cs2-launch" class="action-btn">${NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.cancelButton}</button>
                </div>
                <div class="cs2-launch-hint">${NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.hint}</div>
            </div>
        `
    }
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
            <span class="notification-emoji">🆔</span> How to Get Your SteamID64
        </div>
        <div style="margin:10px 0;text-align:left;">
            <div style="margin-bottom:15px;">
                <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                    Option 1: Quick Link (Recommended)
                </div>                  
                <div style="margin-bottom:8px;">
                    <a href="steam://url/SteamIDMyProfile" class="steam-profile-link" target="_self" title="Open your Steam profile in the Steam client.">Open your Steam profile in the Steam client.</a>
                </div>
                <div style="margin-bottom:8px;color:#f3f6fa;">
                    Your profile will open in the Steam client. Click on the URL in the address bar at the top of the Steam window - this automatically copies it to your clipboard. Then paste it into the <strong>SteamID64</strong> field below.
                </div>                
                <ul style="color:#bfc9d8;font-size:0.95em;margin-left:10px;padding-left:20px;">
                    <li>Fast and automatic</li>
                    <li>Works with any Steam profile URL format</li>
                    <li>The app converts URLs to SteamID64 automatically</li>
                </ul>
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
            <span class="notification-emoji">🔑</span> How to Get Your Steam API Token or Key
        </div>
        <div style="margin:10px 0;text-align:left;">
            <div style="margin-bottom:15px;">                
            <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                    Option 1: Token (Recommended)
                </div>                  
                <div style="margin-bottom:8px;">
                    <a href="steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig" class="steam-token-link" target="_self" title="Get your Steam Web API Token in the Steam client.">Get your Steam Web API Token in the Steam client.</a>
                </div>
                <div style="margin-bottom:8px;color:#f3f6fa;">
                    On the opened page (may appear blank / black), press <strong>Ctrl+A</strong> then <strong>Ctrl+C</strong> to copy, and <strong>Ctrl+V</strong> to paste into the Token field.
                </div>                
                <ul style="color:#bfc9d8;font-size:0.95em;margin-left:10px;padding-left:20px;">
                    <li>The app will extract your token and SteamID automatically</li>
                    <li>Your friend list can stay private</li>
                    <li>A token is valid for about 24 hours</li>
                </ul>
            </div>
            
            <div>
                <div style="color:#2d8cf0;font-weight:600;margin-bottom:6px;">
                    Option 2: API Key
                </div>                  
                <div style="margin-bottom:8px;">
                    <a href="steam://openurl/https://steamcommunity.com/dev/apikey" class="steam-apikey-link" target="_self" title="Get your Steam Web API Key in the Steam client.">Get your Steam Web API Key in the Steam client.</a>
                </div>
                <div style="margin-bottom:8px;color:#f3f6fa;">
                    Register a new API key by entering <strong>localhost</strong> as your domain, accept the terms, and copy your key.
                </div>
                <div style="margin-bottom:8px;color:#f3f6fa;">
                    Click the <strong>SteamID64</strong> field label below to open your Steam profile, then copy your profile URL and paste it into the SteamID64 field.
                </div>                
                <ul style="color:#bfc9d8;font-size:0.95em;margin-left:10px;padding-left:20px;">
                    <li>You may need to confirm via Steam Guard or email</li>
                    <li>Set your friend list to public at least once for caching</li>
                    <li>Make it public again temporarily to update your friends list</li>
                </ul>
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
// TUTORIAL MANAGER TEMPLATES
// =============================================================================

export const TUTORIAL_TEMPLATES = {
    /**
     * Tutorial steps data
     */
    STEPS: [
        {
            title: "Welcome to CS2 Casual Enjoyer",
            content: `
                Quick tutorial on main features.<br>
                Use buttons below to navigate.
                <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                    Press Enter for next step, Esc to skip.
                </div>
            `,
            target: null,
            icon: "🎮"
        },
        {
            title: "Steam Web API Token / Key",
            content: "Click the highlighted text to open help with Steam link for token.",
            target: "#api-key-help",
            icon: "🔑"
        },
        {
            title: "Get Steam Web API Token",
            content: `
                Click highlighted text to open Steam.<br>
                It may appear black - press Ctrl+A then Ctrl+C to copy token.
            `,
            target: ".steam-token-link",
            icon: "🌐"
        },
        {
            title: "Paste Token",
            content: `
                Paste token into highlighted field.<br>
                Token expires in 24 hours, get new one when needed.
            `,
            target: "#auth",
            icon: "📋"
        },
        {
            title: "Update Friends List",
            content: "Click highlighted button to load friends from Steam with game status.",
            target: "#update-friends-btn",
            icon: "🔄"
        },
        {
            title: "Filter Friends",
            content: "Type in highlighted box to filter friends by nickname.",
            target: "#friend-filter-input",
            icon: "🔍"
        },
        {
            title: "Friends List Display",
            content: "Friends currently playing Casual or Deathmatch modes will appear in this list.",
            target: "#friends",
            icon: "👥"
        },
        {
            title: "Join to Friend Game",
            content: `
                For example, your best friend <strong>Gabe Newell</strong> is playing Casual on Dust 2.<br>
                Click 'Join' to automatically connect to his match!
            `,
            target: ".friend .action-btn",
            icon: "🚀"
        }, {
            title: "Connection Process",
            content: `
                Red dot = no slots available, Yellow = attempting to connect, Green = successfully connected.
                <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                    Yellow may stay for a while.<br>
                    Will change to red or green once server responds.<br>
                    Meanwhile, CS2 will show connection error dialogs (this is normal) - hold ESC to dismiss them all.
                </div>
            `,
            target: ".status-dot",
            icon: "🟡"
        },
        {
            title: "Tutorial Complete!",
            content: `
                Congratulations! You've completed the tutorial and learned all the main features.                
                <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                    Enjoy using CS2 Casual Enjoyer!<br>
                    If you like it, please share with your friends.
                </div>
                <div style='color:#aaa;font-size:0.95em;text-align:center;margin-top:15px;'>
                    <span style='color:#2d8cf0;cursor:pointer;text-decoration:underline;'
                        onclick='
                            navigator.clipboard.writeText("https://github.com/skik4/cs2-casual-enjoyer/releases");
                            const originalText = this.innerHTML;
                            this.style.color="#4caf50"; 
                            this.style.textDecoration="none";
                            this.innerHTML="📋 Copied to clipboard!";
                            setTimeout(() => {
                                this.style.color="#2d8cf0";
                                this.style.textDecoration="underline";
                                this.innerHTML=originalText;
                            }, 2000);
                          '>
                        GitHub Releases
                    </span>
                </div>
            `,
            target: null,
            icon: "🎉"
        }
    ],

    /**
     * Tutorial modal content
     * @param {string} icon - Tutorial step icon
     * @param {string} title - Tutorial step title
     * @param {number} currentStepNumber - Current step number (1-based)
     * @param {number} totalSteps - Total number of steps
     * @param {string} content - Tutorial step content
     * @param {boolean} isFirstStep - Whether this is the first step
     * @param {boolean} isLastStep - Whether this is the last step
     * @returns {string} Tutorial modal HTML
     */
    MODAL_CONTENT: (icon, title, currentStepNumber, totalSteps, content, isFirstStep, isLastStep) => `
        <div class="tutorial-header">
            <h3 class="tutorial-title">
                <span class="tutorial-icon">${icon || '📖'}</span>
                ${title}
            </h3>
            <div class="tutorial-progress">
                <span class="tutorial-step-counter">${currentStepNumber} of ${totalSteps}</span>
                <div class="tutorial-progress-bar">
                    <div class="tutorial-progress-fill" style="width: ${(currentStepNumber / totalSteps) * 100}%"></div>
                </div>
            </div>        
        </div>
        <div class="tutorial-content">${content}</div>        
        <div class="tutorial-controls">
            <button class="tutorial-btn tutorial-btn-secondary">
                Skip Tutorial
            </button>
            <div class="tutorial-nav-buttons">
                <button class="tutorial-btn tutorial-btn-secondary" 
                        ${isFirstStep ? 'disabled' : ''}>
                    ← Previous
                </button>
                <button class="tutorial-btn tutorial-btn-primary">
                    ${isLastStep ? 'Finish ✓' : 'Next →'}
                </button>
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
    FRIENDS_TEMPLATES,
    TUTORIAL_TEMPLATES
};
