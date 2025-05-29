import { API_CONFIG, ERROR_CODES, VALIDATION_PATTERNS } from '../shared/constants.js';
import ErrorHandler from '../utils/error-handler.js';
import logger from '../utils/logger.js';

/**
 * Steam API client module
 * Handles all interactions with the Steam API
 */
class SteamAPI {
    /**
     * Check if the string is a JWT-like webapi_token
     * @param {string} keyOrToken - String to check
     * @returns {boolean} - Whether it's a Web API token
     */
    static isWebApiToken(keyOrToken) {
        return VALIDATION_PATTERNS.WEB_API_TOKEN.test(keyOrToken);
    }

    /**
     * Get the user's friends list
     * @param {string} steam_id - Steam ID of the user
     * @param {string} auth - API key or token
     * @returns {Promise<string[]>} - Array of friend Steam IDs
     */
    static async getFriendsList(steam_id, auth) {
        const isToken = this.isWebApiToken(auth);
        logger.info('SteamAPI', 'Getting friends list', { steam_id, isToken });
        
        try {
            let url;
            if (isToken) {
                url = `${API_CONFIG.STEAM_API_BASE}/IFriendsListService/GetFriendsList/v1/?access_token=${encodeURIComponent(auth)}`;
            } else {
                url = `${API_CONFIG.STEAM_API_BASE}/ISteamUser/GetFriendList/v1/?steamid=${encodeURIComponent(steam_id)}&relationship=friend&key=${encodeURIComponent(auth)}`;
            }

            const resp = await fetch(url);
            
            if (resp.status === 401) {
                logger.warn('SteamAPI', 'Friends list request unauthorized (401)', { steam_id });
                throw ErrorHandler.createError(ERROR_CODES.PRIVATE_FRIENDS_LIST);
            }
            
            if (!resp.ok) {
                logger.error('SteamAPI', `Friends list request failed with status ${resp.status}`, { steam_id, status: resp.status });
                throw ErrorHandler.createError(`API_ERROR_${resp.status}`);
            }

            const data = await resp.json();
            
            // TRACE: Raw API response
            logger.trace('SteamAPI', 'Raw GetFriendsList response', {
                url: url.replace(/(key|access_token)=[^&]+/g, '$1=***'),
                response: data
            });

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
        } catch (error) {
            logger.error('SteamAPI', `getFriendsList error: ${error.message}`, { steam_id, isToken, error });
            throw error;
        }
    }

    /**
     * Fetch player summaries for up to 100 SteamIDs at a time
     * @param {string[]|string} steamids - Steam IDs to fetch
     * @param {string} auth - API key or token
     * @returns {Promise<Object>} - Map of Steam ID to player data
     */
    static async getPlayerSummaries(steamids, auth) {
        const isToken = this.isWebApiToken(auth);
        
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
                
                let url;
                if (isToken) {
                    url = `${API_CONFIG.STEAM_API_BASE}/ISteamUserOAuth/GetUserSummaries/v1/?access_token=${encodeURIComponent(auth)}&steamids=${chunk.join(',')}`;
                } else {
                    url = `${API_CONFIG.STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(auth)}&steamids=${chunk.join(',')}`;
                }

                logger.info('SteamAPI', `Fetching player summaries chunk ${chunkIndex}/${totalChunks} (${chunk.length} players)`);

                const resp = await fetch(url);
                if (!resp.ok) {
                    logger.warn('SteamAPI', `GetPlayerSummaries chunk ${chunkIndex} failed with status ${resp.status}`);
                    continue;
                }

                const data = await resp.json();
                
                // TRACE: Raw API response
                logger.trace('SteamAPI', `Raw GetPlayerSummaries chunk ${chunkIndex} response`, {
                    url: url.replace(/(key|access_token)=[^&]+/g, '$1=***'),
                    response: data
                });

                let players = [];
                if (isToken) {
                    if (Array.isArray(data.players)) {
                        players = data.players;
                    }
                } else {
                    if (data.response && Array.isArray(data.response.players)) {
                        players = data.response.players;
                    }
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
        const isToken = this.isWebApiToken(auth);
        logger.info('SteamAPI', `Getting friends statuses for ${friend_ids.length} friends`);
        
        if (!friend_ids.length) {
            logger.warn('SteamAPI', 'No friend IDs provided to getFriendsStatuses');
            return [];
        }

        try {
            const params = new URLSearchParams();
            if (isToken) {
                params.append("access_token", auth);
            } else {
                params.append("key", auth);
            }
            
            friend_ids.forEach((sid, idx) => params.append(`steamids[${idx}]`, sid));
            
            const url = `${API_CONFIG.STEAM_API_BASE}/IPlayerService/GetPlayerLinkDetails/v1/?${params.toString()}`;

            const resp = await fetch(url);
            
            if (!resp.ok) {
                logger.error('SteamAPI', `GetPlayerLinkDetails failed with status ${resp.status}`, { 
                    status: resp.status, 
                    statusText: resp.statusText 
                });
                throw ErrorHandler.createError(`API_ERROR_${resp.status}`, `Failed to fetch player link details: ${resp.status} ${resp.statusText}`);
            }

            const data = await resp.json();
            
            // TRACE: Raw API response
            logger.trace('SteamAPI', 'Raw GetPlayerLinkDetails response', {
                url: url.replace(/(key|access_token)=[^&]+/g, '$1=***'),
                response: data
            });

            const accounts = data.response?.accounts || [];
            logger.info('SteamAPI', `Received ${accounts.length} accounts from ${friend_ids.length} requested friends`);

            // Get avatars if not cached
            let avatarMap = avatarsCache;
            if (!avatarMap || Object.keys(avatarMap).length === 0) {
                const steamids = accounts.map(acc => acc.public_data?.steamid).filter(Boolean);
                logger.info('SteamAPI', `Fetching avatars for ${steamids.length} accounts`);
                avatarMap = await this.getPlayerSummaries(steamids, auth);
                logger.info('SteamAPI', `Retrieved ${Object.keys(avatarMap).length} avatars`);
            } else {
                logger.info('SteamAPI', `Using ${Object.keys(avatarMap).length} cached avatars`);
            }

            // Filter for CS2 players
            const cs2Players = accounts.filter(acc => acc.private_data?.game_id === "730");
            logger.info('SteamAPI', `Found ${cs2Players.length} friends playing CS2`);

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
                const richPresence = this.parseRichPresence(priv.rich_presence_kv || "");
                
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
        const isToken = this.isWebApiToken(auth);

        try {
            const params = new URLSearchParams();
            if (isToken) {
                params.append("access_token", auth);
            } else {
                params.append("key", auth);
            }
            params.append("steamids[0]", friend_id);

            const url = `${API_CONFIG.STEAM_API_BASE}/IPlayerService/GetPlayerLinkDetails/v1/?${params.toString()}`;
            const resp = await fetch(url);
            
            if (!resp.ok) return null;

            const data = await resp.json();

            const accounts = data.response?.accounts || [];
            if (!accounts.length) return null;

            const priv = accounts[0].private_data || {};
            if (priv.game_id !== "730") return null;

            const rp = this.parseRichPresence(priv.rich_presence_kv || "");
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
        const isToken = this.isWebApiToken(auth);

        try {
            const params = new URLSearchParams();
            if (isToken) {
                params.append("access_token", auth);
            } else {
                params.append("key", auth);
            }
            params.append("steamids[0]", steam_id);

            const url = `${API_CONFIG.STEAM_API_BASE}/IPlayerService/GetPlayerLinkDetails/v1/?${params.toString()}`;
            const resp = await fetch(url);
            
            if (!resp.ok) return null;

            const data = await resp.json();

            const accounts = data.response?.accounts || [];
            if (!accounts.length) return null;

            const priv = accounts[0].private_data || {};
            const rp = this.parseRichPresence(priv.rich_presence_kv || "");
            
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
        const isToken = this.isWebApiToken(auth);

        try {
            const params = new URLSearchParams();
            if (isToken) {
                params.append("access_token", auth);
            } else {
                params.append("key", auth);
            }
            params.append("vanityurl", vanityUrl);

            const url = `${API_CONFIG.STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?${params.toString()}`;
            const resp = await fetch(url);
            
            if (!resp.ok) return null;

            const data = await resp.json();

            if (data.response?.success === 1) {
                return data.response.steamid;
            }

            return null;
        } catch (error) {
            logger.error('SteamAPI', `resolveVanityUrl error: ${error.message}`, { vanityUrl, error });
            return null;
        }
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

export default SteamAPI; 