/**
 * The steam:// URLs the app hands to the Steam client, and the one way of
 * opening them. With the Electron bridge they go through the main process,
 * which lets only these shapes through (main/external-links.js); without it,
 * as in tests, the window opens them itself.
 */

/**
 * Launch CS2
 */
export const LAUNCH_CS2_URL = "steam://run/730/";

/**
 * Join a casual match through a player's connect token
 * @param {string} joinAs - SteamID64 the connect token belongs to
 * @param {string} connect - The token, e.g. "+gcconnect0A1B2C3D..."
 * @returns {string}
 */
export function joinUrl(joinAs, connect) {
  return `steam://rungame/730/${joinAs}/${connect}`;
}

/**
 * Ask the Steam client to open a steam:// URL
 * @param {string} url - LAUNCH_CS2_URL or a joinUrl
 * @returns {Promise<boolean>|undefined} - The bridge's answer, for a caller
 *   that waits until the client has been asked; nothing without the bridge
 */
export function openSteamUrl(url) {
  if (window.electronAPI?.shell?.openExternal) {
    return window.electronAPI.shell.openExternal(url);
  }
  window.open(url, "_self");
}
