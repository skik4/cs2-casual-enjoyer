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
                return false;            }

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
     * Cleanup resources
     */
    destroy() {
        this.appInputManager = null;
        this.isInitialized = false;
        logger.info('CS2Manager', 'CS2Manager destroyed');
    }
}

export default CS2Manager;
