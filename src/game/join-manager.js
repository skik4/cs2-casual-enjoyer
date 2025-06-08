import { API_CONFIG, STATUS_TYPES } from '../shared/constants.js';
import SteamAPI from '../steam/steam-api.js';
import Validators from '../utils/validators.js';
import ErrorHandler from '../utils/error-handler.js';
import DOMUtils from '../utils/dom-utils.js';

/**
 * Join Manager module
 * Handles the process of joining friends' games
 */
class JoinManager {
    constructor() {
        this.joinStates = {};
        this.onUpdateDot = null;
        this.onUpdateJoinButton = null;
        this.cs2Manager = null;
        this.onRequestCS2Launch = null; // Callback for requesting CS2 launch from UI layer
    }

    /**
     * Set CS2Manager instance
     * @param {CS2Manager} cs2Manager - CS2Manager instance
     */
    setCS2Manager(cs2Manager) {
        this.cs2Manager = cs2Manager;
    }

    /**
     * Start the process of joining a friend's game
     * @param {string} friend_id - Steam ID of the friend to join
     */
    async startJoin(friend_id) {
        try {
            console.log('JoinManager: Starting join for friend:', friend_id);

            // First check if user is in CS2
            if (this.cs2Manager) {
                console.log('JoinManager: Checking if user is in CS2...');
                const isInCS2 = await this.cs2Manager.checkUserInCS2();
                console.log('JoinManager: User in CS2 check result:', isInCS2);

                if (!isInCS2) {
                    console.log('JoinManager: User not in CS2, requesting launch...');
                    // Request CS2 launch from UI layer
                    if (this.onRequestCS2Launch) {
                        const shouldLaunch = await this.onRequestCS2Launch(friend_id);
                        console.log('JoinManager: Launch request result:', shouldLaunch);
                        if (!shouldLaunch) {
                            // User cancelled, don't proceed with join
                            console.log('JoinManager: User cancelled launch, aborting join');
                            return;
                        }
                        // CS2 launch notification will handle waiting for CS2 to start
                    }
                } else {
                    console.log('JoinManager: User already in CS2, proceeding with join...');
                }
            }

            const steamIdInput = DOMUtils.getElementById('steam-id');
            const authInput = DOMUtils.getElementById('auth');

            if (!steamIdInput || !authInput) {
                throw new Error('Required input elements not found');
            }            const steam_id = steamIdInput.value.trim();
            const auth_raw = authInput.value.trim();
            const auth = Validators.extractApiKeyOrToken(auth_raw);

            if (!steam_id || !auth) {
                throw new Error('Steam ID and API auth are required');
            }this.joinStates[friend_id] = {
                status: STATUS_TYPES.WAITING,
                cancelled: false,
                interval: null
            };

            if (this.onUpdateJoinButton) this.onUpdateJoinButton(friend_id, STATUS_TYPES.WAITING);
            if (this.onUpdateDot) this.onUpdateDot(friend_id, STATUS_TYPES.WAITING);

            // Setup periodic UI updates
            this.joinStates[friend_id].interval = setInterval(() => {
                const currentState = this.joinStates[friend_id];
                if (currentState) {
                    if (this.onUpdateDot) this.onUpdateDot(friend_id, currentState.status);
                    if (this.onUpdateJoinButton) this.onUpdateJoinButton(friend_id, currentState.status);

                    if (currentState.status === STATUS_TYPES.JOINED ||
                        currentState.status === STATUS_TYPES.CANCELLED) {
                        clearInterval(currentState.interval);
                    }
                }
            }, 1000);

            // Start the join loop
            await this.joinLoop(friend_id, steam_id, auth);
        } catch (error) {
            ErrorHandler.logError('JoinManager.startJoin', error, { friend_id });
            this.cancelJoin(friend_id);
        }
    }

    /**
     * The main loop for joining a friend's game
     * @param {string} friend_id - Steam ID of the friend to join
     * @param {string} user_steam_id - Steam ID of the user
     * @param {string} auth - API key or token for Steam API
     */
    async joinLoop(friend_id, user_steam_id, auth) {
        let missingSince = null;
        let lastKnownPersona = null;
        let lastKnownAvatar = null;

        while (this.joinStates[friend_id] && !this.joinStates[friend_id].cancelled) {
            try {
                // Try to get connect info for the friend
                const currentConnect = await SteamAPI.getFriendConnectInfo(friend_id, auth);

                if (!currentConnect) {
                    // Check if the friend is still in casual
                    const statuses = await SteamAPI.getFriendsStatuses([friend_id], auth);
                    const friendStatus = statuses && statuses.length ? statuses[0] : null;
                    if (!friendStatus || !friendStatus.in_casual_mode) {
                        // Friend is not in supported mode - mark as "missing"
                        if (!missingSince) {
                            missingSince = Date.now();
                            lastKnownPersona = friendStatus?.personaname || this.joinStates[friend_id]?.personaname || 'Unknown';
                            lastKnownAvatar = friendStatus?.avatar || this.joinStates[friend_id]?.avatar || '';
                        }

                        this.updateJoinState(friend_id, {
                            status: STATUS_TYPES.MISSING,
                            personaname: lastKnownPersona,
                            avatar: lastKnownAvatar
                        });

                        // If missing for more than timeout, cancel
                        if (Date.now() - missingSince > API_CONFIG.MISSING_TIMEOUT_MS) {
                            this.cancelJoin(friend_id);
                            break;
                        }
                    } else {
                        // Friend is back in supported mode - reset the timer
                        missingSince = null;
                        lastKnownPersona = friendStatus.personaname;
                        lastKnownAvatar = friendStatus.avatar;
                        this.updateJoinState(friend_id, { status: STATUS_TYPES.WAITING });
                    }

                    await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
                    continue;
                }

                // We have connect info, try to join
                this.updateJoinState(friend_id, { status: STATUS_TYPES.CONNECTING });

                // Attempt to join via Steam protocol
                const url = `steam://rungame/730/${friend_id}/${currentConnect}`;
                window.open(url, "_self");

                await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);

                // Check if user has joined the same server as the friend
                const [userServer, friendServer] = await Promise.all([
                    SteamAPI.getUserGameServerSteamId(user_steam_id, auth),
                    SteamAPI.getUserGameServerSteamId(friend_id, auth)
                ]);

                if (userServer && friendServer && userServer === friendServer) {
                    this.updateJoinState(friend_id, { status: STATUS_TYPES.JOINED });

                    // Stop all other join loops
                    this.cancelAllExcept(friend_id);

                    // Keep the green status for a bit before resetting
                    await this.sleep(API_CONFIG.JOIN_SUCCESS_DISPLAY_MS);
                    this.cancelJoin(friend_id);
                    break;
                }

                await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
            } catch (error) {
                ErrorHandler.logError('JoinManager.joinLoop', error, { friend_id, user_steam_id });
                await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
            }
        }

        // Ensure final state is set
        if (this.joinStates[friend_id] && this.joinStates[friend_id].status !== STATUS_TYPES.JOINED) {
            this.updateJoinState(friend_id, { status: STATUS_TYPES.CANCELLED });
        }
    }

    /**
     * Update join state for a friend
     * @param {string} friend_id - Steam ID of the friend
     * @param {Partial<import('../shared/types.js').JoinState>} updates - State updates
     */
    updateJoinState(friend_id, updates) {
        if (this.joinStates[friend_id]) {
            Object.assign(this.joinStates[friend_id], updates);
        }
    }

    /**
     * Cancel an ongoing join attempt
     * @param {string} friend_id - Steam ID of the friend whose join attempt to cancel
     */
    cancelJoin(friend_id) {
        const state = this.joinStates[friend_id];
        if (!state) return;

        if (state.interval) {
            clearInterval(state.interval);
        } this.updateJoinState(friend_id, {
            status: STATUS_TYPES.CANCELLED,
            cancelled: true
        });

        if (this.onUpdateDot) this.onUpdateDot(friend_id, STATUS_TYPES.CANCELLED);
        if (this.onUpdateJoinButton) this.onUpdateJoinButton(friend_id, STATUS_TYPES.CANCELLED);

        // Reset button and dot after a short time
        setTimeout(() => {
            if (this.onUpdateDot) this.onUpdateDot(friend_id, STATUS_TYPES.CANCELLED);
            if (this.onUpdateJoinButton) this.onUpdateJoinButton(friend_id, STATUS_TYPES.CANCELLED);
        }, 200);
    }

    /**
     * Cancel all join attempts except specified friend
     * @param {string} exceptFriendId - Friend ID to exclude from cancellation
     */
    cancelAllExcept(exceptFriendId) {
        Object.keys(this.joinStates).forEach(friendId => {
            if (friendId !== exceptFriendId) {
                this.cancelJoin(friendId);
            }
        });
    }

    /**
     * Get the current join states for all tracked friends
     * @returns {Object} - Copy of the joinStates object
     */
    getJoinStates() {
        return { ...this.joinStates };
    }

    /**
     * Reset all join states and stop all join loops
     */
    resetAll() {
        Object.keys(this.joinStates).forEach(friendId => {
            const state = this.joinStates[friendId];
            if (state?.interval) {
                clearInterval(state.interval);
            }
            delete this.joinStates[friendId];
        });
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }    /**
     * Set UI update callbacks
     * @param {Function} onUpdateDot - Callback for updating status dot
     * @param {Function} onUpdateJoinButton - Callback for updating join button
     */
    setUICallbacks(onUpdateDot, onUpdateJoinButton) {
        this.onUpdateDot = onUpdateDot;
        this.onUpdateJoinButton = onUpdateJoinButton;
    }

    /**
     * Set CS2 launch request callback
     * @param {Function} onRequestCS2Launch - Callback for requesting CS2 launch (returns Promise<boolean>)
     */
    setCS2LaunchCallback(onRequestCS2Launch) {
        this.onRequestCS2Launch = onRequestCS2Launch;
    }
}

// Create singleton instance
const joinManager = new JoinManager();

export default joinManager;