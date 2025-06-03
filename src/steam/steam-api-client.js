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
        const authConfig = isToken ? config.token : config.key;

        if (!authConfig) {
            throw new Error(`No ${isToken ? 'token' : 'key'} configuration provided for ${config.method}`);
        }

        try {
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
            url += `?${params.toString()}`;

            // Log request (before making it)
            logger.info('SteamAPI', `Making ${config.method} request`, {
                ...context,
                isToken,
                endpoint: authConfig.endpoint
            });

            // Make the request
            const resp = await fetch(url);

            // Handle HTTP errors
            if (!resp.ok) {
                const errorContext = {
                    ...context,
                    status: resp.status,
                    statusText: resp.statusText
                };

                // Check for custom error handlers
                if (config.errorHandlers && config.errorHandlers[resp.status]) {
                    logger.warn('SteamAPI', `${config.method} request failed with status ${resp.status}`, errorContext);
                    throw config.errorHandlers[resp.status]();
                }

                // Default error handling
                logger.error('SteamAPI', `${config.method} request failed with status ${resp.status}`, errorContext);

                if (config.allowFailure) {
                    return null;
                }

                throw ErrorHandler.createError(`API_ERROR_${resp.status}`, `${config.method} failed: ${resp.status} ${resp.statusText}`);
            }

            // Parse response
            const data = await resp.json();

            // Log response (with masked auth tokens)
            logger.trace('SteamAPI', `Raw ${config.method} response`, {
                url: url.replace(/(key|access_token)=[^&]+/g, '$1=***'),
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
        };        const data = await this._makeApiRequest(config, auth, { steam_id });
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

                logger.info('SteamAPI', `Fetching player summaries chunk ${chunkIndex}/${totalChunks} (${chunk.length} players)`);                const data = await this._makeApiRequest(config, auth, {
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
     * Get details about friends including their game status and avatars
     * @param {string[]} friend_ids - Array of friend Steam IDs
     * @param {string} auth - API key or token
     * @param {Object} [avatarsCache] - Cache of avatar data
     * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of friend objects
     */
    static async getFriendsStatuses(friend_ids, auth, avatarsCache = {}) {
        const isToken = SteamAPIUtils.isWebApiToken(auth);
        logger.info('SteamAPI', `Getting friends statuses for ${friend_ids.length} friends`);

        if (!friend_ids.length) {
            logger.warn('SteamAPI', 'No friend IDs provided to getFriendsStatuses');
            return [];
        } try {
            // Build special params for this API call
            const specialParams = {};
            friend_ids.forEach((sid, idx) => {
                specialParams[`steamids[${idx}]`] = sid;
            });

            const config = {
                method: 'GetPlayerLinkDetails',
                key: {
                    endpoint: '/IPlayerService/GetPlayerLinkDetails/v1/',
                    params: specialParams
                },
                token: {
                    endpoint: '/IPlayerService/GetPlayerLinkDetails/v1/',
                    params: specialParams
                }
            };            const data = await this._makeApiRequest(config, auth, { friendsCount: friend_ids.length });

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
            const config = {
                method: 'GetPlayerLinkDetails',
                key: {
                    endpoint: '/IPlayerService/GetPlayerLinkDetails/v1/',
                    params: {
                        'steamids[0]': friend_id
                    }
                },
                token: {
                    endpoint: '/IPlayerService/GetPlayerLinkDetails/v1/',
                    params: {
                        'steamids[0]': friend_id
                    }
                },
                allowFailure: true
            };            const data = await this._makeApiRequest(config, auth, { friend_id });

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
            const config = {
                method: 'GetPlayerLinkDetails',
                key: {
                    endpoint: '/IPlayerService/GetPlayerLinkDetails/v1/',
                    params: {
                        'steamids[0]': steam_id
                    }
                },
                token: {
                    endpoint: '/IPlayerService/GetPlayerLinkDetails/v1/',
                    params: {
                        'steamids[0]': steam_id
                    }
                },
                allowFailure: true
            };            const data = await this._makeApiRequest(config, auth, { steam_id });

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
                key: {
                    endpoint: '/ISteamUser/ResolveVanityURL/v1/',
                    params: {
                        vanityurl: vanityUrl
                    }
                },
                token: {
                    endpoint: '/ISteamUser/ResolveVanityURL/v1/',
                    params: {
                        vanityurl: vanityUrl
                    }
                },
                allowFailure: true
            };            const data = await this._makeApiRequest(config, auth, { vanityUrl });

            if (!data) return null;

            return SteamAPIResponseProcessor.processVanityUrlResponse(data);
        } catch (error) {
            logger.error('SteamAPI', `resolveVanityUrl error: ${error.message}`, { vanityUrl, error });
            return null;
        }
    }
}

export default SteamAPIClient;
