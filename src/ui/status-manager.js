// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import JoinBar from "./join-bar.js";
import { joinButtonLook, readSlotFacts, statusLabel } from "./join-status.js";

/**
 * Status Manager module
 * Shows join statuses: the label and the join button of a row, and the join
 * bar above the tabs
 */
class StatusManager {
  /**
   * Show a join status in its row's label and in the join bar
   * @param {string} id - Friend's Steam ID, or a map or server join id
   * @param {string} status - Join status
   */
  static updateLabel(id, status) {
    const label = DOMUtils.getElementById(`status-${id}`);
    if (label) {
      const look = statusLabel(status, readSlotFacts(label));
      label.className = `status-label status-${look.kind}`;
      label.textContent = look.text;
    }
    JoinBar.render();
  }

  /**
   * Update the join button appearance and behavior
   * @param {string} id - Friend's Steam ID, or a map or server join id
   * @param {string} status - Join status
   */
  static updateJoinButton(id, status) {
    const button = DOMUtils.getElementById(`join-btn-${id}`);
    if (!button) return;

    const look = joinButtonLook(status, readSlotFacts(button));
    button.textContent = look.text;
    button.className = look.className;
    button.disabled = look.disabled;
  }
}

export default StatusManager;
