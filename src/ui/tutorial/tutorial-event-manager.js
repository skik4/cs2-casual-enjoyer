/**
 * Tutorial Event Manager
 * Handles event listeners for tutorial interactions
 */
export class TutorialEventManager {
    constructor() {
        this.handleAPIKeyClick = null;
        this.handleSteamTokenLinkClick = null;
        this.handleKeyDown = null; // Add keyboard handler
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
        // Remove any existing listeners first to prevent duplicates
        this.removeEventListeners();

        // Store callbacks
        this.nextStepCallback = onNextStep;
        this.previousStepCallback = onPreviousStep;
        this.stopCallback = onStop;

        // Setup keyboard event handler
        this.handleKeyDown = (event) => {
            // Only handle events when tutorial is active and not in input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return; // Don't interfere with form inputs
            }

            switch (event.key) {
                case 'Enter':
                    event.preventDefault();
                    event.stopPropagation();
                    if (this.nextStepCallback) {
                        this.nextStepCallback();
                    }
                    break;

                case 'Backspace':
                    event.preventDefault();
                    event.stopPropagation();
                    if (this.previousStepCallback) {
                        this.previousStepCallback();
                    }
                    break;

                case 'Escape':
                    event.preventDefault();
                    event.stopPropagation();
                    if (this.stopCallback) {
                        this.stopCallback();
                    }
                    break;
            }
        };

        // Add global keyboard listener
        document.addEventListener('keydown', this.handleKeyDown, true); this.handleAPIKeyClick = (event) => {
            // If on step 1 (Steam Web API Token) and user clicks the help link
            if (currentStep === 1) {
                // Auto-advance to step 2 (Get Steam Web API Token)
                // Use setTimeout for smooth transition without blocking the render cycle
                setTimeout(() => {
                    if (this.nextStepCallback) {
                        this.nextStepCallback();
                    }
                }, 0);
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
        // Remove keyboard listener
        if (this.handleKeyDown) {
            document.removeEventListener('keydown', this.handleKeyDown, true);
        }

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
        // Setup new listeners for current step (removeEventListeners is called inside setupEventListeners)
        this.setupEventListeners(currentStep, onNextStep, onPreviousStep, onStop);
    }

    /**
     * Cleanup all event listeners
     */
    cleanup() {
        this.removeEventListeners();
        this.handleAPIKeyClick = null;
        this.handleSteamTokenLinkClick = null;
        this.handleKeyDown = null;
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
