// Shared constants
import { STATUS_TYPES } from "../shared/constants.js";

// UI and utilities
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
 * What a row knows about its target while no attempt runs. Rows keep it in
 * data attributes of their label and button, so a status update needs
 * nothing but the status.
 * @typedef {Object} SlotFacts
 * @property {boolean} free - The target advertises a free slot
 * @property {boolean} casual - The target is in a casual match at all
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
    idleText: element.dataset.idleText,
  };
}

/**
 * Data attributes that store slot facts on an element
 * @param {SlotFacts} facts
 * @returns {string} - Attribute markup, values already safe for HTML
 */
export function slotAttributes({ free, casual = true, idleText }) {
  const attributes = [
    `data-free="${free ? 1 : 0}"`,
    `data-casual="${casual ? 1 : 0}"`,
  ];
  if (idleText !== undefined) {
    attributes.push(`data-idle-text="${escapeAttribute(idleText)}"`);
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
export function statusLabel(status, { free, casual = true, idleText }) {
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
      return {
        kind: free ? "free" : "full",
        text: idleText ?? (free ? t("join.freeSlot") : t("join.noSlot")),
      };
  }
}

/**
 * The join button of a row: Cancel while an attempt runs; otherwise Join,
 * or Wait for a slot when the target is in casual but full
 * @param {string|undefined} status - Join status, when there is an attempt
 * @param {SlotFacts} facts
 * @returns {{text: string, className: string, disabled: boolean}}
 */
export function joinButtonLook(status, { free, casual = true }) {
  if (RUNNING.includes(status)) {
    return {
      text: t("common.cancel"),
      className: "action-btn cancel-btn",
      disabled: false,
    };
  }
  const waits = casual && !free;
  return {
    text: waits ? t("join.waitButton") : t("common.join"),
    className: waits ? "action-btn wait-btn" : "action-btn",
    disabled: status === STATUS_TYPES.JOINED,
  };
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
