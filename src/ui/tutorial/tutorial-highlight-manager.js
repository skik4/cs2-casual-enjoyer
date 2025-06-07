/**
 * Tutorial Highlight Manager
 * Handles element highlighting and spotlight effects
 */
export class TutorialHighlightManager {
    constructor() {
        this.spotlight = null;
    }

    /**
     * Highlight target element
     * @param {string|null} selector - CSS selector of target element
     */
    highlightTarget(selector) {
        // Always remove existing highlights first
        this.removeHighlight();

        if (!selector) {
            return;
        }

        const element = document.querySelector(selector);
        if (!element) {
            return;
        }

        element.classList.add('tutorial-highlight');
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
     * Remove spotlight effect
     */
    removeSpotlight() {
        if (this.spotlight) {
            this.spotlight.remove();
            this.spotlight = null;
        }
    }

    /**
     * Wait for element to appear and then highlight it immediately
     * @param {string} selector - CSS selector of target element
     * @param {Function} callback - Callback when element is found and highlighted
     */
    waitForElementAndHighlight(selector, callback = null) {
        const element = document.querySelector(selector);

        if (element && element.offsetParent !== null) {
            // Element is immediately available and visible
            this.highlightTarget(selector);
            if (callback) callback(element);
        } else {
            // Use requestAnimationFrame for smoother checking
            const checkElement = () => {
                const elem = document.querySelector(selector);
                if (elem && elem.offsetParent !== null) {
                    this.highlightTarget(selector);
                    if (callback) callback(elem);
                } else {
                    // Try again on next frame
                    requestAnimationFrame(checkElement);
                }
            };
            requestAnimationFrame(checkElement);
        }
    }

    /**
     * Wait for element to appear with maximum attempts
     * @param {string} selector - CSS selector of target element
     * @param {number} attempts - Current attempt number
     * @param {number} maxAttempts - Maximum number of attempts
     * @param {Function} callback - Callback when element is found
     * @param {Function} failureCallback - Callback when element is not found after max attempts
     */
    waitForElementWithAttempts(selector, attempts = 0, maxAttempts = 50, callback = null, failureCallback = null) {
        const element = document.querySelector(selector);
        
        if (element) {
            // Element found, wait for next frame for layout to stabilize
            requestAnimationFrame(() => {
                // Double-check element is still there and visible
                const checkElement = document.querySelector(selector);
                if (checkElement && checkElement.offsetParent !== null) {
                    this.highlightTarget(selector);
                    if (callback) callback(checkElement);
                } else {
                    // Element disappeared or not visible, try again
                    if (attempts < maxAttempts) {
                        this.waitForElementWithAttempts(selector, attempts + 1, maxAttempts, callback, failureCallback);
                    } else if (failureCallback) {
                        failureCallback();
                    }
                }
            });
        } else if (attempts < maxAttempts) {
            // Element not found, try again on next frame
            requestAnimationFrame(() => {
                this.waitForElementWithAttempts(selector, attempts + 1, maxAttempts, callback, failureCallback);
            });
        } else if (failureCallback) {
            // Element not found after max attempts
            failureCallback();
        }
    }

    /**
     * Cleanup all highlights and spotlights
     */
    cleanup() {
        this.removeHighlight();
        this.removeSpotlight();
    }
}
