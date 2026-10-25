/**
 * SVG Emoji Utility
 * Provides SVG emoji icons as a replacement for Unicode emojis
 */

// Mapping of Unicode emojis to SVG file names
const EMOJI_SVG_MAP = {
  "🔑": "emoji_u1f511.svg", // key
  "🆔": "emoji_u1f194.svg", // ID button
  "🎮": "emoji_u1f3ae.svg", // video game
  "🌐": "emoji_u1f310.svg", // globe with meridians
  "📋": "emoji_u1f4cb.svg", // clipboard
  "🔄": "emoji_u1f504.svg", // counterclockwise arrows button
  "🔍": "emoji_u1f50d.svg", // magnifying glass tilted left
  "👥": "emoji_u1f465.svg", // busts in silhouette
  "🚀": "emoji_u1f680.svg", // rocket
  "🟡": "emoji_u1f7e1.svg", // yellow circle
  "🎉": "emoji_u1f389.svg", // party popper
  "📖": "emoji_u1f4d6.svg", // open book
};

// Cache for loaded SVG content
const svgCache = new Map();

/**
 * Load SVG content from file
 * @param {string} filename - SVG filename
 * @returns {Promise<string>} SVG content
 */
async function loadSVG(filename) {
  if (svgCache.has(filename)) {
    return svgCache.get(filename);
  }

  try {
    const response = await fetch(`./assets/emoji-svg/${filename}`);
    if (!response.ok) {
      throw new Error(`Failed to load SVG: ${filename}`);
    }
    const svgContent = await response.text();
    svgCache.set(filename, svgContent);
    return svgContent;
  } catch (error) {
    console.warn(`Failed to load SVG emoji ${filename}:`, error);
    return null;
  }
}

/**
 * Get SVG content for a Unicode emoji
 * @param {string} emoji - Unicode emoji character
 * @param {string} className - Optional CSS class for the SVG
 * @param {string} style - Optional inline styles
 * @returns {Promise<string>} SVG HTML or original emoji if not found
 */
export async function getEmojiSVG(emoji, className = "emoji-svg", style = "") {
  const filename = EMOJI_SVG_MAP[emoji];
  if (!filename) {
    console.warn(`No SVG mapping found for emoji: ${emoji}`);
    return emoji; // Fallback to original emoji
  }

  const svgContent = await loadSVG(filename);
  if (!svgContent) {
    return emoji; // Fallback to original emoji
  }

  // Parse SVG and add class/style attributes
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");
  const svgElement = svgDoc.querySelector("svg");

  if (svgElement) {
    // Add CSS class
    if (className) {
      svgElement.setAttribute("class", className);
    }

    // Add inline styles
    if (style) {
      svgElement.setAttribute("style", style);
    }

    // Add accessibility attributes
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute("aria-label", emoji);

    // Set default size if not specified
    if (!svgElement.getAttribute("width") && !style.includes("width")) {
      svgElement.setAttribute("width", "1em");
      svgElement.setAttribute("height", "1em");
    }

    // Return properly escaped SVG HTML
    return svgElement.outerHTML;
  }

  return emoji; // Fallback to original emoji
}

/**
 * Replace all Unicode emojis in a string with SVG equivalents
 * @param {string} text - Text containing Unicode emojis
 * @param {string} className - Optional CSS class for SVG elements
 * @param {string} style - Optional inline styles for SVG elements
 * @returns {Promise<string>} Text with SVG emojis
 */
export async function replaceEmojisWithSVG(
  text,
  className = "emoji-svg",
  style = ""
) {
  let result = text;

  for (const emoji of Object.keys(EMOJI_SVG_MAP)) {
    if (result.includes(emoji)) {
      const svgHTML = await getEmojiSVG(emoji, className, style);
      result = result.replaceAll(emoji, svgHTML);
    }
  }

  return result;
}

export default {
  getEmojiSVG,
  replaceEmojisWithSVG,
};
