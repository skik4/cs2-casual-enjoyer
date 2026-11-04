// Shared constants
import { TUTORIAL_TEMPLATES } from "./tutorial-templates.js";

// UI
import AccountView from "../account-view.js";

// Tutorial singletons
import tutorialStateManager from "./tutorial-state-manager.js";
import tutorialUIManager from "./tutorial-ui-manager.js";
import tutorialHighlightManager from "./tutorial-highlight-manager.js";
import tutorialMockDataManager from "./tutorial-mock-data-manager.js";
import tutorialEventManager from "./tutorial-event-manager.js";
import { TUTORIAL_TIMING } from "./tutorial-timing.js";
import { TUTORIAL_STEPS } from "./tutorial-steps.js";
import i18n from "../../i18n/i18n-manager.js";
import logger from "../../utils/logger.js";

/**
 * Tutorial Manager
 * Main orchestrator for tutorial functionality, composed of specialized managers
 */
class TutorialManager {
  constructor() {
    this.stateManager = tutorialStateManager;
    this.uiManager = tutorialUIManager;
    this.highlightManager = tutorialHighlightManager;
    this.mockDataManager = tutorialMockDataManager;
    this.eventManager = tutorialEventManager;
    this.listeners = new Set();
    try {
      i18n.onLanguageChange(() => {
        this.refreshTextsAfterLanguageChange();
      });
    } catch {}
  }

  /**
   * Start the tutorial
   */
  start() {
    if (this.stateManager.getIsActive()) return;

    // The steps carry the texts of the current language
    this.stateManager.steps = TUTORIAL_TEMPLATES.getSteps();

    // The app pauses its friends refresh while the tutorial runs
    this._notify(true);

    // Clean up any existing elements first to prevent conflicts
    this.cleanup();

    this.stateManager.setActive(true);
    this.stateManager.setCurrentStep(TUTORIAL_STEPS.WELCOME);

    // The first steps point at the credential fields
    AccountView.open();
    this.uiManager.createOverlay();

    // Use setTimeout to prevent flicker during initialization without blocking render cycle
    setTimeout(() => {
      this.showStep(this.stateManager.getCurrentStep());
      this.eventManager.setupEventListeners(
        this.stateManager.getCurrentStep(),
        () => this.nextStep(),
        () => this.previousStep(),
        () => this.stop()
      );
    }, TUTORIAL_TIMING.DEFER_MS);
  }

  /**
   * Stop the tutorial
   */
  stop() {
    if (!this.stateManager.getIsActive()) return;

    this.stateManager.reset();
    this.cleanup();
    AccountView.close();

    // The app resumes its friends refresh
    this._notify(false);
  }

  /**
   * Go to next step
   */
  nextStep() {
    const result = this.stateManager.nextStep();
    if (result) {
      this.showStep(result.currentStep, result.previousStep);
    } else {
      this.stop();
    }
  }

  /**
   * Go to previous step
   */
  previousStep() {
    const result = this.stateManager.previousStep();
    if (result) {
      this.showStep(result.currentStep, result.previousStep);
    }
  }

  /**
   * Show a specific step
   * @param {number} stepIndex - Index of the step to show
   * @param {number|null} previousStepIndex - Index of the previous step (for transition handling)
   */
  showStep(stepIndex, previousStepIndex = null) {
    const step = this.stateManager.getCurrentStepData();
    if (!step) return;

    // Handle mock data based on step transitions
    this.mockDataManager.handleStepMockData(stepIndex, previousStepIndex);

    // Remove all existing highlights
    this.highlightManager.removeHighlight();

    // Update modal content
    this.uiManager.updateModal(
      step,
      stepIndex + 1, // 1-based step number
      this.stateManager.getTotalSteps(),
      stepIndex === TUTORIAL_STEPS.WELCOME,
      stepIndex === this.stateManager.getTotalSteps() - 1,
      {
        nextStep: () => this.nextStep(),
        previousStep: () => this.previousStep(),
        stop: () => this.stop(),
      }
    );

    // Handle highlighting based on step
    this.handleStepHighlighting(stepIndex, step);

    // Update event listeners for current step
    this.eventManager.updateEventListeners(
      stepIndex,
      () => this.nextStep(),
      () => this.previousStep(),
      () => this.stop()
    );
  }

  /**
   * Handle highlighting for specific step
   * @param {number} stepIndex - Current step index
   * @param {Object} step - Current step data
   */
  handleStepHighlighting(stepIndex, step) {
    // The token link is inside a notification that is still opening
    if (
      stepIndex === TUTORIAL_STEPS.TOKEN_PAGE &&
      step.target === "#steam-token-help-link"
    ) {
      this.waitForElementAndHighlightImmediate(step.target);
    } else if (
      stepIndex === TUTORIAL_STEPS.FRIENDS_LIST &&
      step.target === "#friends"
    ) {
      // Special handling for Friends List Display step - force position above
      this.highlightTarget(step.target, "top");
    } else if (
      stepIndex === TUTORIAL_STEPS.CONNECTION &&
      step.target === ".friend .status-label"
    ) {
      // Special handling for Connection Process step - force position above
      this.highlightTarget(step.target, null, true);
    } else {
      this.highlightTarget(step.target);
    }
  }

  /**
   * Highlight target element
   * @param {string|null} selector - CSS selector of target element
   * @param {string|null} forcedPosition - Forced position ('top', 'bottom', 'left', 'right', 'center')
   */
  highlightTarget(selector, forcedPosition = null, skipHighlight = false) {
    // Always remove existing highlights first
    this.highlightManager.removeHighlight();

    // Store current target and position for continuous updates
    this.uiManager.setCurrentTarget(selector, forcedPosition);

    if (!selector) {
      // No target element - position modal in center and return
      this.uiManager.positionModal(null, forcedPosition);
      this.uiManager.startPositionUpdates(() =>
        this.stateManager.getIsActive()
      );
      return;
    }

    const element = document.querySelector(selector);
    if (!element) {
      // Element not found - position modal in center and return
      this.uiManager.positionModal(null, forcedPosition);
      this.uiManager.startPositionUpdates(() =>
        this.stateManager.getIsActive()
      );
      return;
    }

    if (!skipHighlight) {
      this.highlightManager.highlightTarget(selector);
    }

    // Position modal near the target element
    this.uiManager.positionModal(element, forcedPosition);

    // Start continuous position updates
    this.uiManager.startPositionUpdates(() => this.stateManager.getIsActive());
  }

  /**
   * Wait for element to appear and then highlight it immediately
   * @param {string} selector - CSS selector of target element
   * @param {string|null} forcedPosition - Forced position ('top', 'bottom', 'left', 'right', 'center')
   */
  waitForElementAndHighlightImmediate(selector, forcedPosition = null) {
    // Store target info for continuous updates
    this.uiManager.setCurrentTarget(selector, forcedPosition);

    this.highlightManager.waitForElementAndHighlight(selector, (element) => {
      this.uiManager.positionModal(element, forcedPosition);
      this.uiManager.startPositionUpdates(() =>
        this.stateManager.getIsActive()
      );
    });
  }

  /**
   * Wait for UI to be ready and start tutorial automatically
   * Uses MutationObserver for efficient DOM monitoring
   */
  waitForUIAndStartTutorial() {
    const tutorialBtn = document.getElementById("tutorial-btn");

    if (tutorialBtn) {
      // UI is already ready, start tutorial immediately
      this.start();
    } else {
      // Use MutationObserver to watch for UI changes
      const observer = new MutationObserver(() => {
        const btn = document.getElementById("tutorial-btn");
        if (btn) {
          observer.disconnect();
          // UI is ready, start tutorial
          this.start();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // Fallback timeout to prevent infinite waiting
      setTimeout(() => {
        observer.disconnect();
        logger.warn(
          "TutorialManager",
          "Tutorial button not found within timeout period"
        );
      }, TUTORIAL_TIMING.ELEMENT_WAIT_MS);
    }
  }

  /**
   * Clean up all tutorial elements and managers
   */
  cleanup() {
    this.uiManager.cleanup();
    this.highlightManager.cleanup();
    this.mockDataManager.cleanup();
    this.eventManager.cleanup();
  }

  // Getter methods for accessing state information
  get isActive() {
    return this.stateManager.getIsActive();
  }

  /**
   * Subscribe to the tutorial starting and stopping
   * @param {Function} listener - Called with true on start, false on stop
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * @private
   */
  _notify(active) {
    for (const listener of [...this.listeners]) {
      try {
        listener(active);
      } catch (error) {
        logger.error("TutorialManager", "Tutorial listener failed", {
          error: error.message,
        });
      }
    }
  }

  /**
   * Rebuild tutorial steps and refresh current modal after language change
   */
  refreshTextsAfterLanguageChange() {
    try {
      if (!this.stateManager.getIsActive()) return;
      const idx = this.stateManager.getCurrentStep();
      this.stateManager.steps = TUTORIAL_TEMPLATES.getSteps();
      this.showStep(idx, idx);
    } catch {}
  }
}

// Singleton instance
const tutorialManager = new TutorialManager();

export default tutorialManager;
