import { TUTORIAL_TEMPLATES } from '../html-templates.js';
import { TutorialStateManager } from './tutorial-state-manager.js';
import { TutorialUIManager } from './tutorial-ui-manager.js';
import { TutorialHighlightManager } from './tutorial-highlight-manager.js';
import { TutorialMockDataManager } from './tutorial-mock-data-manager.js';
import { TutorialEventManager } from './tutorial-event-manager.js';

/**
 * Tutorial Manager
 * Main orchestrator for tutorial functionality, composed of specialized managers
 */
class TutorialManager {
    constructor() {
        // Initialize sub-managers
        this.stateManager = new TutorialStateManager(TUTORIAL_TEMPLATES.STEPS);
        this.uiManager = new TutorialUIManager();
        this.highlightManager = new TutorialHighlightManager();
        this.mockDataManager = new TutorialMockDataManager();
        this.eventManager = new TutorialEventManager();
    }

    /**
     * Start the tutorial
     */
    start() {
        if (this.stateManager.getIsActive()) return;

        // Clean up any existing elements first to prevent conflicts
        this.cleanup();

        this.stateManager.setActive(true);
        this.stateManager.setCurrentStep(0);

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
        }, 0);
    }

    /**
     * Stop the tutorial
     */
    stop() {
        if (!this.stateManager.getIsActive()) return;

        this.stateManager.reset();
        this.cleanup();
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
            stepIndex === 0,
            stepIndex === this.stateManager.getTotalSteps() - 1,
            {
                nextStep: () => this.nextStep(),
                previousStep: () => this.previousStep(),
                stop: () => this.stop()
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
        // Special handling for step 2 (Get Steam Web API Token) - use immediate method
        if (stepIndex === 2 && step.target === '.steam-token-link') {
            this.waitForElementAndHighlightImmediate(step.target);
        } else if (stepIndex === 6 && step.target === '#friends') {
            // Special handling for Friends List Display step - force position above
            this.highlightTarget(step.target, 'top');
        } else {
            this.highlightTarget(step.target);
        }
    }

    /**
     * Highlight target element
     * @param {string|null} selector - CSS selector of target element
     * @param {string|null} forcedPosition - Forced position ('top', 'bottom', 'left', 'right', 'center')
     */
    highlightTarget(selector, forcedPosition = null) {
        // Always remove existing highlights first
        this.highlightManager.removeHighlight();

        // Store current target and position for continuous updates
        this.uiManager.setCurrentTarget(selector, forcedPosition);

        if (!selector) {
            // No target element - position modal in center and return
            this.uiManager.positionModal(null, forcedPosition);
            this.uiManager.startPositionUpdates(() => this.stateManager.getIsActive());
            return;
        }

        const element = document.querySelector(selector);
        if (!element) {
            // Element not found - position modal in center and return
            this.uiManager.positionModal(null, forcedPosition);
            this.uiManager.startPositionUpdates(() => this.stateManager.getIsActive());
            return;
        }

        this.highlightManager.highlightTarget(selector);

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
            this.uiManager.startPositionUpdates(() => this.stateManager.getIsActive());
        });
    }    /**
     * Wait for UI to be ready and start tutorial automatically
     * Uses MutationObserver for efficient DOM monitoring
     */
    waitForUIAndStartTutorial() {
        const tutorialBtn = document.getElementById('tutorial-btn');

        if (tutorialBtn) {
            // UI is already ready, start tutorial immediately
            this.start();
        } else {
            // Use MutationObserver to watch for UI changes
            const observer = new MutationObserver(() => {
                const btn = document.getElementById('tutorial-btn');
                if (btn) {
                    observer.disconnect();
                    // UI is ready, start tutorial
                    this.start();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Fallback timeout to prevent infinite waiting
            setTimeout(() => {
                observer.disconnect();
                console.warn('Tutorial button not found within timeout period');
            }, 10000); // 10 second timeout
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

    get currentStep() {
        return this.stateManager.getCurrentStep();
    }

    get steps() {
        return this.stateManager.steps;
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
