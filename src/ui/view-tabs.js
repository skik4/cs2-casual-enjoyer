// UI and utilities
import DOMUtils from "../utils/dom-utils.js";

/**
 * View element for each tab
 */
const VIEWS = {
  friends: "friends-view",
  fake: "fake-view",
  maps: "maps-view",
};

/**
 * View tabs module
 * Switches between friends, manually added Steam IDs and maps.
 */
class ViewTabs {
  static current = "friends";
  static listeners = new Set();

  /**
   * Wire the tab buttons
   */
  static initialize() {
    const tabs = DOMUtils.getElementById("view-tabs");
    if (!tabs) return;
    tabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-view]");
      if (tab) this.show(tab.dataset.view);
    });
  }

  /**
   * Show one view and hide the others
   * @param {"friends"|"fake"|"maps"} view - View to show
   */
  static show(view) {
    if (!VIEWS[view] || view === this.current) return;

    const previous = this.current;
    this.current = view;
    for (const [name, id] of Object.entries(VIEWS)) {
      DOMUtils.toggleClass(id, "hidden", name !== view);
    }
    document.querySelectorAll("#view-tabs [data-view]").forEach((tab) => {
      const active = tab.dataset.view === view;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    for (const listener of [...this.listeners]) listener(view, previous);
  }

  /**
   * Subscribe to view switches
   * @param {Function} listener - Called with (view, previousView)
   */
  static onChange(listener) {
    this.listeners.add(listener);
  }
}

export default ViewTabs;
