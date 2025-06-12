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

    element.classList.add("tutorial-highlight");
  }

  /**
   * Remove highlight from all elements
   */
  removeHighlight() {
    const highlighted = document.querySelectorAll(".tutorial-highlight");
    highlighted.forEach((el) => el.classList.remove("tutorial-highlight"));
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
      // Use MutationObserver for efficient DOM monitoring
      const observer = new MutationObserver(() => {
        const elem = document.querySelector(selector);
        if (elem && elem.offsetParent !== null) {
          observer.disconnect();
          this.highlightTarget(selector);
          if (callback) callback(elem);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });

      // Fallback timeout to prevent infinite waiting
      setTimeout(() => {
        observer.disconnect();
      }, 10000); // 10 second timeout
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
  waitForElementWithAttempts(
    selector,
    attempts = 0,
    maxAttempts = 50,
    callback = null,
    failureCallback = null
  ) {
    const element = document.querySelector(selector);

    if (element && element.offsetParent !== null) {
      // Element found and visible
      this.highlightTarget(selector);
      if (callback) callback(element);
    } else if (attempts < maxAttempts) {
      // Use MutationObserver for more efficient waiting
      const observer = new MutationObserver(() => {
        const elem = document.querySelector(selector);
        if (elem && elem.offsetParent !== null) {
          observer.disconnect();
          this.highlightTarget(selector);
          if (callback) callback(elem);
        } else if (attempts >= maxAttempts) {
          observer.disconnect();
          if (failureCallback) failureCallback();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });

      // Recursive retry with timeout
      setTimeout(() => {
        observer.disconnect();
        this.waitForElementWithAttempts(
          selector,
          attempts + 1,
          maxAttempts,
          callback,
          failureCallback
        );
      }, 100); // Check every 100ms
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

// Singleton instance
const tutorialHighlightManager = new TutorialHighlightManager();

export default tutorialHighlightManager;
