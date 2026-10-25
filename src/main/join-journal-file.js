import { promises as fs } from "fs";

// Shared constants
import { JOIN_JOURNAL_CONFIG } from "../shared/constants.js";

// Appends run one after another, so batches never interleave
let writing = Promise.resolve();

/**
 * Append lines from the renderer to the join journal. A file that has grown
 * past JOIN_JOURNAL_CONFIG.MAX_BYTES is first moved to <name>.old, replacing
 * the previous one, so the journal never takes more than twice that.
 * @param {string} filePath - Journal file
 * @param {string[]} lines - One JSON object each
 * @returns {Promise<boolean>} - False when the batch was refused or not written
 */
export function appendJoinJournal(filePath, lines) {
  if (!isValidBatch(lines)) return Promise.resolve(false);

  // JSON never holds a raw line break, but a line must stay one line
  const text = `${lines.map((line) => line.replace(/[\r\n]+/g, " ")).join("\n")}\n`;
  const result = writing.then(() => write(filePath, text));
  writing = result;
  return result;
}

/**
 * @param {*} lines - What the renderer sent
 * @returns {boolean}
 */
function isValidBatch(lines) {
  return (
    Array.isArray(lines) &&
    lines.length > 0 &&
    lines.length <= JOIN_JOURNAL_CONFIG.MAX_LINES_PER_APPEND &&
    lines.every(
      (line) =>
        typeof line === "string" &&
        line.length <= JOIN_JOURNAL_CONFIG.MAX_LINE_LENGTH
    )
  );
}

/**
 * @param {string} filePath - Journal file
 * @param {string} text - Lines to add
 * @returns {Promise<boolean>} - Never rejects
 */
async function write(filePath, text) {
  try {
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && stat.size >= JOIN_JOURNAL_CONFIG.MAX_BYTES) {
      await fs.rename(filePath, `${filePath}.old`);
    }
    await fs.appendFile(filePath, text, "utf-8");
    return true;
  } catch {
    return false;
  }
}
