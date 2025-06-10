// Shared constants
import { NOTIFICATION_TEMPLATES, HELP_TEMPLATES } from './html-templates.js';

// UI and utilities
import ErrorHandler from '../utils/error-handler.js';
import DOMUtils from '../utils/dom-utils.js';
import logger from '../utils/logger.js';

/**
 * Notification Manager module
 * Handles all notifications, errors, token information display, and help information
 */
class NotificationManager {
    /**
     * Show a notification with close button
     * @param {string} html - HTML content of the notification
     * @param {string} type - Type of notification ('info', 'error')
     */
    static showNotification(html, type = 'info') {
        const notificationElement = DOMUtils.getElementById('notifications');
        if (!notificationElement) return;

        notificationElement.innerHTML = NOTIFICATION_TEMPLATES.CLOSE_BUTTON + `<div class="notification-content ${type}">${html}</div>`;
        notificationElement.style.display = 'block';

        const closeBtn = notificationElement.querySelector('.notification-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                notificationElement.style.display = 'none';
            };
        }
    }

    /**
     * Show persistent notification about token (steamid and expiration)
     * @param {{steamid: string, expires: number, expiresDate: Date}} tokenInfo
     */
    static showTokenInfoNotification(tokenInfo) {
        this.hideTokenInfoNotification();
        const notificationElement = DOMUtils.getElementById('notifications');
        if (!notificationElement) return;

        const now = Date.now();
        const expiresMs = tokenInfo.expires * 1000;
        const expiresStr = tokenInfo.expiresDate.toLocaleString();
        let expired = expiresMs < now;
        let warnHtml = ''; if (expired) {
            warnHtml = NOTIFICATION_TEMPLATES.TOKEN_EXPIRED_WARNING;
        }

        const html = NOTIFICATION_TEMPLATES.TOKEN_INFO(tokenInfo.steamid, expiresStr, warnHtml);
        const infoDiv = document.createElement('div');
        infoDiv.id = 'token-info-notification';
        infoDiv.className = 'mb-xs';
        infoDiv.innerHTML = html;
        notificationElement.parentNode.insertBefore(infoDiv, notificationElement);
    }

    /**
     * Hide token info notification
     */
    static hideTokenInfoNotification() {
        const infoDiv = DOMUtils.getElementById('token-info-notification');
        if (infoDiv && infoDiv.parentNode) {
            infoDiv.parentNode.removeChild(infoDiv);
        }
    }

    /**
     * Show error to the user
     * @param {string|Error} message - Error message
     * @param {string} steamId - Steam ID for context
     */
    static showError(message, steamId = '') {
        const errorMessage = ErrorHandler.formatErrorMessage(message);

        if (ErrorHandler.isPrivacyError(message)) {
            this.showUpdateError(steamId);
        } else {
            this.showNotification(
                NOTIFICATION_TEMPLATES.ERROR_MESSAGE(errorMessage),
                'error'
            );
        }
    }

    /**
     * Show error updating friends list
     * @param {string} steamId - Steam ID
     */
    static showUpdateError(steamId = '') {
        const currentSteamId = steamId || (DOMUtils.getElementById('steam-id')?.value.trim() || '');
        const privacyUrl = currentSteamId ?
            `steam://openurl/https://steamcommunity.com/profiles/${currentSteamId}/edit/settings/` : '';

        const linkHtml = privacyUrl ? NOTIFICATION_TEMPLATES.PRIVACY_LINK(privacyUrl) : '';

        this.showNotification(this.getPrivacyWarningHtml(linkHtml), 'error');
    }

    /**
     * Get HTML for privacy warning
     * @param {string} linkHtml - HTML for privacy settings link
     * @returns {string} - Privacy warning HTML
     */
    static getPrivacyWarningHtml(linkHtml) {
        return NOTIFICATION_TEMPLATES.PRIVACY_WARNING(linkHtml);
    }

    /**
     * Hide notification
     */
    static hideNotification() {
        const notificationElement = DOMUtils.getElementById('notifications');
        if (notificationElement) {
            notificationElement.style.display = 'none';
        }
    }

    /**
     * Show help notification for Steam ID
     */
    static showSteamIdHelp() {
        this.showNotification(HELP_TEMPLATES.STEAM_ID_HELP, 'info');
    }

    /**
     * Show help notification for API Key
     */
    static showApiKeyHelp() {
        this.showNotification(HELP_TEMPLATES.API_KEY_HELP, 'info');
    }

    /**
     * Cleanup CS2 launch notification elements and intervals
     * @private
     */
    static _cleanupCS2LaunchNotification(launchBtn, closeBtn, checkInterval, handleLaunch, handleClose) {
        logger.debug('NotificationManager', 'Starting CS2 launch notification cleanup', {
            hasLaunchBtn: !!launchBtn,
            hasCloseBtn: !!closeBtn,
            hasCheckInterval: !!checkInterval,
            hasHandleLaunch: !!handleLaunch,
            hasHandleClose: !!handleClose
        });

        if (launchBtn && handleLaunch) {
            launchBtn.removeEventListener('click', handleLaunch);
            logger.debug('NotificationManager', 'Removed launch button event listener');
        }
        if (closeBtn && handleClose) {
            closeBtn.removeEventListener('click', handleClose);
            logger.debug('NotificationManager', 'Removed close button event listener');
        }

        if (checkInterval) {
            clearInterval(checkInterval);
            logger.info('NotificationManager', 'CS2 status check interval cleared and stopped');
        }

        // Reset UI to initial state using templates
        const overlay = DOMUtils.getElementById('cs2-launch-notification');
        if (overlay) {
            const title = overlay.querySelector('.cs2-launch-title');
            const message = overlay.querySelector('.cs2-launch-message');
            const hint = overlay.querySelector('.cs2-launch-hint');

            if (title) title.textContent = NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.title;
            if (message) message.textContent = NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.message;
            if (hint) hint.textContent = NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.hint;

            // Reset button states
            if (launchBtn) {
                launchBtn.disabled = false;
                launchBtn.innerHTML = NOTIFICATION_TEMPLATES.CS2_LAUNCH.INITIAL.launchButton;
            }

            logger.debug('NotificationManager', 'UI reset to initial state');
        }

        logger.info('NotificationManager', 'CS2 launch notification cleanup completed');
    }

    /**
     * Handle CS2 launch notification close button click
     * @private
     */
    static _handleCS2LaunchNotificationClose(context) {
        context.isResolved = true; // Set resolved flag to prevent race conditions
        this.hideCS2LaunchNotification();
        this._cleanupCS2LaunchNotification(
            context.launchBtn,
            context.closeBtn,
            context.checkInterval,
            context.handleLaunch,
            context.handleClose
        );
        context.resolve(false);
    }

    /**
     * Show CS2 launch notification
     * @param {string} friendId - Steam ID of the friend being joined
     * @param {Function} onLaunch - Callback for launch CS2 action
     * @param {CS2Manager} cs2Manager - CS2Manager instance for checking game status
     * @returns {Promise<boolean>} - True if user chooses to launch CS2, false if cancelled
     */
    static showCS2LaunchNotification(friendId, onLaunch, cs2Manager) {
        logger.info('NotificationManager', 'Starting CS2 launch notification', { friendId, hasOnLaunch: !!onLaunch, hasCs2Manager: !!cs2Manager });

        return new Promise((resolve) => {
            const overlay = DOMUtils.getElementById('cs2-launch-notification');

            if (!overlay) {
                logger.error('NotificationManager', 'CS2 notification overlay not found');
                resolve(false);
                return;
            }

            // Create dynamic content using template
            overlay.innerHTML = NOTIFICATION_TEMPLATES.CS2_LAUNCH.FULL_TEMPLATE();

            // Get elements after creating content
            const launchBtn = DOMUtils.getElementById('launch-cs2-btn');
            const closeBtn = DOMUtils.getElementById('close-cs2-launch'); if (!launchBtn || !closeBtn) {
                logger.error('NotificationManager', 'CS2 notification buttons not found after template creation');
                resolve(false);
                return;
            }

            // Create state object to share between handlers
            const state = {
                checkInterval: null,
                isLaunching: false,
                isResolved: false
            };

            // Show overlay
            overlay.style.display = 'flex';

            // Handle launch button click
            const handleLaunch = () => {
                if (state.isLaunching) return; // Prevent multiple clicks

                state.isLaunching = true;

                // Update UI to launching state using templates
                const title = overlay.querySelector('.cs2-launch-title');
                const message = overlay.querySelector('.cs2-launch-message');
                const hint = overlay.querySelector('.cs2-launch-hint');

                if (title) title.textContent = NOTIFICATION_TEMPLATES.CS2_LAUNCH.LAUNCHING.title;
                if (message) message.textContent = NOTIFICATION_TEMPLATES.CS2_LAUNCH.LAUNCHING.message;
                if (hint) hint.textContent = NOTIFICATION_TEMPLATES.CS2_LAUNCH.LAUNCHING.hint;

                // Update button to loading state
                launchBtn.disabled = true;
                launchBtn.innerHTML = NOTIFICATION_TEMPLATES.CS2_LAUNCH.LAUNCHING.launchButton;

                // Launch CS2
                if (onLaunch) {
                    onLaunch();
                }

                // Start checking CS2 status periodically
                logger.info('NotificationManager', 'Starting CS2 status check interval');
                state.checkInterval = setInterval(async () => {
                    try {
                        logger.debug('NotificationManager', 'CS2 Status Check', {
                            cs2ManagerExists: !!cs2Manager,
                            isResolved: state.isResolved,
                            isLaunching: state.isLaunching,
                            cs2ManagerInitialized: cs2Manager?.isInitialized
                        });

                        if (cs2Manager && !state.isResolved) {
                            const isInCS2AndLobby = await cs2Manager.checkUserInCS2AndLobby();
                            logger.info('NotificationManager', 'CS2 and lobby status check completed', { isInCS2AndLobby });

                            if (isInCS2AndLobby && !state.isResolved) {
                                logger.info('NotificationManager', 'User detected in CS2 and lobby, closing notification');

                                // Set resolved flag immediately to prevent multiple executions
                                state.isResolved = true;

                                // Clear the interval immediately to prevent further checks
                                if (state.checkInterval) {
                                    clearInterval(state.checkInterval);
                                    state.checkInterval = null;
                                    logger.debug('NotificationManager', 'Check interval cleared');
                                }

                                // User is now in CS2 and in lobby, close notification immediately
                                logger.info('NotificationManager', 'User is in CS2 and lobby, hiding notification immediately');
                                this.hideCS2LaunchNotification();
                                this._cleanupCS2LaunchNotification(launchBtn, closeBtn, state.checkInterval, handleLaunch, handleClose);
                                resolve(true);
                            } else if (isInCS2AndLobby) {
                                logger.debug('NotificationManager', 'User in CS2 and lobby but already resolved');
                            } else {
                                logger.debug('NotificationManager', 'User not yet in CS2 and lobby, continuing to wait');
                            }
                        } else if (!cs2Manager) {
                            logger.error('NotificationManager', 'CS2Manager is null/undefined during status check');
                        } else if (state.isResolved) {
                            logger.debug('NotificationManager', 'Status check skipped - already resolved');
                        }
                    } catch (error) {
                        logger.error('NotificationManager', 'Error checking CS2 status', { error: error.message });
                    }
                }, 3000); // Check every 3 seconds
            };

            // Handle close button click
            const handleClose = () => {
                logger.info('NotificationManager', 'Close button clicked during CS2 launch process', {
                    hasCheckInterval: !!state.checkInterval,
                    isLaunching: state.isLaunching,
                    isResolved: state.isResolved
                });

                const context = {
                    isResolved: true,
                    launchBtn,
                    closeBtn,
                    checkInterval: state.checkInterval, // Use current interval from state
                    handleLaunch,
                    handleClose,
                    resolve
                };

                // Update state to mark as resolved
                state.isResolved = true;

                this._handleCS2LaunchNotificationClose(context);
            };

            // Add event listeners
            launchBtn.addEventListener('click', handleLaunch);
            closeBtn.addEventListener('click', handleClose);
        });
    }

    /**
     * Hide CS2 launch notification
     */
    static hideCS2LaunchNotification() {
        logger.debug('NotificationManager', 'hideCS2LaunchNotification called');
        const overlay = DOMUtils.getElementById('cs2-launch-notification');
        if (overlay) {
            logger.debug('NotificationManager', 'Hiding CS2 notification overlay', { currentDisplay: overlay.style.display });
            overlay.style.display = 'none';
            logger.info('NotificationManager', 'CS2 notification overlay hidden');
        } else {
            logger.warn('NotificationManager', 'CS2 notification overlay not found in DOM');
        }
    }
}

export default NotificationManager;
