/**
 * The emoji the help texts and the tutorial show, drawn from the SVG files
 * under assets/emoji-svg so they look the same on every machine
 */
const EMOJI_SVG = {
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

/**
 * An emoji as an image of its file, 1em square as the inlined SVG was. An
 * emoji without a file stays text.
 * @param {string} emoji - Unicode emoji
 * @param {string} [className] - CSS classes of the image
 * @param {string} [style] - Inline styles besides the size
 * @returns {string} Image markup, or the emoji itself
 */
export function emojiImg(emoji, className = "emoji-svg", style = "") {
  const file = EMOJI_SVG[emoji];
  if (!file) return emoji;
  return `<img class="${className}" src="assets/emoji-svg/${file}" alt="${emoji}" role="img" aria-label="${emoji}" style="width:1em;height:1em;${style}">`;
}
