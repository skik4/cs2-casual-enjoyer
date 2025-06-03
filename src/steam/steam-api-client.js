import { API_CONFIG, ERROR_CODES } from '../shared/constants.js';
import ErrorHandler from '../utils/error-handler.js';
import logger from '../utils/logger.js';
import SteamAPIUtils from './steam-api-utils.js';

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
        };
        const data = await this._makeApiRequest(config, auth, { steam_id });
        const isToken = SteamAPIUtils.isWebApiToken(auth);

        let friendIds = [];
        if (isToken) {
            if (!data.response?.friendslist?.friends || !Array.isArray(data.response.friendslist.friends)) {
                logger.warn('SteamAPI', 'Empty or invalid friends list from token API', { response: data.response });
                throw ErrorHandler.createError(ERROR_CODES.EMPTY_FRIENDS_LIST);
            }
            // Filter to only confirmed friends (efriendrelationship: 3)
            const confirmedFriends = data.response.friendslist.friends.filter(f => f.efriendrelationship === 3);
            friendIds = confirmedFriends.map(f => f.ulfriendid);

            // DEBUG: Log relationship filtering results
            const totalFriends = data.response.friendslist.friends.length;
            logger.debug('SteamAPI', 'Friend relationship filtering (token API)', {
                totalFriends,
                confirmedFriends: confirmedFriends.length,
                filteredOut: totalFriends - confirmedFriends.length
            });
        } else {
            if (!data.friendslist?.friends) {
                logger.warn('SteamAPI', 'Empty or invalid friends list from key API', { friendslist: data.friendslist });
                throw ErrorHandler.createError(ERROR_CODES.EMPTY_FRIENDS_LIST);
            }
            // Filter to only confirmed friends (efriendrelationship: 3) 
            const confirmedFriends = data.friendslist.friends.filter(f => f.relationship === "friend");
            friendIds = confirmedFriends.map(f => f.steamid);

            // DEBUG: Log relationship filtering results
            const totalFriends = data.friendslist.friends.length;
            logger.debug('SteamAPI', 'Friend relationship filtering (key API)', {
                totalFriends,
                confirmedFriends: confirmedFriends.length,
                filteredOut: totalFriends - confirmedFriends.length
            });
        }

        logger.info('SteamAPI', `Retrieved ${friendIds.length} confirmed friends`, { count: friendIds.length });

        return friendIds;
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

                let players = [];
                // Handle different response formats based on auth type
                if (Array.isArray(data.players)) {
                    // Token response format
                    players = data.players;
                } else if (data.response && Array.isArray(data.response.players)) {
                    // API key response format
                    players = data.response.players;
                }

                logger.info('SteamAPI', `Chunk ${chunkIndex}: received ${players.length} player summaries`);

                // DEBUG: Show processed player data
                logger.debug('SteamAPI', `Player summaries chunk ${chunkIndex}`, {
                    players: players.map(p => ({
                        name: p.personaname || 'Unknown',
                        steamid: p.steamid,
                        profilestate: p.profilestate,
                        lastlogoff: p.lastlogoff ? new Date(p.lastlogoff * 1000).toISOString() : 'Never',
                        avatar: p.avatar ? 'Has avatar' : 'No avatar'
                    }))
                });

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
            };

            const data = await this._makeApiRequest(config, auth, { friendsCount: friend_ids.length });

            const accounts = data.response?.accounts || [];
            logger.info('SteamAPI', `Received ${accounts.length} accounts from ${friend_ids.length} requested friends`);

            // Filter for CS2 players first
            const cs2Players = accounts.filter(acc => acc.private_data?.game_id === "730");
            logger.info('SteamAPI', `Found ${cs2Players.length} friends playing CS2`);

            // Pre-filter for casual players to only load avatars for them
            const casualPlayerSteamIds = cs2Players
                .filter(acc => {
                    const priv = acc.private_data || {};
                    const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");
                    return richPresence.game_mode === "casual" &&
                        !["", null, "lobby"].includes(richPresence.game_state);
                })
                .map(acc => acc.public_data?.steamid)
                .filter(Boolean);

            logger.info('SteamAPI', `Found ${casualPlayerSteamIds.length} friends in casual mode`);

            // Get avatars only for casual players (unless we have cached avatars for them)
            let avatarMap = {};
            if (casualPlayerSteamIds.length > 0) {
                // Check if we have cached avatars for these players
                const missingAvatars = casualPlayerSteamIds.filter(steamid => !avatarsCache[steamid]);

                if (missingAvatars.length > 0) {
                    logger.info('SteamAPI', `Fetching avatars for ${missingAvatars.length} casual players`);
                    const fetchedAvatars = await this.getPlayerSummaries(missingAvatars, auth);
                    avatarMap = { ...avatarsCache, ...fetchedAvatars };
                    logger.info('SteamAPI', `Retrieved ${Object.keys(fetchedAvatars).length} new avatars`);
                } else {
                    avatarMap = avatarsCache;
                    logger.info('SteamAPI', `Using cached avatars for all ${casualPlayerSteamIds.length} casual players`);
                }
            }

            // DEBUG: Show all friends with their game status
            logger.debug('SteamAPI', 'All friends breakdown', {
                allFriends: accounts.map(acc => ({
                    name: acc.public_data?.persona_name || 'Unknown',
                    steamid: acc.public_data?.steamid,
                    game_name: acc.private_data?.game_id === "730" ? "CS2" :
                        acc.private_data?.game_id ? `Game ${acc.private_data.game_id}` : "Not in game"
                }))
            });

            // Map to friend objects with detailed logging
            const mapped = cs2Players.map((acc, index) => {
                const priv = acc.private_data || {};
                const pub = acc.public_data || {};
                const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");

                const status = richPresence.status || "";
                const inCasualMode = richPresence.game_mode === "casual" &&
                    !["", null, "lobby"].includes(richPresence.game_state);
                const joinAvailable = inCasualMode && richPresence.connect?.startsWith("+gcconnect");

                const steamid = pub.steamid || "";
                const avatar = avatarMap[steamid]?.avatarfull ||
                    avatarMap[steamid]?.avatar ||
                    avatarMap[steamid]?.avatarmedium || "";

                return {
                    // Basic friend info
                    steamid,
                    personaname: pub.persona_name || "",
                    avatar,
                    status,

                    // Game state info
                    game_mode: richPresence.game_mode,
                    game_state: richPresence.game_state,
                    game_map: richPresence.game_map || "",
                    game_score: richPresence.game_score || "",
                    game_server_id: richPresence.game_server_steam_id || "",

                    // App logic flags
                    in_casual_mode: inCasualMode,
                    join_available: joinAvailable,
                    connect: richPresence.connect || ""
                };
            });

            const casualFriends = mapped.filter(friend => friend.in_casual_mode);
            const joinableFriends = casualFriends.filter(f => f.join_available);

            logger.info('SteamAPI', `Found ${casualFriends.length} friends in casual mode, ${joinableFriends.length} joinable`);

            // DEBUG: Show non-casual CS2 friends and why they're not casual
            const nonCasualFriends = mapped.filter(f => !f.in_casual_mode);
            logger.debug('SteamAPI', 'Non-casual CS2 friends', {
                nonCasualFriends: nonCasualFriends.map(f => ({
                    name: f.personaname || 'Unknown',
                    status: f.status,
                    game_mode: f.game_mode || 'Unknown',
                    game_state: f.game_state || 'Unknown',
                    reason: !f.game_mode ? 'No game mode' :
                        f.game_mode !== 'casual' ? `Playing ${f.game_mode}` :
                            ['', null, 'lobby'].includes(f.game_state) ? `In ${f.game_state || 'lobby'}` :
                                'Other reason'
                }))
            });

            // DEBUG: Show casual friends (always show, even if empty)
            logger.debug('SteamAPI', 'Casual friends', {
                casualFriends: casualFriends.map(f => ({
                    name: f.personaname || 'Unknown',
                    status: f.status,
                    game_map: f.game_map,
                    game_score: f.game_score,
                    join_available: f.join_available,
                    connect: f.connect ? 'Available' : 'Not available'
                }))
            });

            return mapped;
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
            };

            const data = await this._makeApiRequest(config, auth, { friend_id });

            if (!data) return null;

            const accounts = data.response?.accounts || [];
            if (!accounts.length) return null;

            const priv = accounts[0].private_data || {};
            if (priv.game_id !== "730") return null;

            const rp = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");
            if (rp.game_mode === "casual" && !["", null, "lobby"].includes(rp.game_state)) {
                return rp.connect;
            }

            return null;
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
            };

            const data = await this._makeApiRequest(config, auth, { steam_id });

            if (!data) return null;

            const accounts = data.response?.accounts || [];
            if (!accounts.length) return null;

            const priv = accounts[0].private_data || {};
            const rp = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");

            return rp.game_server_steam_id || priv.game_server_steam_id || null;
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
            };

            const data = await this._makeApiRequest(config, auth, { vanityUrl });

            if (!data) return null;

            if (data.response?.success === 1) {
                return data.response.steamid;
            }

            return null;
        } catch (error) {
            logger.error('SteamAPI', `resolveVanityUrl error: ${error.message}`, { vanityUrl, error });
            return null;
        }
    }
}

export default SteamAPIClient;
