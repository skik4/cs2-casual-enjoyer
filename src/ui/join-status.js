// Shared constants
import { STATUS_TYPES } from "../shared/constants.js";

// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import { t } from "../i18n/i18n-manager.js";

/**
 * Statuses of an attempt that is still running
 */
const RUNNING = [
  STATUS_TYPES.WAITING,
  STATUS_TYPES.CONNECTING,
  STATUS_TYPES.MISSING,
];

/**
 * "[ 3 : 1 ]" as "3 : 1"
 * @param {string|null} score - Rich presence score
 * @returns {string}
 */
export const formatScore = (score) =>
  String(score ?? "").replace(/[[\]]/g, "").trim();

/**
 * What a row knows about its target while no attempt runs. Rows keep it in
 * data attributes of their label and button, so a status update needs
 * nothing but the status.
 * @typedef {Object} SlotFacts
 * @property {boolean} free - The target advertises a free slot
 * @property {boolean} casual - The target is in a casual match at all
 * @property {boolean} [here] - The user is already there: on that server,
 *   on that map, or on the friend's server
 * @property {boolean} [over] - The match there has ended
 * @property {string} [idleText] - Label text instead of the plain slot text
 */

/**
 * Read the slot facts a row stored on one of its elements
 * @param {HTMLElement} element - Status label or join button
 * @returns {SlotFacts}
 */
export function readSlotFacts(element) {
  return {
    free: element.dataset.free === "1",
    casual: element.dataset.casual !== "0",
    here: element.dataset.here === "1",
    over: element.dataset.over === "1",
    idleText: element.dataset.idleText,
  };
}

/**
 * Data attributes that store slot facts on an element
 * @param {SlotFacts} facts
 * @returns {string} - Attribute markup, values already safe for HTML
 */
export function slotAttributes({ free, casual = true, here, over, idleText }) {
  const attributes = [
    `data-free="${free ? 1 : 0}"`,
    `data-casual="${casual ? 1 : 0}"`,
  ];
  if (here) attributes.push('data-here="1"');
  if (over) attributes.push('data-over="1"');
  if (idleText !== undefined) {
    attributes.push(`data-idle-text="${DOMUtils.escapeHtml(idleText)}"`);
  }
  return attributes.join(" ");
}

/**
 * The label of a row: a running join first, then whether a slot is free
 * @param {string|undefined} status - Join status, when there is an attempt
 * @param {SlotFacts} facts
 * @returns {{kind: string, text: string}} - kind names the CSS modifier;
 *   "none" with no text hides the label
 */
export function statusLabel(status, { free, casual = true, here, over, idleText }) {
  switch (status) {
    case STATUS_TYPES.CONNECTING:
      return { kind: "busy", text: t("join.connecting") };
    case STATUS_TYPES.WAITING:
      return { kind: "busy", text: t("join.waitingForSlot") };
    case STATUS_TYPES.MISSING:
      return { kind: "missing", text: t("join.missing") };
    case STATUS_TYPES.JOINED:
      return { kind: "done", text: t("join.joined") };
    default:
      if (!casual) return { kind: "none", text: idleText ?? "" };
      if (over) return { kind: "over", text: t("join.matchOver") };
      if (here) return { kind: "here", text: idleText ?? t("join.youAreHere") };
      return {
        kind: free ? "free" : "full",
        text: idleText ?? (free ? t("join.freeSlot") : t("join.noSlot")),
      };
  }
}

/**
 * The join button of a row: Cancel while an attempt runs; otherwise Join,
 * or Wait for a slot when the target is in casual but full. Join stays
 * blocked where the user already is and once the match there has ended.
 * @param {string|undefined} status - Join status, when there is an attempt
 * @param {SlotFacts} facts
 * @returns {{text: string, className: string, disabled: boolean}}
 */
export function joinButtonLook(status, { free, casual = true, here, over }) {
  if (RUNNING.includes(status)) {
    return {
      text: t("common.cancel"),
      className: "action-btn cancel-btn",
      disabled: false,
    };
  }
  if (casual && (here || over)) {
    return { text: t("common.join"), className: "action-btn", disabled: true };
  }
  const waits = casual && !free;
  return {
    text: waits ? t("join.waitButton") : t("common.join"),
    className: waits ? "action-btn wait-btn" : "action-btn",
    disabled: status === STATUS_TYPES.JOINED,
  };
}
