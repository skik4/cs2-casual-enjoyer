/**
 * Tutorial Manager
 * Handles step-by-step tutorial functionality with navigation controls
 */
class TutorialManager {
    constructor() {
        this.currentStep = 0;

        this.steps = [
            {
                title: "Welcome to CS2 Casual Enjoyer",
                content: "This tutorial will guide you through the basic features of the application. You can navigate using the buttons below or skip the tutorial entirely.",
                target: null,
                icon: "🎮"
            },
            {
                title: "Steam Web API Token",
                content: "First, you need to enter your Steam Web API Token. Click on the underlined text to learn how to get your token from Steam. This token allows the app to access your Steam friends list.",
                target: "#api-key-help",
                icon: "🔑"
            },
            {
                title: "Get Steam Web API Token",
                content: "Click on 'Get your Steam Web API Token in the Steam client' link to open Steam and get your API token. Follow the instructions there to generate your token.",
                target: ".steam-token-link",
                icon: "🌐"
            },
            {
                title: "Enter Your API Token",
                content: "Now paste your Steam Web API Token into this field. Once you have copied the token from Steam, paste it here to continue.",
                target: "#api-key-input",
                icon: "📝"
            },
            {
                title: "Update Friends List",
                content: "Once you've entered your API token, click this button to load your friends list from Steam. This will fetch all your Steam friends and their current game status.",
                target: "#update-friends-btn",
                icon: "🔄"
            },
            {
                title: "Filter Friends",
                content: "Use this search box to filter your friends by nickname. This helps you quickly find specific friends when you have a large friends list.",
                target: "#friend-filter-input",
                icon: "🔍"
            },
            {
                title: "Tutorial Complete",
                content: "You're all set! The friends list will appear below once loaded. You can join your friends' CS2 games directly from the list by clicking the join button next to their name.",
                target: "#friends",
                icon: "✅"
            }
        ];

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
        this.showStep(this.currentStep);
        this.setupEventListeners();
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
        // Special handling for step 1 (Steam Web API Token step)
        if (this.currentStep === 1) {
            this.openAPITokenNotification();
        }

        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);
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
        this.highlightTarget(step.target);
    }

    /**
     * Create the tutorial overlay and modal
     */
    createTutorialOverlay() {
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
        const currentStepNumber = this.currentStep + 1; this.modal.innerHTML = `
            <div class="tutorial-header">
                <h3 class="tutorial-title">
                    <span class="tutorial-icon">${step.icon || '📖'}</span>
                    ${step.title}
                </h3>
                <div class="tutorial-progress">
                    <span class="tutorial-step-counter">${currentStepNumber} of ${totalSteps}</span>
                    <div class="tutorial-progress-bar">
                        <div class="tutorial-progress-fill" style="width: ${(currentStepNumber / totalSteps) * 100}%"></div>
                    </div>
                </div>
            </div>
            <div class="tutorial-content">
                <p>${step.content}</p>
            </div>
            <div class="tutorial-controls">
                <button class="tutorial-btn tutorial-btn-secondary" onclick="tutorialManager.stop()">
                    Skip Tutorial
                </button>
                <div class="tutorial-nav-buttons">
                    <button class="tutorial-btn tutorial-btn-secondary" 
                            onclick="tutorialManager.previousStep()" 
                            ${this.currentStep === 0 ? 'disabled' : ''}>
                        ← Previous
                    </button>
                    <button class="tutorial-btn tutorial-btn-primary" 
                            onclick="tutorialManager.nextStep()">
                        ${this.currentStep === this.steps.length - 1 ? 'Finish ✓' : 'Next →'}
                    </button>
                </div>
            </div>
        `;
    }    /**
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
    }    /**
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

        let top = rect.bottom + 30;
        let left = rect.left + (rect.width / 2) - (modalRect.width / 2);

        // Adjust if modal would go off screen horizontally
        if (left + modalRect.width > viewportWidth - 20) {
            left = viewportWidth - modalRect.width - 20;
        }
        if (left < 20) {
            left = 20;
        }

        // Adjust if modal would go off screen vertically
        if (top + modalRect.height > viewportHeight - 20) {
            top = rect.top - modalRect.height - 30;
        }
        if (top < 20) {
            top = 20;
        } this.modal.style.top = `${top}px`;
        this.modal.style.left = `${left}px`;
        this.modal.style.transform = 'none';
    }    /**
     * Open API token notification if not already open
     */
    openAPITokenNotification() {
        const apiKeyHelp = document.querySelector('#api-key-help');
        const errorElement = document.querySelector('#error');

        // Check if notification is not already visible
        if (apiKeyHelp && (!errorElement || errorElement.style.display === 'none' || !errorElement.style.display)) {
            // Trigger click on API key help to open notification
            apiKeyHelp.click();
        }
    }

    /**
     * Close API token notification if open
     */
    closeAPITokenNotification() {
        const errorElement = document.querySelector('#error');
        const closeBtn = document.querySelector('.notification-close-btn');

        // If notification is visible, close it
        if (errorElement && errorElement.style.display !== 'none' && closeBtn) {
            closeBtn.click();
        }
    }    /**
     * Setup event listeners for tutorial interactions
     */
    setupEventListeners() {
        this.handleAPIKeyClick = (event) => {
            // If on step 1 (Steam Web API Token) and user clicks the help link
            if (this.currentStep === 1 && this.isActive) {
                // Auto-advance to step 2 (Get Steam Web API Token) immediately
                this.currentStep = 2;
                this.showStep(this.currentStep);
            }
        };

        this.handleSteamTokenLinkClick = (event) => {
            // If on step 2 (Get Steam Web API Token) and user clicks the steam token link
            if (this.currentStep === 2 && this.isActive) {
                const target = event.target;
                // Check if this is the specific Steam API token link by URL
                if (target.href && target.href.includes('store.steampowered.com/pointssummary/ajaxgetasyncconfig')) {
                    // Close the notification and advance to step 3 (Enter Your API Token)
                    this.closeAPITokenNotification();
                    this.currentStep = 3;
                    this.showStep(this.currentStep);
                }
            }
        }; const apiKeyHelp = document.querySelector('#api-key-help');
        if (apiKeyHelp) {
            apiKeyHelp.addEventListener('click', this.handleAPIKeyClick);
        }

        // Add event listener to steam token links for tutorial workflow
        const steamTokenLinks = document.querySelectorAll('.steam-token-link');
        steamTokenLinks.forEach(link => {
            link.addEventListener('click', this.handleSteamTokenLinkClick);
        });
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        const apiKeyHelp = document.querySelector('#api-key-help');
        if (apiKeyHelp && this.handleAPIKeyClick) {
            apiKeyHelp.removeEventListener('click', this.handleAPIKeyClick);
        }

        const steamTokenLinks = document.querySelectorAll('.steam-token-link');
        if (this.handleSteamTokenLinkClick) {
            steamTokenLinks.forEach(link => {
                link.removeEventListener('click', this.handleSteamTokenLinkClick);
            });
        }
    }
}

// Create global instance
const tutorialManager = new TutorialManager();

export default TutorialManager;
