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
      element.classList.toggle(className, Boolean(add));
    }
  }

  /**
   * Escape text for use inside HTML markup or a quoted attribute. Names,
   * statuses and scores come from other Steam users and must never be
   * parsed as markup.
   * @param {*} value - Text to escape
   * @returns {string} - Escaped text
   */
  static escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
          ch
        ]
    );
  }
}

export default DOMUtils;
