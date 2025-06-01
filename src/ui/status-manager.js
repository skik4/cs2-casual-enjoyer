import { STATUS_TYPES } from '../shared/constants.js';
import DOMUtils from '../utils/dom-utils.js';

/**
 * Status Manager module
 * Handles status dots and button state management
 */
class StatusManager {
    /**
     * Status dot CSS class mapping
     */
    static get STATUS_DOT_CLASSES() {
        return {
            [STATUS_TYPES.WAITING]: 'dot-waiting',
            [STATUS_TYPES.CONNECTING]: 'dot-connecting',
            [STATUS_TYPES.JOINED]: 'dot-joined',
            [STATUS_TYPES.CANCELLED]: 'dot-cancelled',
            [STATUS_TYPES.MISSING]: 'dot-missing'
        };
    }

    /**
     * Get the appropriate CSS class for a status dot
     * @param {string} status - Join status
     * @returns {string} - CSS class for the status dot
     */
    static getStatusDotClass(status) {
        return this.STATUS_DOT_CLASSES[status] || this.STATUS_DOT_CLASSES[STATUS_TYPES.CANCELLED];
    }

    /**
     * Update the status dot appearance based on join status
     * @param {string} friend_id - Steam ID of the friend
     * @param {string} status - Join status
     */
    static updateDot(friend_id, status) {
        const dot = DOMUtils.getElementById('dot-' + friend_id);
        if (dot) {
            dot.className = 'status-dot ' + this.getStatusDotClass(status);
        }
    }

    /**
     * Update the join button appearance and behavior
     * @param {string} friend_id - Steam ID of the friend
     * @param {string} status - Join status
     */
    static updateJoinButton(friend_id, status) {
        const btn = DOMUtils.getElementById('join-btn-' + friend_id);
        if (!btn) return;

        const isActive = status === STATUS_TYPES.WAITING ||
            status === STATUS_TYPES.CONNECTING ||
            status === STATUS_TYPES.MISSING;

        if (isActive) {
            btn.textContent = "Cancel";
            btn.classList.add('cancel-btn');
        } else {
            btn.textContent = "Join";
            btn.classList.remove('cancel-btn');
        }

        btn.disabled = (status === STATUS_TYPES.JOINED);
    }
}

export default StatusManager;
