// Shared constants
import { TUTORIAL_TEMPLATES } from '../html-templates.js';

/**
 * Tutorial UI Manager
 * Handles overlay, modal creation, content updates, and positioning
 */
export class TutorialUIManager {
    constructor() {
        this.overlay = null;
        this.modal = null;

        // Position tracking
        this.currentTarget = null;
        this.currentForcedPosition = null;

        // Observers for efficient position tracking
        this.resizeObserver = null;
        this.mutationObserver = null;
        this.intersectionObserver = null;

        // Throttling and debouncing for smooth animations
        this.positionUpdateTimeout = null;
        this.lastPositionUpdate = 0;
        this.positionUpdateThrottle = 16; // ~60fps
        this.positionUpdateDebounce = 100; // Debounce rapid changes
    }

    /**
     * Create the tutorial overlay and modal
     */
    createOverlay() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';

        // Create modal
        this.modal = document.createElement('div');
        this.modal.className = 'tutorial-modal';

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.modal);
    }

    /**
     * Remove tutorial overlay and modal
     */
    removeOverlay() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }

        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    }

    /**
     * Update modal content
     * @param {Object} step - Current step data
     * @param {number} currentStepNumber - Current step number (1-based)
     * @param {number} totalSteps - Total number of steps
     * @param {boolean} isFirstStep - Whether this is the first step
     * @param {boolean} isLastStep - Whether this is the last step
     * @param {Object} callbacks - Event callbacks {nextStep, previousStep, stop}
     */
    updateModal(step, currentStepNumber, totalSteps, isFirstStep, isLastStep, callbacks = {}) {
        if (!this.modal) return;

        this.modal.innerHTML = TUTORIAL_TEMPLATES.MODAL_CONTENT(
            step.icon,
            step.title,
            currentStepNumber,
            totalSteps,
            step.content,
            isFirstStep,
            isLastStep);

        // Setup button event listeners programmatically
        this.setupModalEventListeners(callbacks, isFirstStep, isLastStep);
    }

    /**
     * Setup event listeners for modal buttons
     * @param {Object} callbacks - Event callbacks {nextStep, previousStep, stop}
     * @param {boolean} isFirstStep - Whether this is the first step
     * @param {boolean} isLastStep - Whether this is the last step
     */
    setupModalEventListeners(callbacks, isFirstStep, isLastStep) {
        if (!this.modal) return;

        // Remove existing onclick handlers and add proper event listeners
        const nextBtn = this.modal.querySelector('.tutorial-btn-primary');
        const prevBtn = this.modal.querySelector('.tutorial-nav-buttons .tutorial-btn-secondary');
        const skipBtn = this.modal.querySelector('.tutorial-controls > .tutorial-btn-secondary');

        if (nextBtn) {
            nextBtn.onclick = null; // Remove inline handler
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (callbacks.nextStep) callbacks.nextStep();
            });
        }

        if (prevBtn && !isFirstStep) {
            prevBtn.onclick = null; // Remove inline handler
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (callbacks.previousStep) callbacks.previousStep();
            });
        }

        if (skipBtn) {
            skipBtn.onclick = null; // Remove inline handler
            skipBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (callbacks.stop) callbacks.stop();
            });
        }
    }

    /**
     * Position modal near target element
     * @param {HTMLElement|null} targetElement - Target element to position near
     * @param {string|null} forcedPosition - Forced position ('top', 'bottom', 'left', 'right', 'center')
     */
    positionModal(targetElement, forcedPosition = null) {
        if (!this.modal) return;

        if (!targetElement) {
            // Default center position if no target - calculate absolute position
            // Use requestAnimationFrame to ensure modal dimensions are available after render
            requestAnimationFrame(() => {
                if (!this.modal) return; // Safety check

                const modalRect = this.modal.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                const left = (viewportWidth / 2) - (modalRect.width / 2);
                const top = (viewportHeight / 2) - (modalRect.height / 2);

                this.modal.style.top = `${top}px`;
                this.modal.style.left = `${left}px`;
                this.modal.style.transform = 'none';
            });

            return;
        }

        const rect = targetElement.getBoundingClientRect();
        const modalRect = this.modal.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const verticalSpacing = 10;
        const horizontalPadding = 20;

        let top, left;

        // Handle forced positioning
        if (forcedPosition) {
            switch (forcedPosition) {
                case 'top':
                    top = rect.top - modalRect.height - verticalSpacing;
                    left = rect.left + (rect.width / 2) - (modalRect.width / 2);
                    break;

                case 'bottom':
                    top = rect.bottom + verticalSpacing;
                    left = rect.left + (rect.width / 2) - (modalRect.width / 2);
                    break;

                case 'left':
                    left = rect.left - modalRect.width - verticalSpacing;
                    top = rect.top + (rect.height / 2) - (modalRect.height / 2);
                    break;

                case 'right':
                    left = rect.right + verticalSpacing;
                    top = rect.top + (rect.height / 2) - (modalRect.height / 2);
                    break;

                case 'center':
                    // Use requestAnimationFrame to ensure modal dimensions are available after render
                    requestAnimationFrame(() => {
                        if (!this.modal) return; // Safety check

                        const centerModalRect = this.modal.getBoundingClientRect();
                        const centerViewportWidth = window.innerWidth;
                        const centerViewportHeight = window.innerHeight;

                        const centerLeft = (centerViewportWidth / 2) - (centerModalRect.width / 2);
                        const centerTop = (centerViewportHeight / 2) - (centerModalRect.height / 2);

                        this.modal.style.top = `${centerTop}px`;
                        this.modal.style.left = `${centerLeft}px`;
                        this.modal.style.transform = 'none';
                    });
                    return;

                default:
                    // Fall through to automatic positioning
                    break;
            }

            // If forced position is specified, apply it with basic boundary checks
            if (forcedPosition && forcedPosition !== 'center') {
                // Adjust horizontal position to stay within viewport
                if (left + modalRect.width > viewportWidth - horizontalPadding) {
                    left = viewportWidth - modalRect.width - horizontalPadding;
                }

                if (left < horizontalPadding) {
                    left = horizontalPadding;
                }

                // Adjust vertical position to stay within viewport
                if (top + modalRect.height > viewportHeight - horizontalPadding) {
                    top = viewportHeight - modalRect.height - horizontalPadding;
                }

                if (top < horizontalPadding) {
                    top = horizontalPadding;
                }

                this.modal.style.top = `${top}px`;
                this.modal.style.left = `${left}px`;
                this.modal.style.transform = 'none';
                return;
            }
        }

        // Automatic positioning (original logic)
        top = rect.bottom + verticalSpacing;
        left = rect.left + (rect.width / 2) - (modalRect.width / 2);

        // Adjust if modal would go off screen horizontally
        if (left + modalRect.width > viewportWidth - horizontalPadding) {
            left = viewportWidth - modalRect.width - horizontalPadding;
        }
        if (left < horizontalPadding) {
            left = horizontalPadding;
        }

        // Check if modal fits below the target
        const fitsBelow = (top + modalRect.height) <= (viewportHeight - horizontalPadding);

        if (!fitsBelow) {
            // Try positioning above the target
            const topAbove = rect.top - modalRect.height - verticalSpacing;
            const fitsAbove = topAbove >= horizontalPadding;

            if (fitsAbove) {
                top = topAbove;
            } else {
                // If doesn't fit above or below, position beside the target
                const centerY = rect.top + (rect.height / 2) - (modalRect.height / 2);

                // Try positioning to the right
                const leftRight = rect.right + verticalSpacing;
                const fitsRight = (leftRight + modalRect.width) <= (viewportWidth - horizontalPadding);

                if (fitsRight) {
                    left = leftRight;
                    top = Math.max(horizontalPadding, Math.min(centerY, viewportHeight - modalRect.height - horizontalPadding));
                } else {
                    // Try positioning to the left
                    const leftLeft = rect.left - modalRect.width - verticalSpacing;
                    const fitsLeft = leftLeft >= horizontalPadding;

                    if (fitsLeft) {
                        left = leftLeft;
                        top = Math.max(horizontalPadding, Math.min(centerY, viewportHeight - modalRect.height - horizontalPadding));
                    } else {
                        // As last resort, center vertically and ensure it's visible
                        top = Math.max(horizontalPadding, Math.min(centerY, viewportHeight - modalRect.height - horizontalPadding));
                    }
                }
            }
        }

        this.modal.style.top = `${top}px`;
        this.modal.style.left = `${left}px`;
        this.modal.style.transform = 'none';
    }

    /**
     * Throttled position update to prevent jittery animations
     */
    throttledPositionUpdate() {
        const now = Date.now();

        // Clear any pending debounced update
        if (this.positionUpdateTimeout) {
            clearTimeout(this.positionUpdateTimeout);
        }

        // Throttle rapid updates
        if (now - this.lastPositionUpdate < this.positionUpdateThrottle) {
            this.positionUpdateTimeout = setTimeout(() => {
                this.updateModalPosition();
            },
                this.positionUpdateDebounce);
            return;
        }

        this.lastPositionUpdate = now;
        this.updateModalPosition();
    }

    /**
     * Update modal position based on current target
     */
    updateModalPosition() {
        if (!this.modal) return;

        if (this.currentTarget) {
            const element = document.querySelector(this.currentTarget);
            this.positionModal(element, this.currentForcedPosition);
        } else {
            this.positionModal(null, this.currentForcedPosition);
        }
    }

    /**
     * Set current target and position for position tracking
     * @param {string|null} target - CSS selector
     * @param {string|null} forcedPosition - Forced position
     */
    setCurrentTarget(target, forcedPosition = null) {
        this.currentTarget = target;
        this.currentForcedPosition = forcedPosition;
    }

    /**
     * Get current target
     * @returns {string|null}
     */
    getCurrentTarget() {
        return this.currentTarget;
    }

    /**
     * Get current forced position
     * @returns {string|null}
     */
    getCurrentForcedPosition() {
        return this.currentForcedPosition;
    }

    /**
     * Start efficient position updates using observers
     * @param {Function} isActiveCallback - Function to check if tutorial is still active
     */
    startPositionUpdates(isActiveCallback) {
        // Stop any existing position updates
        this.stopPositionUpdates();

        const updatePosition = () => {
            if (!isActiveCallback() || !this.modal) {
                return;
            }
            this.throttledPositionUpdate();
        };

        // Set up ResizeObserver for window and modal size changes
        this.resizeObserver = new ResizeObserver(() => {
            // Window resize should update immediately for better UX
            if (isActiveCallback() && this.modal) {
                this.updateModalPosition();
            }
        });

        this.resizeObserver.observe(document.body);

        if (this.modal) {
            this.resizeObserver.observe(this.modal);
        }

        // Set up MutationObserver for DOM changes that might affect target element
        // Use throttled updates for mutations to prevent animation interruption
        this.mutationObserver = new MutationObserver(updatePosition);
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });

        // Set up IntersectionObserver for target element visibility changes
        if (this.currentTarget) {
            const targetElement = document.querySelector(this.currentTarget);
            if (targetElement) {
                this.intersectionObserver = new IntersectionObserver(() => {
                    // Visibility changes should update immediately
                    if (isActiveCallback() && this.modal) {
                        this.updateModalPosition();
                    }
                });
                this.intersectionObserver.observe(targetElement);
            }
        }

        // Initial position update
        this.updateModalPosition();
    }

    /**
     * Stop all position update observers
     */
    stopPositionUpdates() {
        // Clear any pending position updates
        if (this.positionUpdateTimeout) {
            clearTimeout(this.positionUpdateTimeout);
            this.positionUpdateTimeout = null;
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }

        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
    }

    /**
     * Cleanup all UI elements and stop updates
     */
    cleanup() {
        this.stopPositionUpdates();
        this.removeOverlay();
        this.currentTarget = null;
        this.currentForcedPosition = null;
    }
}

// // Singleton instance
const tutorialUIManager = new TutorialUIManager();

export default tutorialUIManager;
