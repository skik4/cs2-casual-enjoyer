/**
 * Tutorial Event Manager
 * Handles event listeners for tutorial interactions
 */
export class TutorialEventManager {
    constructor() {
        this.handleAPIKeyClick = null;
        this.handleSteamTokenLinkClick = null;
        this.nextStepCallback = null;
        this.previousStepCallback = null;
        this.stopCallback = null;
    }

    /**
     * Setup event listeners for tutorial interactions
     * @param {number} currentStep - Current tutorial step
     * @param {Function} onNextStep - Callback for next step
     * @param {Function} onPreviousStep - Callback for previous step
     * @param {Function} onStop - Callback for stopping tutorial
     */
    setupEventListeners(currentStep, onNextStep, onPreviousStep = null, onStop = null) {
        // Store callbacks
        this.nextStepCallback = onNextStep;
        this.previousStepCallback = onPreviousStep;
        this.stopCallback = onStop;

        this.handleAPIKeyClick = (event) => {
            // If on step 1 (Steam Web API Token) and user clicks the help link
            if (currentStep === 1) {
                // Auto-advance to step 2 (Get Steam Web API Token)
                // Use requestAnimationFrame to ensure smooth transition
                requestAnimationFrame(() => {
                    onNextStep();
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
     * Update event listeners for current step
     * @param {number} currentStep - Current tutorial step
     * @param {Function} onNextStep - Callback for next step
     * @param {Function} onPreviousStep - Callback for previous step
     * @param {Function} onStop - Callback for stopping tutorial
     */
    updateEventListeners(currentStep, onNextStep, onPreviousStep = null, onStop = null) {
        // Remove existing listeners
        this.removeEventListeners();

        // Setup new listeners for current step
        this.setupEventListeners(currentStep, onNextStep, onPreviousStep, onStop);
    }

    /**
     * Cleanup all event listeners
     */
    cleanup() {
        this.removeEventListeners();
        this.handleAPIKeyClick = null;
        this.handleSteamTokenLinkClick = null;
        this.nextStepCallback = null;
        this.previousStepCallback = null;
        this.stopCallback = null;
    }

    /**
     * Get callbacks for use in global scope (for onclick handlers)
     */
    getCallbacks() {
        return {
            nextStep: this.nextStepCallback,
            previousStep: this.previousStepCallback,
            stop: this.stopCallback
        };
    }
}
