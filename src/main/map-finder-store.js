import { promises as fs } from "fs";

const STORE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Read the map finder's store (player pool, friends of friends)
 * @param {string} filePath - Store file
 * @returns {Promise<Object|null>}
 */
export async function readMapFinderStore(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write the map finder's store
 * @param {string} filePath - Store file
 * @param {Object} data - Store content
 * @returns {Promise<boolean>} - False when it was refused or could not be written
 */
export async function writeMapFinderStore(filePath, data) {
  try {
    const text = JSON.stringify(data);
    if (!data || typeof data !== "object" || text.length > STORE_MAX_BYTES) {
      return false;
    }
    await fs.writeFile(filePath, text, "utf-8");
    return true;
  } catch {
    return false;
  }
}
