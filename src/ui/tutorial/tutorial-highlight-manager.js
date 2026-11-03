import { TUTORIAL_TIMING } from "./tutorial-timing.js";

/**
 * Tutorial Highlight Manager
 * Handles element highlighting
 */
export class TutorialHighlightManager {
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
      }, TUTORIAL_TIMING.ELEMENT_WAIT_MS);
    }
  }

  /**
   * Cleanup all highlights
   */
  cleanup() {
    this.removeHighlight();
  }
}

// Singleton instance
const tutorialHighlightManager = new TutorialHighlightManager();

export default tutorialHighlightManager;
