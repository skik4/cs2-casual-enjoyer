/**
 * Template of a friend row, for the Friends and the Fake Friends tabs
 */

import { ICON_PATHS } from "../shared/icon-paths.js";
import DOMUtils from "../utils/dom-utils.js";
import { t } from "../i18n/i18n-manager.js";
import { slotAttributes } from "./join-status.js";

export const FRIENDS_TEMPLATES = {
  /**
   * Individual friend item: avatar, name, where they play with a status
   * label, and the join button
   * @param {Object} row
   * @param {string} row.steamid - Steam ID
   * @param {string} row.avatarUrl - Avatar URL
   * @param {string} row.personaname - Display name
   * @param {string} row.whereHtml - Map and score, or status text; already escaped
   * @param {import('./join-status.js').SlotFacts} row.slot - What the row knows about slots
   * @param {{kind: string, text: string}} row.label - Status label
   * @param {{text: string, className: string, disabled: boolean}} row.button - Join button
   * @param {boolean} [row.removable] - Whether to show a remove button (manually added IDs)
   * @returns {string} Friend item HTML
   */
  FRIEND_ITEM: ({
    steamid,
    avatarUrl,
    personaname,
    whereHtml,
    slot,
    label,
    button,
    removable = false,
  }) => {
    // Steam hands out the id, but it lands in attributes like any other text
    const id = DOMUtils.escapeHtml(steamid);
    return `
        <div class="friend" id="friend-${id}">
            <img src="${DOMUtils.escapeHtml(avatarUrl)}" alt="" class="friend-avatar">
            <div class="friend-info">
                <span class="personaname">${DOMUtils.escapeHtml(personaname)}</span>
                <span class="game-line"><span class="game-where">${whereHtml}</span><span id="status-${id}" class="status-label status-${label.kind}" ${slotAttributes(slot)}>${DOMUtils.escapeHtml(label.text)}</span></span>
            </div>
            <div class="join-section">
                <button id="join-btn-${id}" class="${button.className}" ${slotAttributes(slot)}${button.disabled ? " disabled" : ""}>${DOMUtils.escapeHtml(button.text)}</button>
                ${removable ? `<button id="remove-fake-btn-${id}" class="remove-fake-btn" data-i18n="friends.removeFakeFriend" data-i18n-attr="title" title="${t("friends.removeFakeFriend")}">${FRIENDS_TEMPLATES.REMOVE_FAKE_ICON()}</button>` : ""}
            </div>
        </div>
    `;
  },

  /**
   * Icon of the remove button, also restored when a removal is not confirmed
   * @returns {string} Icon HTML
   */
  REMOVE_FAKE_ICON: () =>
    `<img src="${ICON_PATHS.CLOSE}" alt="×" class="icon-16" />`,
};
