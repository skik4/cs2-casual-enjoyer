/**
 * Schemes the app opens outside itself: web pages and the Steam client.
 * Anything else - file:, ms-settings:, a UNC path - would let a link run
 * local programs through the operating system.
 */
const ALLOWED_PROTOCOLS = new Set(["https:", "steam:"]);

/**
 * Whether a URL may be handed to shell.openExternal
 * @param {string} url - URL to open
 * @returns {boolean}
 */
export function isAllowedExternalUrl(url) {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}
