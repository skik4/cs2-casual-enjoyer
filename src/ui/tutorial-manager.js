import NotificationManager from './notification-manager.js';
import { TUTORIAL_TEMPLATES } from './html-templates.js';

/**
 * Tutorial Manager
 * Handles step-by-step tutorial functionality with navigation controls
 */
class TutorialManager {
    constructor() {
        this.currentStep = 0;
        this.steps = TUTORIAL_TEMPLATES.STEPS;

        this.isActive = false;
        this.overlay = null;
        this.modal = null;
        this.spotlight = null;
        this.handleAPIKeyClick = null;
        this.handleSteamTokenLinkClick = null;
    }

    /**
     * Start the tutorial
     */
    start() {
        if (this.isActive) return;

        this.isActive = true;
        this.currentStep = 0;

        // Clean up any existing elements first
        this.removeHighlight();
        this.removeSpotlight();
        this.removeTutorialOverlay();

        this.createTutorialOverlay();

        // Use requestAnimationFrame to prevent flicker during initialization
        requestAnimationFrame(() => {
            this.showStep(this.currentStep);
            this.setupEventListeners();
        });
    }

    /**
     * Stop the tutorial
     */
    stop() {
        if (!this.isActive) return;

        this.isActive = false;
        this.removeTutorialOverlay();
        this.removeHighlight();
        this.removeSpotlight();
        this.removeEventListeners();
    }

    /**
     * Go to next step
     */
    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);

            // Special handling for step 2 (Get Steam Web API Token step)
            if (this.currentStep === 2) {
                this.openAPITokenNotification();
            }
        } else {
            this.stop();
        }
    }

    /**
     * Go to previous step
     */
    previousStep() {
        if (this.currentStep > 0) {
            // Special handling for step 2 (Get Steam Web API Token step)
            if (this.currentStep === 2) {
                this.closeAPITokenNotification();
            }

            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }

    /**
     * Show a specific step
     * @param {number} stepIndex - Index of the step to show
     */
    showStep(stepIndex) {
        const step = this.steps[stepIndex];
        if (!step) return;

        // Remove all existing highlights and spotlights
        this.removeHighlight();
        this.removeSpotlight();

        // Update content immediately without animations
        this.updateModal(step);

        // Special handling for step 2 (Get Steam Web API Token) - use immediate method
        if (stepIndex === 2 && step.target === '.steam-token-link') {
            this.waitForElementAndHighlightImmediate(step.target);
        } else {
            this.highlightTarget(step.target);
        }
    }

    /**
     * Create the tutorial overlay and modal
     */
    createTutorialOverlay() {
        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'tutorial-overlay';

        // Create modal (initially hidden to prevent flicker)
        this.modal = document.createElement('div');
        this.modal.className = 'tutorial-modal';
        this.modal.style.opacity = '0';
        this.modal.style.visibility = 'hidden';

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.modal);
    }

    /**
     * Remove tutorial overlay and modal
     */
    removeTutorialOverlay() {
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
     */
    updateModal(step) {
        if (!this.modal) return;

        const totalSteps = this.steps.length;
        const currentStepNumber = this.currentStep + 1;

        this.modal.innerHTML = TUTORIAL_TEMPLATES.MODAL_CONTENT(
            step.icon,
            step.title,
            currentStepNumber,
            totalSteps,
            step.content,
            this.currentStep === 0,
            this.currentStep === this.steps.length - 1
        );

        // Show modal after content is set (prevent flicker)
        this.modal.style.opacity = '1';
        this.modal.style.visibility = 'visible';
    }

    /**
     * Highlight target element
     * @param {string|null} selector - CSS selector of target element
     */
    highlightTarget(selector) {
        // Always remove existing highlights and spotlights first
        this.removeHighlight();
        this.removeSpotlight();

        if (!selector) {
            // No target element - position modal in center and return
            this.positionModalNearTarget(null);
            return;
        }

        const element = document.querySelector(selector);
        if (!element) {
            // Element not found - position modal in center and return
            this.positionModalNearTarget(null);
            return;
        }

        element.classList.add('tutorial-highlight');

        // Position modal near the target element
        this.positionModalNearTarget(element);
    }

    /**
     * Remove spotlight effect
     */
    removeSpotlight() {
        if (this.spotlight) {
            this.spotlight.remove();
            this.spotlight = null;
        }
    }

    /**
     * Remove highlight from all elements
     */
    removeHighlight() {
        const highlighted = document.querySelectorAll('.tutorial-highlight');
        highlighted.forEach(el => el.classList.remove('tutorial-highlight'));
        this.removeSpotlight();
    }

    /**
     * Position modal near target element
     * @param {HTMLElement} targetElement - The target element to position near
     */
    positionModalNearTarget(targetElement) {
        if (!this.modal) return;

        if (!targetElement) {
            // Default center position if no target - use CSS defaults
            this.modal.style.top = '50%';
            this.modal.style.left = '50%';
            this.modal.style.transform = 'translate(-50%, -50%)';
            return;
        }

        const rect = targetElement.getBoundingClientRect();
        const modalRect = this.modal.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const verticalSpacing = 10;
        const horizontalPadding = 20;

        let top = rect.bottom + verticalSpacing;
        let left = rect.left + (rect.width / 2) - (modalRect.width / 2);

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
     * Open API token notification if not already open
     */
    openAPITokenNotification() {
        const notificationElement = document.querySelector('#notifications');

        // Check if notification is not already visible
        if (!notificationElement || notificationElement.style.display === 'none' || !notificationElement.style.display) {
            // Use NotificationManager directly instead of simulating click
            NotificationManager.showApiKeyHelp();

            // If we're on step 2, wait for the notification to fully load and then re-highlight
            if (this.currentStep === 2) {
                this.waitForElementAndHighlightImmediate('.steam-token-link');
            }
        } else if (this.currentStep === 2) {
            // Notification is already open, re-highlight the element immediately
            this.waitForElementAndHighlightImmediate('.steam-token-link');
        }
    }

    /**
     * Close API token notification if open
     */
    closeAPITokenNotification() {
        // Use NotificationManager directly instead of simulating button click
        NotificationManager.hideNotification();
    }

    /**
     * Setup event listeners for tutorial interactions
     */
    setupEventListeners() {
        this.handleAPIKeyClick = (event) => {
            // If on step 1 (Steam Web API Token) and user clicks the help link
            if (this.currentStep === 1 && this.isActive) {
                // Auto-advance to step 2 (Get Steam Web API Token)
                this.openAPITokenNotification();
                // Use requestAnimationFrame to allow notification to open, then advance
                requestAnimationFrame(() => {
                    this.nextStep();
                });
            }
        };

        const apiKeyHelp = document.querySelector('#api-key-help');
        if (apiKeyHelp) {
            apiKeyHelp.addEventListener('click', this.handleAPIKeyClick);
        }
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        const apiKeyHelp = document.querySelector('#api-key-help');
        if (apiKeyHelp && this.handleAPIKeyClick) {
            apiKeyHelp.removeEventListener('click', this.handleAPIKeyClick);
        }
    }

    /**
     * Wait for UI to be ready and start tutorial automatically
     * Uses requestAnimationFrame to check for UI readiness, then starts tutorial
     */
    waitForUIAndStartTutorial() {
        const startTutorialWhenReady = () => {
            const tutorialBtn = document.getElementById('tutorial-btn');

            if (tutorialBtn) {
                // UI is ready, start tutorial directly without button click to prevent flicker
                this.start();
            } else {
                // UI not ready yet, try again on next frame
                requestAnimationFrame(startTutorialWhenReady);
            }
        };

        // Start checking on next frame
        requestAnimationFrame(startTutorialWhenReady);
    }

    /**
     * Wait for element to appear and then highlight it immediately
     * @param {string} selector - CSS selector of target element
     */
    waitForElementAndHighlightImmediate(selector) {
        const element = document.querySelector(selector);

        if (element && element.offsetParent !== null) {
            // Element is immediately available and visible
            this.highlightTarget(selector);
        } else {
            // Use requestAnimationFrame for smoother checking
            const checkElement = () => {
                const elem = document.querySelector(selector);
                if (elem && elem.offsetParent !== null) {
                    this.highlightTarget(selector);
                } else {
                    // Try again on next frame
                    requestAnimationFrame(checkElement);
                }
            };
            requestAnimationFrame(checkElement);
        }
    }

    /**
     * Wait for element to appear and then highlight it
     * Uses requestAnimationFrame for smoother DOM checking and layout stability
     * @param {string} selector - CSS selector of target element
     * @param {number} attempts - Current attempt number
     */
    waitForElementAndHighlight(selector, attempts) {
        const maxAttempts = 50; // Increased attempts for more persistence
        const element = document.querySelector(selector); if (element) {
            // Element found, wait for next frame for layout to stabilize, then highlight it
            requestAnimationFrame(() => {
                // Double-check element is still there and visible
                const checkElement = document.querySelector(selector);
                if (checkElement && checkElement.offsetParent !== null) {
                    this.highlightTarget(selector);
                } else {
                    // Element disappeared or not visible, try again
                    if (attempts < maxAttempts) {
                        this.waitForElementAndHighlight(selector, attempts + 1);
                    } else {
                        this.positionModalNearTarget(null);
                    }
                }
            });

            // Use requestAnimationFrame for smoother layout stabilization
        } else if (attempts < maxAttempts) {
            // Element not found, try again on next frame for faster checking
            requestAnimationFrame(() => {
                this.waitForElementAndHighlight(selector, attempts + 1);
            });
        } else {
            // Element not found after max attempts, position modal in center
            this.positionModalNearTarget(null);
        }
    }
}

// Singleton instance
let tutorialManagerInstance = null;

/**
 * Get or create the singleton instance of TutorialManager
 * @returns {TutorialManager} The singleton instance
 */
function getTutorialManager() {
    if (!tutorialManagerInstance) {
        tutorialManagerInstance = new TutorialManager();
    }
    return tutorialManagerInstance;
}

// Create and export the singleton instance
const tutorialManager = getTutorialManager();

export default TutorialManager;
export { tutorialManager, getTutorialManager };
