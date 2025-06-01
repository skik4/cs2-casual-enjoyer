import { STATUS_TYPES } from '../shared/constants.js';
import DOMUtils from '../utils/dom-utils.js';
import { FRIENDS_TEMPLATES } from './html-templates.js';

/**
 * Friends Renderer module
 * Handles rendering of friends list in the UI
 */
class FriendsRenderer {
    /**
     * Cache for last rendered friends (for re-rendering on filter)
     */
    static lastRenderedFriends = [];

    /**
     * Render the list of friends in the UI
     * @param {import('../shared/types.js').Friend[]} friends - Array of friend objects
     * @param {Object} joinStates - Map of join states by friend Steam ID
     */
    static renderFriendsList(friends, joinStates = {}) {
        const friendsContainer = DOMUtils.getElementById('friends');
        if (!friendsContainer) return;

        FriendsRenderer.lastRenderedFriends = Array.isArray(friends) ? [...friends] : [];

        // Sort friends alphabetically
        let sortedFriends = [...friends].sort((a, b) => {
            const nameA = (a.personaname || '').toLowerCase();
            const nameB = (b.personaname || '').toLowerCase();
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        });

        // Apply filter
        const filterInput = DOMUtils.getElementById('friend-filter-input');
        let filteredFriends = sortedFriends;

        if (filterInput) {
            const filterValue = filterInput.value.trim().toLowerCase();
            if (filterValue) {
                filteredFriends = sortedFriends.filter(f => {
                    const name = (f.personaname || '').toLowerCase();
                    return name.includes(filterValue);
                });
            }
        }

        // Render friends
        let html = '';
        for (const friend of filteredFriends) {
            const avatarUrl = friend.avatarfull || friend.avatar || friend.avatarmedium || '';
            const joinState = joinStates[friend.steamid];
            const isMissing = joinState && joinState.status === STATUS_TYPES.MISSING;

            html += this.renderFriendItem(friend, joinState, isMissing, avatarUrl);
        }

        // Set the generated HTML to the friends container
        friendsContainer.innerHTML = html;
    }    /**
     * Render individual friend item HTML
     * @param {import('../shared/types.js').Friend} friend - Friend object
     * @param {import('../shared/types.js').JoinState} joinState - Join state
     * @param {boolean} isMissing - Whether friend is missing
     * @param {string} avatarUrl - Avatar URL
     * @returns {string} - Friend item HTML
     */
    static renderFriendItem(friend, joinState, isMissing, avatarUrl) {
        const isActive = joinState && (
            joinState.status === STATUS_TYPES.WAITING ||
            joinState.status === STATUS_TYPES.CONNECTING ||
            isMissing
        );

        const statusText = isMissing ? 'Temporarily not in Casual' : friend.status;
        const hasStatus = friend.status || isMissing;

        return FRIENDS_TEMPLATES.FRIEND_ITEM(
            friend.steamid,
            avatarUrl,
            friend.personaname,
            statusText,
            hasStatus,
            isMissing,
            isActive
        );
    }
}

export default FriendsRenderer;
