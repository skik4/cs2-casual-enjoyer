import { API_CONFIG, ERROR_CODES } from '../shared/constants.js';
import ErrorHandler from '../utils/error-handler.js';
import logger from '../utils/logger.js';
import SteamAPIUtils from './steam-api-utils.js';
import SteamAPIResponseProcessor from './steam-api-response-processor.js';

/**
 * Steam API client for making requests to Steam API
 * Contains all methods that perform HTTP requests to Steam services
 */
class SteamAPIClient {
    /**
     * Universal method for making Steam API requests
     * Handles authentication, error handling, and logging for all API calls
     * @param {Object} config - Configuration for the API request
     * @param {string} auth - API key or token
     * @param {Object} [context] - Additional context for logging
     * @returns {Promise<Object>} - Parsed JSON response
     * @private
     */
    static async _makeApiRequest(config, auth, context = {}) {
        const isToken = SteamAPIUtils.isWebApiToken(auth);

        try {
            // Build URL using utility function
            const url = SteamAPIUtils.buildApiUrl(config, auth);

            // Log request (before making it)
            logger.info('SteamAPI', `Making ${config.method} request`, {
                ...context,
                isToken,
                endpoint: config.unified?.endpoint || (isToken ? config.token?.endpoint : config.key?.endpoint)
            });

            // Make the request
            const resp = await fetch(url);

            // Handle HTTP errors using utility function
            try {
                const isOk = SteamAPIUtils.handleHttpResponse(resp, config, context);
                if (!isOk) {
                    // allowFailure case
                    logger.warn('SteamAPI', `${config.method} request failed with status ${resp.status}`, {
                        ...context,
                        status: resp.status,
                        statusText: resp.statusText
                    });
                    return null;
                }
            } catch (error) {
                // Custom error handler or default error
                if (config.errorHandlers && config.errorHandlers[resp.status]) {
                    logger.warn('SteamAPI', `${config.method} request failed with status ${resp.status}`, {
                        ...context,
                        status: resp.status,
                        statusText: resp.statusText
                    });
                } else {
                    logger.error('SteamAPI', `${config.method} request failed with status ${resp.status}`, {
                        ...context,
                        status: resp.status,
                        statusText: resp.statusText
                    });
                }
                throw error;
            }

            // Parse response
            const data = await resp.json();

            // Log response (with masked auth tokens)
            logger.trace('SteamAPI', `Raw ${config.method} response`, {
                url: SteamAPIUtils.maskAuthInUrl(url),
                response: data
            });

            return data;
        } catch (error) {
            logger.error('SteamAPI', `${config.method} error: ${error.message}`, {
                ...context,
                isToken,
                error
            });
            throw error;
        }
    }

    /**
     * Get the user's friends list
     * @param {string} steam_id - Steam ID of the user
     * @param {string} auth - API key or token
     * @returns {Promise<string[]>} - Array of friend Steam IDs
     */
    static async getFriendsList(steam_id, auth) {
        const config = {
            method: 'GetFriendsList',
            key: {
                endpoint: '/ISteamUser/GetFriendList/v1/',
                params: {
                    steamid: steam_id,
                    relationship: 'friend'
                }
            },
            token: {
                endpoint: '/IFriendsListService/GetFriendsList/v1/',
                params: {}
            },
            errorHandlers: {
                401: () => ErrorHandler.createError(ERROR_CODES.PRIVATE_FRIENDS_LIST)
            }
        };

        const data = await this._makeApiRequest(config, auth, { steam_id });
        const isToken = SteamAPIUtils.isWebApiToken(auth);

        return SteamAPIResponseProcessor.processFriendsListResponse(data, isToken);
    }

    /**
     * Fetch player summaries for up to 100 SteamIDs at a time
     * @param {string[]|string} steamids - Steam IDs to fetch
     * @param {string} auth - API key or token
     * @returns {Promise<Object>} - Map of Steam ID to player data
     */
    static async getPlayerSummaries(steamids, auth) {
        // Normalize input
        if (!Array.isArray(steamids)) {
            if (typeof steamids === "string" && steamids.length > 0) {
                steamids = [steamids];
            } else {
                return {};
            }
        }

        if (!steamids.length) return {};

        logger.info('SteamAPI', `Getting player summaries for ${steamids.length} players`);

        const result = {};

        try {
            // Process in chunks of 100
            for (let i = 0; i < steamids.length; i += 100) {
                const chunk = steamids.slice(i, i + 100).map(String);
                const chunkIndex = Math.floor(i / 100) + 1;
                const totalChunks = Math.ceil(steamids.length / 100);

                const config = {
                    method: 'GetPlayerSummaries',
                    key: {
                        endpoint: '/ISteamUser/GetPlayerSummaries/v2/',
                        params: {
                            steamids: chunk.join(',')
                        }
                    },
                    token: {
                        endpoint: '/ISteamUserOAuth/GetUserSummaries/v1/',
                        params: {
                            steamids: chunk.join(',')
                        }
                    },
                    allowFailure: true
                };

                logger.info('SteamAPI', `Fetching player summaries chunk ${chunkIndex}/${totalChunks} (${chunk.length} players)`);

                const data = await this._makeApiRequest(config, auth, {
                    chunkIndex,
                    totalChunks,
                    chunkSize: chunk.length
                });
                if (!data) {
                    logger.warn('SteamAPI', `GetPlayerSummaries chunk ${chunkIndex} failed`);
                    continue;
                }

                const players = SteamAPIResponseProcessor.processPlayerSummariesResponse(data, chunkIndex);

                for (const player of players) {
                    result[player.steamid] = player;
                }
            }

            logger.info('SteamAPI', `Player summaries completed: ${Object.keys(result).length}/${steamids.length} players received`);
        } catch (error) {
            logger.error('SteamAPI', `getPlayerSummaries error: ${error.message}`, { steamidsCount: steamids.length, error });
            throw error;
        }

        return result;
    }

    /**
     * Private method to get player link details
     * @param {string|string[]} steamids - Steam ID(s) to get details for
     * @param {string} auth - API key or token
     * @param {Object} [context] - Additional context for logging
     * @returns {Promise<Object|null>} - Player link details response
     * @private
     */    static async _getPlayerLinkDetails(steamids, auth, context = {}) {
        try {
            logger.debug('SteamAPI', '_getPlayerLinkDetails called', { steamids, context });

            // Build special params for this API call
            const specialParams = {};

            if (Array.isArray(steamids)) {
                steamids.forEach((sid, idx) => {
                    specialParams[`steamids[${idx}]`] = sid;
                });
            } else {
                specialParams['steamids[0]'] = steamids;
            }

            logger.debug('SteamAPI', '_getPlayerLinkDetails params built', { specialParams });

            const config = {
                method: 'GetPlayerLinkDetails',
                unified: {
                    endpoint: '/IPlayerService/GetPlayerLinkDetails/v1/',
                    params: specialParams
                },
                allowFailure: true
            };

            logger.debug('SteamAPI', '_getPlayerLinkDetails making API request', { config });

            const result = await this._makeApiRequest(config, auth, context);

            logger.debug('SteamAPI', '_getPlayerLinkDetails API response', {
                hasResult: !!result,
                resultKeys: result ? Object.keys(result) : [],
                result: result
            });

            return result;

        } catch (error) {
            logger.error('SteamAPI', `_getPlayerLinkDetails error: ${error.message}`, { steamids, error });
            return null;
        }
    }

    /**
     * Check if a player is currently playing CS2 (game_id: 730)
     * @param {string} steam_id - Steam ID to check
     * @param {string} auth - API key or token
     * @returns {Promise<boolean>} - True if player is playing CS2
     */    static async isPlayerInCS2(steam_id, auth) {
        try {
            logger.info('SteamAPI', `Checking if player ${steam_id} is in CS2`);

            const data = await this._getPlayerLinkDetails(steam_id, auth, { steam_id, checkingCS2: true });

            return SteamAPIResponseProcessor.processPlayerCS2StatusResponse(data, steam_id);
        } catch (error) {
            logger.error('SteamAPI', `isPlayerInCS2 error: ${error.message}`, { steam_id, error });
            return false;
        }
    }

    /**
     * Get details about friends including their game status and avatars
     * @param {string[]} friend_ids - Array of friend Steam IDs
     * @param {string} auth - API key or token
     * @param {Object} [avatarsCache] - Cache of avatar data
     * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of friend objects
     */
    static async getFriendsStatuses(friend_ids, auth, avatarsCache = {}) {
        const isToken = SteamAPIUtils.isWebApiToken(auth);
        logger.info('SteamAPI', `Getting friends statuses for ${friend_ids.length} friends`); if (!friend_ids.length) {
            logger.warn('SteamAPI', 'No friend IDs provided to getFriendsStatuses');
            return [];
        }

        try {
            const data = await this._getPlayerLinkDetails(friend_ids, auth, { friendsCount: friend_ids.length });

            // Create callback for fetching additional avatars
            const getPlayerSummariesCallback = async (steamids) => {
                return await this.getPlayerSummaries(steamids, auth);
            };

            return await SteamAPIResponseProcessor.processFriendsStatusesResponse(
                data,
                avatarsCache,
                getPlayerSummariesCallback
            );
        } catch (error) {
            logger.error('SteamAPI', `getFriendsStatuses error: ${error.message}`, { friendsCount: friend_ids.length, error });
            throw error;
        }
    }

    /**
     * Get connect information for a specific friend
     * @param {string} friend_id - Friend's Steam ID
     * @param {string} auth - API key or token
     * @returns {Promise<string|null>} - Connect string or null
     */
    static async getFriendConnectInfo(friend_id, auth) {
        try {
            const data = await this._getPlayerLinkDetails(friend_id, auth, { friend_id });

            if (!data) return null;

            return SteamAPIResponseProcessor.processConnectInfoResponse(data);
        } catch (error) {
            logger.error('SteamAPI', `getFriendConnectInfo error: ${error.message}`, { friend_id, error });
            return null;
        }
    }

    /**
     * Get the game server Steam ID for a user
     * @param {string} steam_id - Steam ID to check
     * @param {string} auth - API key or token
     * @returns {Promise<string|null>} - Game server Steam ID or null
     */
    static async getUserGameServerSteamId(steam_id, auth) {
        try {
            const data = await this._getPlayerLinkDetails(steam_id, auth, { steam_id });

            if (!data) return null;

            return SteamAPIResponseProcessor.processGameServerSteamIdResponse(data);
        } catch (error) {
            logger.error('SteamAPI', `getUserGameServerSteamId error: ${error.message}`, { steam_id, error });
            return null;
        }
    }

    /**
     * Resolve vanity URL to SteamID64
     * @param {string} vanityUrl - Vanity URL to resolve
     * @param {string} auth - API key or token
     * @returns {Promise<string|null>} - Steam ID or null
     */
    static async resolveVanityUrl(vanityUrl, auth) {
        try {
            const config = {
                method: 'ResolveVanityURL',
                unified: {
                    endpoint: '/ISteamUser/ResolveVanityURL/v1/',
                    params: {
                        vanityurl: vanityUrl
                    }
                },
                allowFailure: true
            };

            const data = await this._makeApiRequest(config, auth, { vanityUrl });

            if (!data) return null;

            return SteamAPIResponseProcessor.processVanityUrlResponse(data);
        } catch (error) {
            logger.error('SteamAPI', `resolveVanityUrl error: ${error.message}`, { vanityUrl, error });
            return null;
        }
    }
}

export default SteamAPIClient;
