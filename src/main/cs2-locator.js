import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";

const CS2_APP_ID = "730";
const DEFAULT_INSTALL_DIR = "Counter-Strike Global Offensive";
const FALLBACK_STEAM_PATHS = [
  "C:\\Program Files (x86)\\Steam",
  "C:\\Program Files\\Steam",
];
const REGISTRY_STEAM_PATHS = [
  ["HKCU\\Software\\Valve\\Steam", "SteamPath"],
  ["HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath"],
  ["HKLM\\SOFTWARE\\Valve\\Steam", "InstallPath"],
];

const ESCAPES = { n: "\n", t: "\t", "\\": "\\", '"': '"' };

/**
 * Split KeyValues text into quoted strings, bare words and braces
 * @param {string} text - VDF/ACF text
 * @returns {Array<{type: "open"|"close"|"string", value?: string}>}
 */
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (ch === "{") {
      tokens.push({ type: "open" });
      i++;
    } else if (ch === "}") {
      tokens.push({ type: "close" });
      i++;
    } else if (ch === '"') {
      let value = "";
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < text.length) {
          value += ESCAPES[text[i + 1]] ?? text[i + 1];
          i += 2;
        } else {
          value += text[i++];
        }
      }
      i++; // closing quote
      tokens.push({ type: "string", value });
    } else {
      let value = "";
      while (i < text.length && !/[\s{}"]/.test(text[i])) value += text[i++];
      tokens.push({ type: "string", value });
    }
  }
  return tokens;
}

/**
 * Parse Valve KeyValues text (libraryfolders.vdf, appmanifest_*.acf) into
 * nested plain objects. Covers what Steam's own files use: quoted keys and
 * values, nested blocks, // comments and backslash escapes.
 * @param {string} text - VDF/ACF text
 * @returns {Object} - Parsed key-value tree
 */
export function parseVdf(text) {
  const tokens = tokenize(String(text ?? ""));
  let pos = 0;

  const parseBlock = () => {
    const block = {};
    while (pos < tokens.length) {
      const token = tokens[pos++];
      if (token.type === "close") break;
      if (token.type !== "string") continue;

      const next = tokens[pos];
      if (next?.type === "open") {
        pos++;
        block[token.value] = parseBlock();
      } else if (next?.type === "string") {
        pos++;
        block[token.value] = next.value;
      }
    }
    return block;
  };

  return parseBlock();
}

/**
 * Read a key the way Steam does - case-insensitively
 * @param {Object} block - Parsed KeyValues block
 * @param {string} key - Key to read
 * @returns {*} - Value or undefined
 */
function getKey(block, key) {
  if (!block || typeof block !== "object") return undefined;
  const wanted = key.toLowerCase();
  const found = Object.keys(block).find((k) => k.toLowerCase() === wanted);
  return found === undefined ? undefined : block[found];
}

/**
 * Read a text file, or null when it cannot be read
 * @param {string} filePath - File to read
 * @returns {Promise<string|null>}
 */
async function readText(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Whether a directory exists
 * @param {string} dirPath - Directory to check
 * @returns {Promise<boolean>}
 */
async function isDirectory(dirPath) {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * List the Steam library folders, the ones that report CS2 first
 * @param {string} steamPath - Steam installation folder
 * @returns {Promise<string[]>} - Library folders
 */
async function listLibraries(steamPath) {
  const withCS2 = [];
  const others = [steamPath];
  const text = await readText(
    path.join(steamPath, "steamapps", "libraryfolders.vdf")
  );
  const root = text ? getKey(parseVdf(text), "libraryfolders") : null;

  for (const [key, entry] of Object.entries(root || {})) {
    if (!/^\d+$/.test(key)) continue;
    // Older Steam clients stored the bare path instead of a block
    if (typeof entry === "string") {
      others.push(entry);
      continue;
    }
    const libraryPath = getKey(entry, "path");
    if (typeof libraryPath !== "string" || !libraryPath) continue;
    const apps = getKey(entry, "apps");
    if (apps && getKey(apps, CS2_APP_ID) !== undefined) {
      withCS2.push(libraryPath);
    } else {
      others.push(libraryPath);
    }
  }

  const seen = new Set();
  return [...withCS2, ...others].filter((libraryPath) => {
    const id = path.resolve(libraryPath).toLowerCase();
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Find the CS2 installation inside a Steam installation
 * @param {string} steamPath - Steam installation folder
 * @returns {Promise<string|null>} - CS2 folder (the one holding game/csgo), or null
 */
export async function findCs2Dir(steamPath) {
  if (!steamPath) return null;

  for (const library of await listLibraries(steamPath)) {
    const manifest = await readText(
      path.join(library, "steamapps", `appmanifest_${CS2_APP_ID}.acf`)
    );
    if (!manifest) continue;

    const installDir =
      getKey(getKey(parseVdf(manifest), "AppState"), "installdir") ||
      DEFAULT_INSTALL_DIR;
    const cs2Dir = path.join(library, "steamapps", "common", installDir);
    if (await isDirectory(path.join(cs2Dir, "game", "csgo"))) return cs2Dir;
  }

  return null;
}

/**
 * Read one registry value through reg.exe
 * @param {string} key - Registry key
 * @param {string} name - Value name
 * @returns {Promise<string|null>} - Value, or null when it is not there
 */
function readRegistryValue(key, name) {
  return new Promise((resolve) => {
    execFile(
      "reg",
      ["query", key, "/v", name],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        if (error) return resolve(null);
        const match = String(stdout).match(
          new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`)
        );
        resolve(match ? match[1].trim() : null);
      }
    );
  });
}

/**
 * Find the Steam installation folder
 * @returns {Promise<string|null>} - Steam folder, or null
 */
export async function findSteamPath() {
  if (process.platform !== "win32") return null;

  for (const [key, name] of REGISTRY_STEAM_PATHS) {
    const value = await readRegistryValue(key, name);
    if (value && (await isDirectory(value))) return path.normalize(value);
  }
  for (const candidate of FALLBACK_STEAM_PATHS) {
    if (await isDirectory(candidate)) return candidate;
  }
  return null;
}

/**
 * Locate the CS2 installation of this machine
 * @returns {Promise<string|null>} - CS2 folder, or null when Steam or CS2 is not found
 */
export async function locateCs2() {
  return findCs2Dir(await findSteamPath());
}
