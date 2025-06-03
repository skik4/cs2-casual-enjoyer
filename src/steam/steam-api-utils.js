import { VALIDATION_PATTERNS } from '../shared/constants.js';

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
        }

        return {
            status: extract("status"),
            game_state: extract("game:state"),
            game_mode: extract("game:mode"),
            game_map: extract("game:map"),
            game_score: extract("game:score"),
            connect: extract("connect"),
            game_server_steam_id: extract("game_server_steam_id"),
        };
    }
}

export default SteamAPIUtils;
