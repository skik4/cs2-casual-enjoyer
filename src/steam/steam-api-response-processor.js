import { ERROR_CODES } from '../shared/constants.js';
import ErrorHandler from '../utils/error-handler.js';
import logger from '../utils/logger.js';
import SteamAPIUtils from './steam-api-utils.js';

/**
 * Steam API Response Processor
 * Handles parsing and processing of raw Steam API responses
 * Separates response processing logic from HTTP request logic
 */
class SteamAPIResponseProcessor {
    /**
     * Process friends list response from Steam API
     * @param {Object} rawData - Raw response from Steam API
     * @param {boolean} isToken - Whether the request was made with a token or API key
     * @returns {string[]} - Array of confirmed friend Steam IDs
     */
    static processFriendsListResponse(rawData, isToken) {
        logger.debug('SteamAPIResponseProcessor', 'Processing friends list response', { isToken });

        const friendIds = SteamAPIUtils.extractFriendIds(rawData, isToken);

        if (friendIds.length === 0) {
            logger.warn('SteamAPIResponseProcessor', 'No confirmed friends found after filtering');
            throw ErrorHandler.createError(ERROR_CODES.EMPTY_FRIENDS_LIST);
        }

        logger.info('SteamAPIResponseProcessor', `Processed ${friendIds.length} confirmed friends`, {
            count: friendIds.length
        });

        return friendIds;
    }

    /**
     * Process player summaries response from Steam API
     * @param {Object} rawData - Raw response from Steam API
     * @param {number} chunkIndex - Current chunk index for logging
     * @returns {Object[]} - Array of player objects
     */
    static processPlayerSummariesResponse(rawData, chunkIndex = 1) {
        logger.debug('SteamAPIResponseProcessor', `Processing player summaries response chunk ${chunkIndex}`);

        const players = SteamAPIUtils.extractPlayersFromSummaries(rawData);

        logger.info('SteamAPIResponseProcessor', `Chunk ${chunkIndex}: processed ${players.length} player summaries`);

        // Debug logging for processed player data
        logger.debug('SteamAPIResponseProcessor', `Player summaries chunk ${chunkIndex} details`, {
            players: players.map(p => ({
                name: p.personaname || 'Unknown',
                steamid: p.steamid,
                profilestate: p.profilestate,
                lastlogoff: p.lastlogoff ? new Date(p.lastlogoff * 1000).toISOString() : 'Never',
                avatar: p.avatar ? 'Has avatar' : 'No avatar'
            }))
        });

        return players;
    }

    /**
     * Process player link details response for friends statuses
     * @param {Object} rawData - Raw response from Steam API
     * @param {Object} avatarsCache - Cache of avatar data
     * @param {Function} getPlayerSummariesCallback - Callback to fetch additional avatars
     * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of processed friend objects
     */
    static async processFriendsStatusesResponse(rawData, avatarsCache = {}, getPlayerSummariesCallback = null) {
        logger.debug('SteamAPIResponseProcessor', 'Processing friends statuses response');

        const accounts = rawData.response?.accounts || [];
        logger.info('SteamAPIResponseProcessor', `Processing ${accounts.length} accounts`);

        // Filter for CS2 players first
        const cs2Players = accounts.filter(acc => acc.private_data?.game_id === "730");
        logger.info('SteamAPIResponseProcessor', `Found ${cs2Players.length} friends playing CS2`);

        // Pre-filter for supported players to only load avatars for them
        const supportedPlayerSteamIds = this._extractSupportedPlayerSteamIds(cs2Players);
        logger.info('SteamAPIResponseProcessor', `Found ${supportedPlayerSteamIds.length} friends in supported modes (casual/deathmatch)`);

        // Get avatars only for supported players
        const avatarMap = await this._processAvatarsForSupportedPlayers(
            supportedPlayerSteamIds,
            avatarsCache,
            getPlayerSummariesCallback
        );

        // Debug: Show all friends with their game status
        this._logAllFriendsBreakdown(accounts);

        // Map to friend objects
        const mapped = this._mapAccountsToFriends(cs2Players, avatarMap);

        // Debug logging for supported and non-supported friends
        this._logFriendsBreakdown(mapped);

        return mapped;
    }

    /**
     * Process player link details response for connect info
     * @param {Object} rawData - Raw response from Steam API
     * @returns {string|null} - Connect string or null
     */
    static processConnectInfoResponse(rawData) {
        logger.debug('SteamAPIResponseProcessor', 'Processing connect info response');

        const accounts = rawData.response?.accounts || [];
        if (!accounts.length) {
            logger.debug('SteamAPIResponseProcessor', 'No accounts in connect info response');
            return null;
        } const priv = accounts[0].private_data || {};
        if (!SteamAPIUtils.isPlayerInCS2(priv)) {
            logger.debug('SteamAPIResponseProcessor', 'Player not in CS2', { game_id: priv.game_id });
            return null;
        }

        const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");
        if (SteamAPIUtils.isInSupportedMode(richPresence)) {
            logger.debug('SteamAPIResponseProcessor', 'Found connect info for supported game mode player', {
                game_mode: richPresence.game_mode,
                game_state: richPresence.game_state,
                hasConnect: !!richPresence.connect
            });
            return richPresence.connect;
        }

        logger.debug('SteamAPIResponseProcessor', 'Player not in joinable supported game mode', {
            game_mode: richPresence.game_mode,
            game_state: richPresence.game_state
        });
        return null;
    }

    /**
     * Process player link details response for game server Steam ID
     * @param {Object} rawData - Raw response from Steam API
     * @returns {string|null} - Game server Steam ID or null
     */
    static processGameServerSteamIdResponse(rawData) {
        logger.debug('SteamAPIResponseProcessor', 'Processing game server Steam ID response');

        const accounts = rawData.response?.accounts || [];
        if (!accounts.length) {
            logger.debug('SteamAPIResponseProcessor', 'No accounts in game server response');
            return null;
        }

        const priv = accounts[0].private_data || {};
        const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");

        const serverId = richPresence.game_server_steam_id || priv.game_server_steam_id || null;

        logger.debug('SteamAPIResponseProcessor', 'Extracted game server Steam ID', {
            hasServerId: !!serverId,
            fromRichPresence: !!richPresence.game_server_steam_id,
            fromPrivateData: !!priv.game_server_steam_id
        });

        return serverId;
    }

    /**
     * Process vanity URL resolution response
     * @param {Object} rawData - Raw response from Steam API
     * @returns {string|null} - Steam ID or null
     */
    static processVanityUrlResponse(rawData) {
        logger.debug('SteamAPIResponseProcessor', 'Processing vanity URL response');

        if (rawData.response?.success === 1) {
            const steamId = rawData.response.steamid;
            logger.debug('SteamAPIResponseProcessor', 'Successfully resolved vanity URL', { steamId });
            return steamId;
        }

        logger.debug('SteamAPIResponseProcessor', 'Failed to resolve vanity URL', {
            success: rawData.response?.success
        });
        return null;
    }

    /**
     * Process player link details response to check if player is in CS2
     * @param {Object} rawData - Raw response from Steam API
     * @param {string} steam_id - Steam ID being checked (for logging)
     * @returns {boolean} - True if player is playing CS2
     */
    static processPlayerCS2StatusResponse(rawData, steam_id) {
        logger.debug('SteamAPIResponseProcessor', 'Processing player CS2 status response', {
            steam_id,
            hasData: !!rawData,
            hasResponse: !!(rawData && rawData.response),
            hasAccounts: !!(rawData && rawData.response && rawData.response.accounts),
            accountsLength: rawData && rawData.response && rawData.response.accounts ? rawData.response.accounts.length : 0,
            fullResponse: rawData
        });

        if (!rawData || !rawData.response || !rawData.response.accounts || !rawData.response.accounts.length) {
            logger.warn('SteamAPIResponseProcessor', `No player data found for ${steam_id}`, {
                dataExists: !!rawData,
                responseExists: !!(rawData && rawData.response),
                accountsExists: !!(rawData && rawData.response && rawData.response.accounts),
                accountsLength: rawData && rawData.response && rawData.response.accounts ? rawData.response.accounts.length : 0
            });
            return false;
        }

        const account = rawData.response.accounts[0];
        const priv = account.private_data || {};
        const isInCS2 = SteamAPIUtils.isPlayerInCS2(priv);

        if (!isInCS2) {
            logger.info('SteamAPIResponseProcessor', `Player ${steam_id} CS2 status: not playing`, {
                steam_id,
                game_id: priv.game_id,
                isInCS2: false
            });
            return false;
        }

        // Parse rich presence to check if user is in lobby
        const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");
        const isInLobby = richPresence.game_state === "lobby";

        logger.info('SteamAPIResponseProcessor', `Player ${steam_id} CS2 status: ${isInCS2 ? 'playing' : 'not playing'}, in lobby: ${isInLobby}`, {
            steam_id,
            game_id: priv.game_id,
            game_state: richPresence.game_state,
            isInCS2,
            isInLobby,
            richPresenceData: richPresence
        });

        // Return true only if player is in CS2 AND in lobby
        return isInCS2 && isInLobby;
    }

    /**
     * Process friends statuses with avatar fetching capabilities
     * @param {Object} rawData - Raw response from Steam API
     * @param {Object} avatarsCache - Cache of avatar data
     * @param {Object} apiClient - Reference to API client for fetching additional data
     * @returns {Promise<import('../shared/types.js').Friend[]>} - Array of processed friend objects
     */
    static async processFriendsStatusesWithAvatars(rawData, avatarsCache = {}, apiClient = null) {
        logger.debug('SteamAPIResponseProcessor', 'Processing friends statuses response with avatar fetching');

        // Create callback for fetching additional avatars if API client is provided
        const getPlayerSummariesCallback = apiClient ?
            async (steamids) => await apiClient.getPlayerSummaries(steamids, apiClient._lastUsedAuth) :
            null;

        return await this.processFriendsStatusesResponse(
            rawData,
            avatarsCache,
            getPlayerSummariesCallback
        );
    }

    // Private helper methods    
    /**
     * Extract Steam IDs of players in supported modes (casual and deathmatch)
     * @param {Object[]} cs2Players - Players playing CS2
     * @returns {string[]} - Steam IDs of players in supported modes
     * @private
     */
    static _extractSupportedPlayerSteamIds(cs2Players) {
        return cs2Players
            .filter(acc => {
                const priv = acc.private_data || {};
                const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");
                return SteamAPIUtils.isInSupportedMode(richPresence);
            })
            .map(acc => acc.public_data?.steamid)
            .filter(Boolean);
    }

    /**
     * Process avatars for supported players
     * @param {string[]} supportedPlayerSteamIds - Steam IDs of supported players
     * @param {Object} avatarsCache - Existing avatar cache
     * @param {Function} getPlayerSummariesCallback - Callback to fetch avatars
     * @returns {Promise<Object>} - Avatar map
     * @private
     */
    static async _processAvatarsForSupportedPlayers(supportedPlayerSteamIds, avatarsCache, getPlayerSummariesCallback) {
        let avatarMap = {};
        if (supportedPlayerSteamIds.length > 0) {
            // Check if we have cached avatars for these players
            const missingAvatars = SteamAPIUtils.filterMissingAvatars(supportedPlayerSteamIds, avatarsCache);

            if (missingAvatars.length > 0 && getPlayerSummariesCallback) {
                logger.info('SteamAPIResponseProcessor', `Fetching avatars for ${missingAvatars.length} supported players`);
                const fetchedAvatars = await getPlayerSummariesCallback(missingAvatars);
                avatarMap = { ...avatarsCache, ...fetchedAvatars };
                logger.info('SteamAPIResponseProcessor', `Retrieved ${Object.keys(fetchedAvatars).length} new avatars`);
            } else {
                avatarMap = avatarsCache;
                logger.info('SteamAPIResponseProcessor', `Using cached avatars for all ${supportedPlayerSteamIds.length} supported players`);
            }
        }

        return avatarMap;
    }

    /**
     * Log breakdown of all friends with their game status
     * @param {Object[]} accounts - All account data
     * @private
     */
    static _logAllFriendsBreakdown(accounts) {
        logger.debug('SteamAPIResponseProcessor', 'All friends breakdown', {
            allFriends: accounts.map(acc => SteamAPIUtils.createPlayerDebugInfo(acc))
        });
    }

    /**
     * Map account objects to friend objects
     * @param {Object[]} cs2Players - Players playing CS2
     * @param {Object} avatarMap - Avatar data map
     * @returns {import('../shared/types.js').Friend[]} - Mapped friend objects
     * @private
     */
    static _mapAccountsToFriends(cs2Players, avatarMap) {
        return cs2Players.map(acc => {
            const priv = acc.private_data || {};
            const pub = acc.public_data || {};
            const richPresence = SteamAPIUtils.parseRichPresence(priv.rich_presence_kv || "");
            const status = richPresence.status || "";
            const inSupportedMode = SteamAPIUtils.isInSupportedMode(richPresence);
            const joinAvailable = SteamAPIUtils.isJoinAvailable(richPresence);

            const steamid = pub.steamid || "";
            const avatar = SteamAPIUtils.extractBestAvatar(avatarMap[steamid]);

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
                in_casual_mode: inSupportedMode,
                join_available: joinAvailable,
                connect: richPresence.connect || ""
            };
        });
    }

    /**
     * Log breakdown of supported and non-supported friends
     * @param {import('../shared/types.js').Friend[]} mapped - Mapped friend objects
     * @private
     */
    static _logFriendsBreakdown(mapped) {
        const supportedFriends = mapped.filter(friend => friend.in_casual_mode);
        const joinableFriends = supportedFriends.filter(f => f.join_available);

        logger.info('SteamAPIResponseProcessor', `Found ${supportedFriends.length} friends in supported modes (casual/deathmatch), ${joinableFriends.length} joinable`);

        // Debug: Show non-supported CS2 friends and why they're not supported
        const nonSupportedFriends = mapped.filter(f => !f.in_casual_mode);
        logger.debug('SteamAPIResponseProcessor', 'Non-supported CS2 friends', {
            nonSupportedFriends: nonSupportedFriends.map(f => ({
                name: f.personaname || 'Unknown',
                status: f.status,
                game_mode: f.game_mode || 'Unknown',
                game_state: f.game_state || 'Unknown',
                reason: !f.game_mode ? 'No game mode' :
                    !['casual', 'deathmatch'].includes(f.game_mode) ? `Playing ${f.game_mode}` :
                        ['', null, 'lobby'].includes(f.game_state) ? `In ${f.game_state || 'lobby'}` :
                            'Other reason'
            }))
        });

        // Debug: Show supported friends (always show, even if empty)
        logger.debug('SteamAPIResponseProcessor', 'Supported friends', {
            supportedFriends: supportedFriends.map(f => ({
                name: f.personaname || 'Unknown',
                status: f.status,
                game_mode: f.game_mode,
                game_map: f.game_map,
                game_score: f.game_score,
                join_available: f.join_available,
                connect: f.connect ? 'Available' : 'Not available'
            }))
        });
    }
}

export default SteamAPIResponseProcessor;
