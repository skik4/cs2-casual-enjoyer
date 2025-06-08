import SteamAPI from '../steam/steam-api.js';

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
        console.log('CS2Manager initialized');
    }

    /**
     * Check if the current user is playing CS2
     * @returns {Promise<boolean>} - Whether the user is playing CS2
     */
    async checkUserInCS2() {
        if (!this.isInitialized || !this.appInputManager) {
            console.log('CS2Manager: Not initialized or missing appInputManager');
            return false;
        }

        try {
            const steamId = this.appInputManager.getSteamId();
            const auth = this.appInputManager.getAuth();

            console.log('CS2Manager: Checking CS2 status for user:', steamId);

            if (!steamId || !auth) {
                console.log('CS2Manager: Missing steamId or auth');
                return false;
            }

            const extractedAuth = SteamAPI.extractApiKeyOrToken(auth);
            const result = await SteamAPI.isPlayerInCS2(steamId, extractedAuth);

            console.log('CS2Manager: CS2 status result:', result);
            return result;
        } catch (error) {
            console.error('CS2Manager: Error checking CS2 status:', error);
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
            console.log('Launching CS2...');
        } catch (error) {
            console.error('Error launching CS2:', error);
        }
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.appInputManager = null;
        this.isInitialized = false;
        console.log('CS2Manager destroyed');
    }
}

export default CS2Manager;
