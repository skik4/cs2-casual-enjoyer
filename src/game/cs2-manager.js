// UI and utilities
import SteamAPI from '../steam/steam-api.js';
import Validators from '../utils/validators.js';
import logger from '../utils/logger.js';

/**
 * Manages CS2 launch functionality
 */
class CS2Manager {
    constructor() {
        this.appInputManager = null;
        this.isInitialized = false;
        this.statusCheckInterval = null;
        this.isMonitoring = false;
    }

    /**
     * Initialize the CS2Manager with required dependencies
     * @param {Object} appInputManager - App input manager instance
     */
    initialize(appInputManager) {
        this.appInputManager = appInputManager;
        this.isInitialized = true;
        logger.info('CS2Manager', 'CS2Manager initialized');
    }

    /**
     * Check if the current user is playing CS2
     * @returns {Promise<boolean>} - Whether the user is playing CS2
     */
    async checkUserInCS2() {
        if (!this.isInitialized || !this.appInputManager) {
            logger.warn('CS2Manager', 'Not initialized or missing appInputManager', {
                isInitialized: this.isInitialized,
                hasAppInputManager: !!this.appInputManager
            });
            return false;
        }

        try {
            const steamId = this.appInputManager.getSteamId();
            const auth = this.appInputManager.getAuth();

            logger.debug('CS2Manager', 'Checking CS2 status for user', { steamId });

            if (!steamId || !auth) {
                logger.warn('CS2Manager', 'Missing steamId or auth', {
                    hasSteamId: !!steamId,
                    hasAuth: !!auth
                });
                return false;
            }

            const extractedAuth = Validators.extractApiKeyOrToken(auth);
            const result = await SteamAPI.isPlayerInCS2(steamId, extractedAuth);

            logger.info('CS2Manager', 'CS2 status result', { steamId, result });
            return result;
        } catch (error) {
            logger.error('CS2Manager', 'Error checking CS2 status', { error: error.message });
            return false;
        }
    }

    /**
     * Check if the current user is playing CS2 and in lobby
     * @returns {Promise<boolean>} - Whether the user is playing CS2 and in lobby
     */
    async checkUserInCS2AndLobby() {
        if (!this.isInitialized || !this.appInputManager) {
            logger.warn('CS2Manager', 'Not initialized or missing appInputManager for lobby check', {
                isInitialized: this.isInitialized,
                hasAppInputManager: !!this.appInputManager
            });
            return false;
        }

        try {
            const steamId = this.appInputManager.getSteamId();
            const auth = this.appInputManager.getAuth();

            logger.debug('CS2Manager', 'Checking CS2 and lobby status for user', { steamId });

            if (!steamId || !auth) {
                logger.warn('CS2Manager', 'Missing steamId or auth for lobby check', {
                    hasSteamId: !!steamId,
                    hasAuth: !!auth
                });
                return false;
            }

            const extractedAuth = Validators.extractApiKeyOrToken(auth);
            const result = await SteamAPI.isPlayerInCS2(steamId, extractedAuth, true); // requireLobby = true

            logger.info('CS2Manager', 'CS2 and lobby status result', { steamId, result });
            return result;
        } catch (error) {
            logger.error('CS2Manager', 'Error checking CS2 and lobby status', { error: error.message });
            return false;
        }
    }

    /**
     * Launch CS2 using Steam protocol
     */
    launchCS2() {
        try {
            const launchUrl = 'steam://run/730/';
            window.open(launchUrl);
            logger.info('CS2Manager', 'Launching CS2...', { launchUrl });
        } catch (error) {
            logger.error('CS2Manager', 'Error launching CS2', { error: error.message });
        }
    }

    /**
     * Start monitoring CS2 status with callback
     * @param {Function} onStatusChange - Callback function called when CS2 status changes
     * @param {number} intervalMs - Check interval in milliseconds (default: 3000)
     * @returns {boolean} - Whether monitoring started successfully
     */
    startStatusMonitoring(onStatusChange, intervalMs = 3000) {
        if (!this.isInitialized || !this.appInputManager) {
            logger.warn('CS2Manager', 'Cannot start monitoring - not initialized', {
                isInitialized: this.isInitialized,
                hasAppInputManager: !!this.appInputManager
            });
            return false;
        }

        if (this.isMonitoring) {
            logger.warn('CS2Manager', 'Monitoring already active');
            return false;
        }

        this.isMonitoring = true;
        logger.info('CS2Manager', 'Starting CS2 status monitoring', { intervalMs });

        this.statusCheckInterval = setInterval(async () => {
            try {
                const isInCS2AndLobby = await this.checkUserInCS2AndLobby();
                logger.debug('CS2Manager', 'Status monitoring check', { isInCS2AndLobby });

                if (onStatusChange) {
                    onStatusChange(isInCS2AndLobby);
                }
            } catch (error) {
                logger.error('CS2Manager', 'Error during status monitoring', { error: error.message });
            }
        }, intervalMs);

        return true;
    }

    /**
     * Stop monitoring CS2 status
     */
    stopStatusMonitoring() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
            this.isMonitoring = false;
            logger.info('CS2Manager', 'CS2 status monitoring stopped');
        }
    }

    /**
     * Launch CS2 and monitor until user is in game and lobby
     * @param {Function} onProgress - Progress callback (optional)
     * @returns {Promise<boolean>} - Whether user successfully entered CS2 and lobby
     */
    async launchAndWaitForLobby(onProgress = null) {
        return new Promise((resolve) => {
            // Launch CS2
            this.launchCS2();

            if (onProgress) {
                onProgress('launching');
            }

            // Start monitoring for lobby entry
            const onStatusChange = (isInCS2AndLobby) => {
                if (isInCS2AndLobby) {
                    this.stopStatusMonitoring();
                    logger.info('CS2Manager', 'User successfully entered CS2 and lobby');
                    if (onProgress) {
                        onProgress('ready');
                    }
                    resolve(true);
                }
            };

            const monitoringStarted = this.startStatusMonitoring(onStatusChange);
            if (!monitoringStarted) {
                logger.error('CS2Manager', 'Failed to start monitoring for lobby entry');
                resolve(false);
            }
        });
    }

    /**
     * Cancel any ongoing launch/monitoring operations
     */
    cancelLaunchOperations() {
        this.stopStatusMonitoring();
        logger.info('CS2Manager', 'Launch operations cancelled');
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.stopStatusMonitoring();
        this.appInputManager = null;
        this.isInitialized = false;
        logger.info('CS2Manager', 'CS2Manager destroyed');
    }
}

// Singleton instance
const cs2Manager = new CS2Manager();

export default cs2Manager;

// export default CS2Manager;
