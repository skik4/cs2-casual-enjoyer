import { isAllowedExternalUrl } from "./external-links.js";

/**
 * Which browser permissions the page gets. Chromium grants whatever a page
 * asks for unless Electron is told otherwise - camera, microphone,
 * location, notifications - and the page needs none of that: the tutorial
 * copies a link to the clipboard, and a steam:// link may pass Chromium's
 * own external protocol check on its way to the Steam client.
 * @param {string} permission - Permission name as Electron reports it
 * @param {{externalURL?: string}} [details] - What Electron knows about the request
 * @returns {boolean}
 */
export function isPermissionAllowed(permission, details = {}) {
  switch (permission) {
    case "clipboard-sanitized-write":
      return true;
    case "openExternal":
      return isAllowedExternalUrl(details?.externalURL);
    default:
      return false;
  }
}
