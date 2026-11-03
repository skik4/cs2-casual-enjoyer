import { VALIDATION_PATTERNS } from "../shared/constants.js";

/**
 * Schemes the app opens outside itself: web pages and the Steam client.
 * Anything else - file:, ms-settings:, a UNC path - would let a link run
 * local programs through the operating system.
 */
const ALLOWED_PROTOCOLS = new Set(["https:", "steam:"]);

/**
 * Sites the Steam client may be asked to show in its own browser, which is
 * signed in to the user's account
 */
const STEAM_SITES = ["steamcommunity.com", "steampowered.com"];

/**
 * Whether a URL may be handed to shell.openExternal
 * @param {string} url - URL to open
 * @returns {boolean}
 */
export function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    return parsed.protocol !== "steam:" || isAllowedSteamUrl(parsed);
  } catch {
    return false;
  }
}

/**
 * Whether a steam:// URL is one of the few things the app asks the Steam
 * client for. The client's protocol does far more - run any game with any
 * launch options, install, uninstall - and none of that may be reached
 * through a link, whoever built it.
 * @param {URL} url - Parsed steam:// URL
 * @returns {boolean}
 */
function isAllowedSteamUrl(url) {
  // The command is the host part; the rest is checked as written, query and all
  const rest = url.href.slice(`${url.protocol}//${url.host}`.length);
  switch (url.hostname.toLowerCase()) {
    // Launch CS2
    case "run":
      return /^\/730\/?$/.test(rest);
    // Join a casual match: CS2's app id, who to join and their connect token
    case "rungame": {
      const [, appId, steamId, connect, ...more] = rest.split("/");
      return (
        appId === "730" &&
        !more.length &&
        VALIDATION_PATTERNS.STEAM_ID.test(steamId) &&
        VALIDATION_PATTERNS.GC_CONNECT.test(connect)
      );
    }
    // A Steam page in the client's browser
    case "openurl":
      return isSteamSite(rest.slice(1));
    // A page of the client itself, such as SteamIDMyProfile
    case "url":
      return /^\/[\w-]+(\/[\w-]+)*$/.test(rest);
    default:
      return false;
  }
}

/**
 * @param {string} url - Page the Steam client is asked to show
 * @returns {boolean} - Whether it is on one of Steam's own sites, over https
 */
function isSteamSite(url) {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      STEAM_SITES.some(
        (site) => hostname === site || hostname.endsWith(`.${site}`)
      )
    );
  } catch {
    return false;
  }
}
