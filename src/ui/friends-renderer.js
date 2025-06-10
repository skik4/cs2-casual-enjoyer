// Shared constants
import { FRIENDS_TEMPLATES } from './html-templates.js';
import { TUTORIAL_MOCK_FRIEND } from '../shared/constants.js';

// Core singletons
import appStateManager from '../core/app-state-manager.js';

// Shared constants
import { STATUS_TYPES } from '../shared/constants.js';

// UI and utilities
import DOMUtils from '../utils/dom-utils.js';

/**
 * Friends Renderer module
 * Handles rendering of friends list in the UI
 */
class FriendsRenderer {
    // Cache for last rendered friends (for re-rendering on filter)
    static lastRenderedFriends = [];


    /**
     * Render the list of friends in the UI
     * @param {import('../shared/types.js').Friend[]} friends - Array of friend objects
     * @param {Object} joinStates - Map of join states by friend Steam ID
     */
    static renderFriendsList(friends, joinStates = {}) {
        const friendsContainer = DOMUtils.getElementById('friends');
        if (!friendsContainer) return;

        // Check if we should show tutorial mock friend
        const showTutorialMockFriend = appStateManager.getState('showTutorialMockFriend');
        let friendsToRender = Array.isArray(friends) ? [...friends] : [];

        // Add tutorial mock friend at the beginning if tutorial is active
        if (showTutorialMockFriend) {
            // Remove existing mock friend if present (to avoid duplicates)
            friendsToRender = friendsToRender.filter(f => f.steamid !== TUTORIAL_MOCK_FRIEND.steamid);
            // Add mock friend at the beginning
            friendsToRender.unshift(TUTORIAL_MOCK_FRIEND);
        } FriendsRenderer.lastRenderedFriends = friendsToRender;

        // Sort friends alphabetically, but keep tutorial mock friend at the top
        let sortedFriends;
        if (showTutorialMockFriend && friendsToRender.length > 0 && friendsToRender[0].steamid === TUTORIAL_MOCK_FRIEND.steamid) {
            // Keep mock friend at the top, sort the rest
            const mockFriend = friendsToRender[0];
            const otherFriends = friendsToRender.slice(1).sort((a, b) => {
                const nameA = (a.personaname || '').toLowerCase();
                const nameB = (b.personaname || '').toLowerCase();
                return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
            });
            sortedFriends = [mockFriend, ...otherFriends];
        } else {
            // Normal sorting
            sortedFriends = [...friendsToRender].sort((a, b) => {
                const nameA = (a.personaname || '').toLowerCase();
                const nameB = (b.personaname || '').toLowerCase();
                return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
            });
        }

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

        // Use incremental update instead of full re-render to preserve animations
        this.updateFriendsListIncremental(friendsContainer, filteredFriends, joinStates);
    }

    /**
     * Update friends list incrementally to preserve DOM elements and animations
     * @param {HTMLElement} container - Friends container element
     * @param {import('../shared/types.js').Friend[]} friends - Array of friend objects
     * @param {Object} joinStates - Map of join states by friend Steam ID
     */
    static updateFriendsListIncremental(container, friends, joinStates = {}) {
        // Get current friend elements in the DOM
        const existingElements = new Map();
        const currentFriendElements = container.children;

        for (let i = 0; i < currentFriendElements.length; i++) {
            const element = currentFriendElements[i];
            const friendId = element.id.replace('friend-', '');
            existingElements.set(friendId, element);
        }

        // Create a set of friend IDs that should be visible
        const visibleFriendIds = new Set(friends.map(f => f.steamid));

        // Remove friends that are no longer in the list
        for (const [friendId, element] of existingElements) {
            if (!visibleFriendIds.has(friendId)) {
                element.remove();
                existingElements.delete(friendId);
            }
        }

        // Update or create friend elements
        let lastInsertedElement = null;

        for (const friend of friends) {
            const existingElement = existingElements.get(friend.steamid);
            const avatarUrl = friend.avatarfull || friend.avatar || friend.avatarmedium || '';
            const joinState = joinStates[friend.steamid];
            const isMissing = joinState && joinState.status === STATUS_TYPES.MISSING;

            if (existingElement) {
                // Update existing element content without recreating it
                this.updateFriendElement(existingElement, friend, joinState, isMissing, avatarUrl);

                // Ensure proper order - move element if needed
                const nextSibling = lastInsertedElement ? lastInsertedElement.nextElementSibling : container.firstElementChild;
                if (existingElement !== nextSibling) {
                    container.insertBefore(existingElement, nextSibling);
                }
                lastInsertedElement = existingElement;
            } else {
                // Create new element
                const newElement = this.createFriendElement(friend, joinState, isMissing, avatarUrl);

                // Insert in correct position
                const nextSibling = lastInsertedElement ? lastInsertedElement.nextElementSibling : container.firstElementChild;
                container.insertBefore(newElement, nextSibling);
                lastInsertedElement = newElement;
            }
        }
    }

    /**
     * Create a new friend DOM element
     * @param {import('../shared/types.js').Friend} friend - Friend object
     * @param {import('../shared/types.js').JoinState} joinState - Join state
     * @param {boolean} isMissing - Whether friend is missing
     * @param {string} avatarUrl - Avatar URL
     * @returns {HTMLElement} - Friend DOM element
     */
    static createFriendElement(friend, joinState, isMissing, avatarUrl) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = this.renderFriendItem(friend, joinState, isMissing, avatarUrl);
        return wrapper.firstElementChild;
    }

    /**
     * Update existing friend DOM element with new data
     * @param {HTMLElement} element - Existing friend DOM element
     * @param {import('../shared/types.js').Friend} friend - Friend object
     * @param {import('../shared/types.js').JoinState} joinState - Join state
     * @param {boolean} isMissing - Whether friend is missing
     * @param {string} avatarUrl - Avatar URL
     */
    static updateFriendElement(element, friend, joinState, isMissing, avatarUrl) {
        // Update avatar
        const avatarImg = element.querySelector('.friend-avatar');
        if (avatarImg && avatarImg.src !== avatarUrl) {
            avatarImg.src = avatarUrl;
        }

        // Update persona name
        const nameSpan = element.querySelector('.personaname');
        if (nameSpan && nameSpan.textContent !== friend.personaname) {
            nameSpan.textContent = friend.personaname;
        }

        // Update game status
        const statusSpan = element.querySelector('.game-status');
        const statusText = isMissing ? 'Temporarily not in supported mode' : friend.status;
        const hasStatus = friend.status || isMissing;

        if (hasStatus) {
            if (statusSpan) {
                if (statusSpan.textContent !== statusText) {
                    statusSpan.textContent = statusText;
                }
            } else {
                // Add status span if it doesn't exist
                const friendInfo = element.querySelector('.friend-info');
                const newStatusSpan = document.createElement('span');
                newStatusSpan.className = 'game-status';
                newStatusSpan.style.fontWeight = '400';
                newStatusSpan.style.color = '#bfc9d8';
                newStatusSpan.textContent = statusText;
                friendInfo.appendChild(newStatusSpan);
            }
        } else if (statusSpan) {
            // Remove status span if no status
            statusSpan.remove();
        }

        // Update status dot and button state
        this.updateFriendControls(element, friend.steamid, joinState, isMissing);
    }

    /**
     * Update friend controls (status dot and join button) without disrupting animations
     * @param {HTMLElement} element - Friend DOM element
     * @param {string} friendId - Friend Steam ID
     * @param {import('../shared/types.js').JoinState} joinState - Join state
     * @param {boolean} isMissing - Whether friend is missing
     */
    static updateFriendControls(element, friendId, joinState, isMissing) {
        const statusDot = element.querySelector(`#dot-${friendId}`);
        const joinButton = element.querySelector(`#join-btn-${friendId}`);

        const isActive = joinState && (
            joinState.status === STATUS_TYPES.WAITING ||
            joinState.status === STATUS_TYPES.CONNECTING ||
            isMissing
        );

        // Update status dot class only if different to preserve animations
        if (statusDot) {
            let newDotClass = 'status-dot ';
            if (joinState && joinState.status) {
                // Use the same mapping as StatusManager
                const statusDotClasses = {
                    [STATUS_TYPES.WAITING]: 'dot-waiting',
                    [STATUS_TYPES.CONNECTING]: 'dot-connecting',
                    [STATUS_TYPES.JOINED]: 'dot-joined',
                    [STATUS_TYPES.CANCELLED]: 'dot-cancelled',
                    [STATUS_TYPES.MISSING]: 'dot-missing'
                };
                newDotClass += statusDotClasses[joinState.status] || 'dot-cancelled';
            } else {
                newDotClass += isMissing ? 'dot-missing' : 'dot-cancelled';
            }

            // Only update if the class actually changed
            if (statusDot.className !== newDotClass) {
                statusDot.className = newDotClass;
            }
        }

        // Update join button
        if (joinButton) {
            const newButtonText = isActive ? 'Cancel' : 'Join';
            const shouldHaveCancelClass = isActive;
            const currentlyHasCancelClass = joinButton.classList.contains('cancel-btn');

            // Update button text if different
            if (joinButton.textContent !== newButtonText) {
                joinButton.textContent = newButtonText;
            }

            // Update button class if different
            if (shouldHaveCancelClass !== currentlyHasCancelClass) {
                if (shouldHaveCancelClass) {
                    joinButton.classList.add('cancel-btn');
                } else {
                    joinButton.classList.remove('cancel-btn');
                }
            }

            // Update disabled state
            const shouldBeDisabled = (joinState && joinState.status === STATUS_TYPES.JOINED);
            if (joinButton.disabled !== shouldBeDisabled) {
                joinButton.disabled = shouldBeDisabled;
            }
        }
    }

    /**
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

        const statusText = isMissing ? 'Temporarily not in supported mode' : friend.status;
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
