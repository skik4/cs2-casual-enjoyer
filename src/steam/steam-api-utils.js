import { VALIDATION_PATTERNS, API_CONFIG } from '../shared/constants.js';

/**
 * Steam API utilities and parsers
 * Contains helper functions for parsing and validating Steam data
 */
class SteamAPIUtils {
    /**
     * Check if the string is a JWT-like webapi_token
     * @param {string} keyOrToken - String to check
     * @returns {boolean} - Whether it's a Web API token
     */
    static isWebApiToken(keyOrToken) {
        return VALIDATION_PATTERNS.WEB_API_TOKEN.test(keyOrToken);
    }

    /**
     * Extract webapi_token from input (JSON or token string)
     * @param {string} authInput - Auth input to parse
     * @returns {string|null} - Extracted token or null
     */
    static extractTokenIfAny(authInput) {
        try {
            const parsed = JSON.parse(authInput);
            if (parsed?.data?.webapi_token) return parsed.data.webapi_token;
        } catch {
            // Not JSON, continue
        }
        
        if (this.isWebApiToken(authInput)) return authInput;
        return null;
    }

    /**
     * Extract API key or token from input (JSON, token, or key)
     * @param {string} authInput - Auth input to parse
     * @returns {string} - Extracted auth value
     */
    static extractApiKeyOrToken(authInput) {
        try {
            const parsed = JSON.parse(authInput);
            if (parsed?.data?.webapi_token) return parsed.data.webapi_token;
        } catch {
            // Not JSON, continue
        }
        
        return authInput;
    }

    /**
     * Parse JWT webapi_token for steamid and expiry
     * @param {string} token - Token to parse
     * @returns {import('../shared/types.js').TokenInfo|null} - Parsed token info or null
     */
    static parseWebApiToken(token) {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        try {
            const payload = JSON.parse(atob(parts[1]));
            return {
                steamid: payload.sub,
                expires: payload.exp,
                expiresDate: new Date(payload.exp * 1000)
            };
        } catch {
            return null;
        }
    }

    /**
     * Parse Rich Presence data from Steam
     * @param {string} kv - Key-value string from Steam rich presence
     * @returns {Object} - Parsed rich presence fields
     */
    static parseRichPresence(kv) {
        function extract(key) {
            const re = new RegExp('"' + key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '"\\s+"([^"]+)"');
            const m = kv.match(re);
            return m ? m[1] : null;
        }        return {
            status: extract("status"),
            game_state: extract("game:state"),
            game_mode: extract("game:mode"),
            game_map: extract("game:map"),
            game_score: extract("game:score"),
            connect: extract("connect"),
            game_server_steam_id: extract("game_server_steam_id"),
        };
    }

    /**
     * Build URL with parameters for Steam API request
     * @param {Object} config - Request configuration
     * @param {string} auth - API key or token
     * @returns {string} - Complete URL with parameters
     */
    static buildApiUrl(config, auth) {
        const isToken = this.isWebApiToken(auth);
        
        // Handle unified configuration (when key and token use same endpoint/params)
        let authConfig;
        if (config.unified) {
            authConfig = config.unified;
        } else {
            authConfig = isToken ? config.token : config.key;
        }

        if (!authConfig) {
            throw new Error(`No ${isToken ? 'token' : 'key'} configuration provided for ${config.method}`);
        }

        // Build URL and parameters
        let url = `${API_CONFIG.STEAM_API_BASE}${authConfig.endpoint}`;
        const params = new URLSearchParams();

        // Add authentication
        if (isToken) {
            params.append('access_token', auth);
        } else {
            params.append('key', auth);
        }

        // Add method-specific parameters
        if (authConfig.params) {
            Object.entries(authConfig.params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    params.append(key, value);
                }
            });
        }

        // Construct final URL
        return `${url}?${params.toString()}`;
    }

    /**
     * Mask sensitive authentication data in URLs for logging
     * @param {string} url - URL to mask
     * @returns {string} - URL with masked authentication
     */
    static maskAuthInUrl(url) {
        return url.replace(/(key|access_token)=[^&]+/g, '$1=***');
    }

    /**
     * Extract Steam IDs from friends list response data
     * @param {Object} rawData - Raw friends list response
     * @param {boolean} isToken - Whether response is from token API
     * @returns {string[]} - Array of Steam IDs
     */
    static extractFriendIds(rawData, isToken) {
        let friendIds = [];

        if (isToken) {
            // Token API response format
            if (!rawData.response?.friendslist?.friends || !Array.isArray(rawData.response.friendslist.friends)) {
                return [];
            }

            // Filter to only confirmed friends (efriendrelationship: 3)
            const allFriends = rawData.response.friendslist.friends;
            const confirmedFriends = allFriends.filter(f => f.efriendrelationship === 3);
            friendIds = confirmedFriends.map(f => f.ulfriendid);
        } else {
            // API Key response format
            if (!rawData.friendslist?.friends) {
                return [];
            }

            // Filter to only confirmed friends (relationship: "friend")
            const allFriends = rawData.friendslist.friends;
            const confirmedFriends = allFriends.filter(f => f.relationship === "friend");
            friendIds = confirmedFriends.map(f => f.steamid);
        }

        return friendIds;
    }

    /**
     * Extract players array from player summaries response
     * @param {Object} rawData - Raw player summaries response
     * @returns {Object[]} - Array of player objects
     */
    static extractPlayersFromSummaries(rawData) {
        // Handle different response formats based on auth type
        if (Array.isArray(rawData.players)) {
            // Token response format
            return rawData.players;
        } else if (rawData.response && Array.isArray(rawData.response.players)) {
            // API key response format
            return rawData.response.players;
        }
        
        return [];
    }

    /**
     * Check if player is in CS2 based on game_id
     * @param {Object} privateData - Player's private data
     * @returns {boolean} - True if player is in CS2
     */
    static isPlayerInCS2(privateData) {
        return privateData?.game_id === "730";
    }

    /**
     * Check if player is in supported game mode (casual or deathmatch) and not in lobby
     * @param {Object} richPresence - Parsed rich presence data
     * @returns {boolean} - True if in supported mode
     */
    static isInSupportedMode(richPresence) {
        return (richPresence.game_mode === "casual" || richPresence.game_mode === "deathmatch") &&
               !["", null, "lobby"].includes(richPresence.game_state);
    }

    /**
     * Check if join is available for a player
     * @param {Object} richPresence - Parsed rich presence data
     * @returns {boolean} - True if join is available
     */
    static isJoinAvailable(richPresence) {
        return this.isInSupportedMode(richPresence) && 
               richPresence.connect?.startsWith("+gcconnect");
    }

    /**
     * Extract best available avatar from player data
     * @param {Object} playerData - Player data object
     * @returns {string} - Avatar URL or empty string
     */
    static extractBestAvatar(playerData) {
        return playerData?.avatarfull || 
               playerData?.avatar || 
               playerData?.avatarmedium || 
               "";
    }

    /**
     * Filter Steam IDs that need avatar data fetching
     * @param {string[]} steamIds - Array of Steam IDs
     * @param {Object} avatarsCache - Existing avatars cache
     * @returns {string[]} - Steam IDs that need avatar fetching
     */
    static filterMissingAvatars(steamIds, avatarsCache) {
        return steamIds.filter(steamid => !avatarsCache[steamid]);
    }

    /**
     * Create debug info for player from account data
     * @param {Object} account - Account data from API
     * @returns {Object} - Debug info object
     */
    static createPlayerDebugInfo(account) {
        const pub = account.public_data || {};
        const priv = account.private_data || {};
        const richPresence = this.parseRichPresence(priv.rich_presence_kv || "");
        
        return {
            name: pub.persona_name || 'Unknown',
            steamid: pub.steamid,
            game_name: priv.game_id === "730" ? "CS2" :
                      priv.game_id ? `Game ${priv.game_id}` : "Not in game",
            game_mode: richPresence.game_mode || 'Unknown',
            game_state: richPresence.game_state || 'Unknown',
            in_supported_mode: this.isInSupportedMode(richPresence)
        };
    }    /**
     * Handle HTTP response status and errors
     * @param {Response} response - Fetch response object
     * @param {Object} config - Request configuration
     * @param {Object} context - Additional context for logging
     * @returns {boolean} - True if response is OK, false if handled error with allowFailure
     * @throws {Error} - For unhandled errors or custom error handlers
     */
    static handleHttpResponse(response, config, context = {}) {
        if (response.ok) {
            return true;
        }

        // Check for custom error handlers first
        if (config.errorHandlers && config.errorHandlers[response.status]) {
            throw config.errorHandlers[response.status]();
        }

        // Handle allowFailure cases
        if (config.allowFailure) {
            return false;
        }

        // Import here to avoid circular dependency
        const ErrorHandler = require('../utils/error-handler.js').default;
        
        // Default error handling
        throw ErrorHandler.createError(`API_ERROR_${response.status}`, 
            `${config.method} failed: ${response.status} ${response.statusText}`);
    }
}

export default SteamAPIUtils;
