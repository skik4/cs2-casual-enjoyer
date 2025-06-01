/**
 * DOM utility functions
 * Provides helper functions for common DOM operations
 */
class DOMUtils {
    /**
     * Get element by ID
     * @param {string} id - Element ID
     * @returns {HTMLElement|null} - Found element or null
     */
    static getElementById(id) {
        return document.getElementById(id);
    }

    /**
     * Get element by ID with type safety
     * @param {string} id - Element ID
     * @param {string} [expectedTag] - Expected tag name for validation
     * @returns {HTMLElement|null} - Found element or null
     */
    static getElementByIdSafe(id, expectedTag = null) {
        const element = document.getElementById(id);
        if (element && expectedTag && element.tagName.toLowerCase() !== expectedTag.toLowerCase()) {
            console.warn(`Element '${id}' expected to be '${expectedTag}' but is '${element.tagName}'`);
            return null;
        }
        return element;
    }

    /**
     * Get input element by ID with value
     * @param {string} id - Input element ID
     * @returns {{element: HTMLInputElement|null, value: string}} - Element and its trimmed value
     */
    static getInputValue(id) {
        const element = document.getElementById(id);
        if (!element) {
            return { element: null, value: '' };
        }
        return { 
            element: element,
            value: element.value ? element.value.trim() : ''
        };
    }

    /**
     * Set element visibility
     * @param {string} id - Element ID
     * @param {boolean} visible - Whether element should be visible
     */
    static setVisible(id, visible) {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = visible ? '' : 'none';
        }
    }

    /**
     * Set element text content safely
     * @param {string} id - Element ID
     * @param {string} text - Text content to set
     */
    static setText(id, text) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * Add or remove CSS class
     * @param {string} id - Element ID
     * @param {string} className - CSS class name
     * @param {boolean} add - Whether to add (true) or remove (false) the class
     */
    static toggleClass(id, className, add) {
        const element = document.getElementById(id);
        if (element) {
            if (add) {
                element.classList.add(className);
            } else {
                element.classList.remove(className);
            }
        }
    }
}

export default DOMUtils;
