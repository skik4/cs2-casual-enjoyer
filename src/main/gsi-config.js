import { promises as fs } from "fs";
import path from "path";

// Shared constants
import { GSI_CONFIG } from "../shared/constants.js";

/**
 * Build the gamestate_integration cfg that tells CS2 where to post its state
 * @param {{port: number, token: string}} options - Endpoint port and auth token
 * @returns {string} - cfg file content
 */
export function buildGsiConfig({ port, token }) {
  return [
    `"${GSI_CONFIG.SERVICE_NAME}"`,
    "{",
    `\t"uri"\t\t"http://${GSI_CONFIG.HOST}:${port}"`,
    '\t"timeout"\t"5.0"',
    '\t"buffer"\t"0.1"',
    '\t"throttle"\t"0.5"',
    `\t"heartbeat"\t"${GSI_CONFIG.HEARTBEAT_S.toFixed(1)}"`,
    '\t"auth"',
    "\t{",
    `\t\t"token"\t"${token}"`,
    "\t}",
    '\t"data"',
    "\t{",
    '\t\t"provider"\t"1"',
    '\t\t"map"\t\t"1"',
    '\t\t"player_id"\t"1"',
    '\t\t"player_state"\t"1"',
    "\t}",
    "}",
    "",
  ].join("\r\n");
}

/**
 * Put the cfg into CS2's cfg folder, leaving a file that already matches alone.
 * CS2 reads these files only at startup, so `changed` tells whether a running
 * game still uses an older copy.
 * @param {string} cs2Dir - CS2 installation folder (the one holding game/csgo)
 * @param {{port: number, token: string}} options - Endpoint port and auth token
 * @returns {Promise<{cfgPath: string, changed: boolean}>}
 */
export async function installGsiConfig(cs2Dir, options) {
  const cfgDir = path.join(cs2Dir, "game", "csgo", "cfg");
  const cfgPath = path.join(cfgDir, GSI_CONFIG.CFG_FILE_NAME);
  const content = buildGsiConfig(options);

  let current = null;
  try {
    current = await fs.readFile(cfgPath, "utf-8");
  } catch {}
  if (current === content) return { cfgPath, changed: false };

  // Never create folders inside the game: a missing cfg folder means this is
  // not a usable CS2 installation, and writing fails loudly instead
  await fs.writeFile(cfgPath, content, "utf-8");
  return { cfgPath, changed: true };
}
