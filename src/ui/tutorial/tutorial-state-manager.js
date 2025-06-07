/**
 * Tutorial State Manager
 * Handles tutorial state, step navigation, and lifecycle management
 */
export class TutorialStateManager {
    constructor(steps) {
        this.isActive = false;
        this.currentStep = 0;
        this.steps = steps;
    }

    /**
     * Check if tutorial is active
     * @returns {boolean}
     */
    getIsActive() {
        return this.isActive;
    }

    /**
     * Set tutorial active state
     * @param {boolean} active
     */
    setActive(active) {
        this.isActive = active;
    }

    /**
     * Get current step index
     * @returns {number}
     */
    getCurrentStep() {
        return this.currentStep;
    }

    /**
     * Set current step
     * @param {number} step
     */
    setCurrentStep(step) {
        this.currentStep = step;
    }

    /**
     * Get current step data
     * @returns {Object|null}
     */
    getCurrentStepData() {
        return this.steps[this.currentStep] || null;
    }

    /**
     * Get total number of steps
     * @returns {number}
     */
    getTotalSteps() {
        return this.steps.length;
    }

    /**
     * Check if can go to next step
     * @returns {boolean}
     */
    canGoNext() {
        return this.currentStep < this.steps.length - 1;
    }

    /**
     * Check if can go to previous step
     * @returns {boolean}
     */
    canGoPrevious() {
        return this.currentStep > 0;
    }

    /**
     * Go to next step
     * @returns {Object|null} Previous and current step data
     */
    nextStep() {
        if (this.canGoNext()) {
            const previousStep = this.currentStep;
            this.currentStep++;
            return {
                previousStep,
                currentStep: this.currentStep,
                stepData: this.getCurrentStepData()
            };
        }
        return null;
    }

    /**
     * Go to previous step
     * @returns {Object|null} Previous and current step data
     */
    previousStep() {
        if (this.canGoPrevious()) {
            const previousStep = this.currentStep;
            this.currentStep--;
            return {
                previousStep,
                currentStep: this.currentStep,
                stepData: this.getCurrentStepData()
            };
        }
        return null;
    }

    /**
     * Reset to first step
     */
    reset() {
        this.currentStep = 0;
        this.isActive = false;
    }

    /**
     * Go to specific step
     * @param {number} stepIndex
     * @returns {Object|null} Previous and current step data
     */
    goToStep(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.steps.length) {
            const previousStep = this.currentStep;
            this.currentStep = stepIndex;
            return {
                previousStep,
                currentStep: this.currentStep,
                stepData: this.getCurrentStepData()
            };
        }
        return null;
    }
}
