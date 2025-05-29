import SteamAPI from '../steam/steam-api.js';
import UIManager from '../ui/ui-manager.js';
import JoinManager from '../game/join-manager.js';
import stateManager from './state-manager.js';
import Validators from '../utils/validators.js';
import ErrorHandler from '../utils/error-handler.js';
import logger from '../utils/logger.js';

/**
 * Main application module
 * Coordinates all other modules and handles app lifecycle
 */
class App {
    constructor() {
        this.initialized = false;
    }

    /**
     * Get Steam ID from input
     * @returns {string} - Steam ID value
     */
    getSteamId() {
        const steamIdInput = document.getElementById('steam_id');
        return steamIdInput ? steamIdInput.value.trim() : '';
    }

    /**
     * Get API auth from input
     * @returns {string} - API auth value
     */
    getAuth() {
        const authInput = document.getElementById('auth');
        if (!authInput) return '';
        return SteamAPI.extractApiKeyOrToken(authInput.value.trim());
    }

    /**
     * Fetch and render friends by their IDs
     * @param {string[]} friendIds - Array of friend Steam IDs
     * @param {string} auth - API key or token
     * @param {boolean} [keepStates=false] - Whether to preserve join states
     * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of friends
     */
    async fetchAndRenderFriendsByIds(friendIds, auth, keepStates = false) {
        if (!friendIds || !friendIds.length) {
            logger.error('App', "No friend IDs provided to fetchAndRenderFriendsByIds");
            return [];
        }

        try {
            const savedAvatars = stateManager.getState('savedAvatars');
            const allStatuses = await SteamAPI.getFriendsStatuses(friendIds, auth, savedAvatars);

            const casualFriends = allStatuses.filter(friend => friend.in_casual_mode);

            stateManager.setState('friendsData', casualFriends);

            const joinStates = keepStates ? JoinManager.getJoinStates() : {};

            UIManager.renderFriendsList(casualFriends, joinStates);

            logger.info('App', `Friends update completed: ${casualFriends.length} casual friends found, ${casualFriends.filter(f => f.join_available).length} joinable`);

            return casualFriends;
        } catch (error) {
            ErrorHandler.logError('App.fetchAndRenderFriendsByIds', error);
            if (!keepStates) UIManager.showError(error.message || error);
            throw error;
        }
    }

    /**
     * Update friends list
     */
    async updateFriendsList() {
        let steam_id = this.getSteamId();
        let auth = this.getAuth();

        const savedSettings = stateManager.getState('savedSettings');
        if ((!steam_id || !auth) && savedSettings) {
            if (!steam_id && savedSettings.steam_id) steam_id = savedSettings.steam_id;
            if (!auth && savedSettings.auth) auth = savedSettings.auth;
        }

        auth = SteamAPI.extractApiKeyOrToken(auth);

        if (!steam_id || !auth) {
            UIManager.showError("Please enter your SteamID64 and API Key");
            return;
        }

        const validation = Validators.validateRequiredFields({ steamId: steam_id, auth });
        if (!validation.valid) {
            UIManager.showError(validation.errors.join('. '));
            return;
        }

        // Check if settings changed
        if (savedSettings &&
            (savedSettings.steam_id !== steam_id || savedSettings.auth !== auth)) {
            localStorage.removeItem('hide_privacy_warning');
            stateManager.setState('usingSavedFriends', false);
        }

        const updateBtn = document.getElementById('updateFriendsBtn');
        if (updateBtn) {
            updateBtn.disabled = true;
            updateBtn.textContent = "Updating...";
        }

        try {
            let allFriendIds = [];
            try {
                allFriendIds = await SteamAPI.getFriendsList(steam_id, auth);
                UIManager.hideError();
            } catch (err) {
                UIManager.showError(err, steam_id);
                return;
            } finally {
                if (updateBtn) {
                    updateBtn.disabled = false;
                    updateBtn.textContent = "Update Friends List";
                }
            }

            if (!allFriendIds.length) {
                UIManager.showError("No friends found in your friends list.", steam_id);
                return;
            }

            // Get avatars
            const avatarsMap = await SteamAPI.getPlayerSummaries(allFriendIds, auth);
            const savedAvatars = {};
            for (const sid of allFriendIds) {
                if (avatarsMap[sid]) {
                    savedAvatars[sid] = {
                        avatarfull: avatarsMap[sid].avatarfull
                    };
                }
            }

            // Update state
            stateManager.batchUpdate({
                savedFriendsIds: allFriendIds,
                savedAvatars: savedAvatars,
                usingSavedFriends: true
            });

            // Get friend statuses
            const statuses = await SteamAPI.getFriendsStatuses(allFriendIds, auth, savedAvatars);
            const casualFriends = statuses.filter(friend => friend.in_casual_mode);

            // Save settings
            const saveResult = await window.electronAPI.saveSettings({
                steam_id,
                auth: auth,
                friends_ids: allFriendIds,
                avatars: savedAvatars
            });

            // Reset join states
            JoinManager.resetAll();

            // Render friends
            stateManager.setState('friendsData', casualFriends);
            const joinStates = JoinManager.getJoinStates();
            UIManager.renderFriendsList(casualFriends, joinStates);

            this.startAutoRefresh();
        } catch (error) {
            ErrorHandler.logError('App.updateFriendsList', error);
            UIManager.showError(error.message || error, steam_id);
        } finally {
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = "Update Friends List";
            }
        }
    }

    /**
     * Start auto-refresh for friends list
     */
    async startAutoRefresh() {
        const auth = this.getAuth();
        UIManager.updateFriendsStatus('Loading friends in Casual mode...');

        const savedFriendsIds = stateManager.getState('savedFriendsIds');
        logger.info('App', `Starting auto-refresh with ${savedFriendsIds.length} saved friends`);

        try {
            await this.fetchAndRenderFriendsByIds(savedFriendsIds, auth, true);

            // Clear existing interval
            stateManager.clearRefreshInterval();

            // Set new interval
            const autoRefreshIntervalMs = stateManager.getState('autoRefreshIntervalMs');
            const interval = setInterval(async () => {
                const usingSavedFriends = stateManager.getState('usingSavedFriends');
                const currentSavedFriendsIds = stateManager.getState('savedFriendsIds');

                if (usingSavedFriends && currentSavedFriendsIds.length) {
                    try {
                        await this.fetchAndRenderFriendsByIds(currentSavedFriendsIds, auth, true);
                    } catch (error) {
                        logger.warn('App', "Auto-refresh fetch failed", { error: error.message });
                    }
                }
            }, autoRefreshIntervalMs);

            stateManager.setState('friendsRefreshInterval', interval);
            logger.info('App', "Auto-refresh of casual friends status started");
        } catch (error) {
            logger.error('App', "Failed to start auto-refresh", { error: error.message });
            throw error;
        }
    }

    /**
     * Setup all app event listeners
     */
    setupEventListeners() {
        const updateFriendsBtn = document.getElementById('updateFriendsBtn');
        const steamIdInput = document.getElementById('steam_id');
        const authInput = document.getElementById('auth');

        if (updateFriendsBtn) {
            updateFriendsBtn.addEventListener('click', () => this.updateFriendsList());
        }

        if (steamIdInput) {
            steamIdInput.addEventListener('input', this.validateInputs.bind(this));
            steamIdInput.addEventListener('paste', this.handleSteamIdPaste.bind(this));
        }

        if (authInput) {
            authInput.addEventListener('input', this.validateInputs.bind(this));
            authInput.addEventListener('input', this.handleAuthInput.bind(this));
        }

        // Help links
        const steamIdHelp = document.querySelector('.param-label-text[title*="Steam profile"]');
        if (steamIdHelp) {
            steamIdHelp.addEventListener('click', UIManager.showSteamIdHelp);
        }

        const apiKeyHelp = document.querySelector('.param-label-text[title*="API Key"]');
        if (apiKeyHelp) {
            apiKeyHelp.addEventListener('click', (e) => {
                e.preventDefault();
                UIManager.showApiKeyHelp();
            });
        }
    }

    /**
     * Handle Steam ID paste event
     * @param {ClipboardEvent} event - Paste event
     */
    async handleSteamIdPaste(event) {
        const pastedText = (event.clipboardData || window.clipboardData).getData('text');
        if (!pastedText.includes('steamcommunity.com')) return;

        event.preventDefault();

        const urlValidation = Validators.validateSteamUrl(pastedText);
        if (!urlValidation.valid) {
            UIManager.showError(urlValidation.error);
            return;
        }

        const steamIdInput = document.getElementById('steam_id');
        if (!steamIdInput) return;

        if (urlValidation.type === 'steamid') {
            steamIdInput.value = urlValidation.value;
            this.validateInputs();
        } else if (urlValidation.type === 'vanity') {
            const auth = this.getAuth();
            if (!auth) {
                UIManager.showError("Please enter your API Key first to resolve vanity URLs");
                return;
            }

            const originalValue = steamIdInput.value;
            steamIdInput.value = "Resolving vanity URL...";
            steamIdInput.disabled = true;

            try {
                const steamId = await SteamAPI.resolveVanityUrl(urlValidation.value, auth);
                if (steamId) {
                    steamIdInput.value = steamId;
                    UIManager.hideError();
                } else {
                    steamIdInput.value = originalValue;
                    UIManager.showError("Could not resolve vanity URL. Please enter SteamID64 manually.");
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
        const authInput = document.getElementById('auth');
        if (!authInput) return;

        const val = authInput.value.trim();
        const token = SteamAPI.extractTokenIfAny(val);

        // Reset join states when auth changes
        JoinManager.resetAll();

        if (token) {
            const info = SteamAPI.parseWebApiToken(token);
            if (info && info.steamid) {
                const steamIdInput = document.getElementById('steam_id');
                if (steamIdInput && (!steamIdInput.value || steamIdInput.value !== info.steamid)) {
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
        const updateBtn = document.getElementById('updateFriendsBtn');

        const validSteamId = Validators.validateSteamId(steamId);
        const validApiKey = Validators.validateApiAuth(auth);
        const savedSettings = stateManager.getState('savedSettings');
        const hasSaved = savedSettings && savedSettings.steam_id && savedSettings.auth;

        // Check for token expiration
        let isTokenExpired = false;
        const authInput = document.getElementById('auth');
        const val = authInput ? authInput.value.trim() : '';
        const token = SteamAPI.extractTokenIfAny(val);

        // Also check saved settings for token expiration
        let savedToken = null;
        if (!token && savedSettings && savedSettings.auth) {
            savedToken = SteamAPI.extractTokenIfAny(savedSettings.auth);
        }

        const tokenToCheck = token || savedToken;

        if (tokenToCheck) {
            const info = SteamAPI.parseWebApiToken(tokenToCheck);
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
        const enableBtn = ((validSteamId && validApiKey) || hasSaved) && !isTokenExpired;

        if (updateBtn) updateBtn.disabled = !enableBtn;

        // Update input field styles
        const steamIdInput = document.getElementById('steam_id');
        if (steamIdInput) {
            if (steamId && validSteamId) {
                steamIdInput.classList.remove('invalid-input');
                steamIdInput.classList.add('valid-input');
            } else {
                steamIdInput.classList.remove('valid-input');
                if (steamId) steamIdInput.classList.add('invalid-input');
                else steamIdInput.classList.remove('invalid-input');
            }
        }

        if (authInput) {
            // Remove all validation classes first
            authInput.classList.remove('invalid-input', 'valid-input', 'expired-token-input');

            if (authInput.value.trim()) {
                if (validApiKey) {
                    // Valid token/key - check if expired
                    if (isTokenExpired) {
                        authInput.classList.add('expired-token-input');
                    } else {
                        authInput.classList.add('valid-input');
                    }
                } else {
                    // Invalid token/key
                    authInput.classList.add('invalid-input');
                }
            }
        }

        // Update status message based on token/key state
        this.updateStatusMessage(auth, validApiKey, isTokenExpired, hasSaved);

        // Check if we should start auto-refresh
        this.checkAndStartAutoRefresh(hasSaved, validSteamId, validApiKey, isTokenExpired);
    }

    /**
     * Update status message based on auth state
     */
    updateStatusMessage(auth, validApiKey, isTokenExpired, hasSaved) {
        // Don't update status if we have valid saved settings, no current input, and no token expiration
        if (hasSaved && !auth && !isTokenExpired) {
            return;
        }

        if (!auth && !hasSaved) {
            // No auth input and no saved settings
            logger.info('App', 'Status: No auth input and no saved settings');
            UIManager.updateFriendsStatus(
                'Enter your <b>Steam Web API Token</b> (recommended) or <b>API Key</b> (with Steam ID),<br>' +
                'then click <b>Update Friends List</b>.<br>' +
                'To get them, click <b>Steam Web API Token / Key</b> or <b>SteamID64</b> above.'
            );
        } else if (auth && !validApiKey) {
            // Invalid auth input
            logger.info('App', 'Status: Invalid auth input provided');
            UIManager.updateFriendsStatus(
                'Enter your <b>Steam Web API Token</b> (recommended) or <b>API Key</b> (with Steam ID),<br>' +
                'then click <b>Update Friends List</b>.<br>' +
                'To get them, click <b>Steam Web API Token / Key</b> or <b>SteamID64</b> above.'
            );
        } else if ((auth && validApiKey && isTokenExpired) || (!auth && hasSaved && isTokenExpired)) {
            // Valid but expired token (current input) OR saved expired token (no current input)
            logger.info('App', 'Status: Token is expired', {
                hasCurrentAuth: !!auth,
                hasSavedSettings: hasSaved,
                isExpired: isTokenExpired
            });
            UIManager.updateFriendsStatus('Your Steam Web API Token is expired. Please get a new one, paste and click "Update Friends List".');
        }
    }

    /**
     * Check validation and start auto-refresh if conditions are met
     */
    checkAndStartAutoRefresh(hasSaved, validSteamId, validApiKey, isTokenExpired) {
        const initialLoadAttempted = stateManager.getState('initialLoadAttempted');
        
        // Don't start auto-refresh if we already attempted initial load
        if (initialLoadAttempted) {
            return;
        }

        // Check if we have valid conditions for auto-refresh
        const hasValidCurrentInputs = validSteamId && validApiKey && !isTokenExpired;
        const hasValidSavedSettings = hasSaved && !isTokenExpired;
        const savedFriendsIds = stateManager.getState('savedFriendsIds');
        const hasSavedFriends = savedFriendsIds && savedFriendsIds.length > 0;

        // Start auto-refresh if:
        // 1. We have valid current inputs, OR
        // 2. We have valid saved settings AND saved friends list
        if (hasValidCurrentInputs || (hasValidSavedSettings && hasSavedFriends)) {
            logger.info('App', 'Starting auto-refresh - validation passed', {
                hasValidCurrentInputs,
                hasValidSavedSettings,
                hasSavedFriends,
                friendsCount: savedFriendsIds?.length || 0
            });

            setTimeout(() => {
                stateManager.setState('initialLoadAttempted', true);
                this.startAutoRefresh()
                    .catch(error => {
                        logger.error('App', 'Auto-refresh startup failed: ' + error.message);
                    });
            }, 500);
        } else {
            logger.info('App', 'Auto-refresh not started - validation failed', {
                hasValidCurrentInputs,
                hasValidSavedSettings,
                hasSavedFriends,
                isTokenExpired
            });
        }
    }

    /**
     * Initialize the application
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Disable update button initially
            const updateFriendsBtn = document.getElementById('updateFriendsBtn');
            if (updateFriendsBtn) updateFriendsBtn.disabled = true;

            // Setup event listeners
            this.setupEventListeners();

            // Load settings
            const savedSettings = await window.electronAPI.loadSettings();
            logger.info('App', 'Settings loaded: ' + JSON.stringify(savedSettings ? {
                has_steam_id: !!savedSettings.steam_id,
                has_auth: !!savedSettings.auth,
                friend_count: savedSettings.friends_ids?.length || 0
            } : null));

            stateManager.setState('savedSettings', savedSettings);

            if (savedSettings) {
                // Fill inputs with saved data
                const steamIdInput = document.getElementById('steam_id');
                const authInput = document.getElementById('auth');

                if (savedSettings.steam_id && steamIdInput) {
                    steamIdInput.value = savedSettings.steam_id;
                }

                if (savedSettings.auth && authInput) {
                    authInput.value = savedSettings.auth;
                }

                if (savedSettings.friends_ids && Array.isArray(savedSettings.friends_ids)) {
                    stateManager.batchUpdate({
                        savedFriendsIds: savedSettings.friends_ids,
                        usingSavedFriends: true
                    });
                }

                if (savedSettings.avatars && typeof savedSettings.avatars === 'object') {
                    stateManager.setState('savedAvatars', savedSettings.avatars);
                }
            }

            // Call validateInputs at the end to set proper status and UI state
            this.validateInputs();

            this.initialized = true;
        } catch (error) {
            logger.error('App', 'Error during app initialization: ' + error.message);
            UIManager.showError('Failed to initialize app: ' + error.message);
        }
    }
}

// Create app instance and initialize when DOM is ready
const app = new App();

document.addEventListener('DOMContentLoaded', async () => {
    await app.initialize();
});

// Export for external access
export default app;