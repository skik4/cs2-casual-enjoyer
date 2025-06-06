import { VALIDATION_PATTERNS } from '../shared/constants.js';

/**
 * Input validation utilities
 */
class Validators {
    /**
     * Validate SteamID64 format
     * @param {string} steamId - Steam ID to validate
     * @returns {boolean} - Whether the Steam ID is valid
     */
    static validateSteamId(steamId) {
        if (typeof steamId !== 'string') return false;
        return VALIDATION_PATTERNS.STEAM_ID.test(steamId);
    }

    /**
     * Validate API key or Web API token format
     * @param {string} auth - API key or token to validate
     * @returns {boolean} - Whether the auth is valid
     */
    static validateApiAuth(auth) {
        if (typeof auth !== 'string') return false;
        
        // Check for Web API token in JSON format
        try {
            const parsed = JSON.parse(auth);
            if (parsed?.data?.webapi_token) {
                return VALIDATION_PATTERNS.WEB_API_TOKEN.test(parsed.data.webapi_token);
            }
        } catch {
            // Not JSON, continue with other validations
        }

        // Check for direct API key or token
        return VALIDATION_PATTERNS.API_KEY.test(auth) || 
               VALIDATION_PATTERNS.WEB_API_TOKEN.test(auth);
    }

    /**
     * Validate Steam profile URL and extract Steam ID if possible
     * @param {string} url - Steam profile URL
     * @returns {Object} - Validation result with extracted Steam ID or vanity URL
     */
    static validateSteamUrl(url) {
        if (typeof url !== 'string') {
            return { valid: false, error: 'URL must be a string' };
        }

        if (!url.includes('steamcommunity.com')) {
            return { valid: false, error: 'Not a Steam Community URL' };
        }

        // Check for direct Steam ID URL
        const steamIdMatch = url.match(/\/profiles\/(\d{17})/);
        if (steamIdMatch && steamIdMatch[1]) {
            return { 
                valid: true, 
                type: 'steamid', 
                value: steamIdMatch[1] 
            };
        }

        // Check for vanity URL
        const vanityMatch = url.match(/\/id\/([^\/]+)/);
        if (vanityMatch && vanityMatch[1]) {
            return { 
                valid: true, 
                type: 'vanity', 
                value: vanityMatch[1] 
            };
        }

        return { valid: false, error: 'Unrecognized Steam URL format' };
    }

    /**
     * Validate required fields for app functionality
     * @param {Object} fields - Fields to validate
     * @param {string} fields.steamId - Steam ID
     * @param {string} fields.auth - API auth
     * @returns {Object} - Validation result
     */
    static validateRequiredFields({ steamId, auth }) {
        const result = {
            valid: true,
            errors: []
        };

        if (!steamId || !this.validateSteamId(steamId)) {
            result.valid = false;
            result.errors.push('Valid SteamID64 is required');
        }

        if (!auth || !this.validateApiAuth(auth)) {
            result.valid = false;
            result.errors.push('Valid API Key or Token is required');
        }

        return result;
    }

    /**
     * Check if a string is a Web API token format
     * @param {string} token - Token to check
     * @returns {boolean} - Whether it's a Web API token
     */
    static isWebApiToken(token) {
        if (typeof token !== 'string') return false;
        return VALIDATION_PATTERNS.WEB_API_TOKEN.test(token);
    }

    /**
     * Check if a string is an API key format
     * @param {string} key - Key to check
     * @returns {boolean} - Whether it's an API key
     */
    static isApiKey(key) {
        if (typeof key !== 'string') return false;
        return VALIDATION_PATTERNS.API_KEY.test(key);
    }
}

export default Validators; 