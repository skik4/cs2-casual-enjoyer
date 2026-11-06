/**
 * Jest tests that the app's texts are drawn in its own fonts: every
 * character it shows is in Motiva Sans, the files it ships, except
 * Cyrillic, which Motiva Sans lacks and Arial draws, as in Steam. A
 * character in neither went to whatever Windows font has it: the ✓ came out
 * in Segoe UI Symbol, the map triangles in Cambria Math, and the no-break
 * hyphen of "e‑mail" in Times New Roman.
 */

import fs from "fs";
import path from "path";
import ru from "../src/i18n/locales/ru.js";
import en from "../src/i18n/locales/en.js";

const ROOT = path.join(__dirname, "..");
const FONTS = path.join(ROOT, "assets", "fonts");

/** Cyrillic, drawn in Arial */
const CYRILLIC = /\p{Script=Cyrillic}/u;

/**
 * The characters a TrueType file maps to a glyph (its cmap: Windows or
 * Unicode tables, formats 4 and 12)
 * @param {string} file
 * @returns {Set<number>}
 */
function codePoints(file) {
  const font = fs.readFileSync(file);
  let cmap = null;
  for (let i = 0; i < font.readUInt16BE(4); i++) {
    const record = 12 + i * 16;
    if (font.toString("latin1", record, record + 4) === "cmap") {
      cmap = font.readUInt32BE(record + 8);
    }
  }
  const points = new Set();
  for (let i = 0; i < font.readUInt16BE(cmap + 2); i++) {
    const record = cmap + 4 + i * 8;
    const platform = font.readUInt16BE(record);
    if (platform !== 0 && platform !== 3) continue;
    const table = cmap + font.readUInt32BE(record + 4);
    const format = font.readUInt16BE(table);
    if (format === 4) {
      const segments = font.readUInt16BE(table + 6) / 2;
      const ends = table + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const offsets = deltas + segments * 2;
      for (let s = 0; s < segments; s++) {
        const start = font.readUInt16BE(starts + s * 2);
        const end = font.readUInt16BE(ends + s * 2);
        const delta = font.readInt16BE(deltas + s * 2);
        const offset = font.readUInt16BE(offsets + s * 2);
        for (let code = start; code <= end && code !== 0xffff; code++) {
          let glyph = code;
          if (offset) {
            glyph = font.readUInt16BE(
              offsets + s * 2 + offset + (code - start) * 2
            );
            if (!glyph) continue;
          }
          if ((glyph + delta) & 0xffff) points.add(code);
        }
      }
    } else if (format === 12) {
      for (let g = 0; g < font.readUInt32BE(table + 12); g++) {
        const group = table + 16 + g * 12;
        const start = font.readUInt32BE(group);
        const end = font.readUInt32BE(group + 4);
        const first = font.readUInt32BE(group + 8);
        for (let code = start; code <= end; code++) {
          if (first + code - start) points.add(code);
        }
      }
    }
  }
  return points;
}

/** What every face of Motiva Sans the app ships has */
const MOTIVA = (() => {
  const faces = fs
    .readdirSync(FONTS)
    .filter((name) => name.endsWith(".ttf"))
    .map((name) => codePoints(path.join(FONTS, name)));
  return new Set(
    [...faces[0]].filter((code) => faces.every((f) => f.has(code)))
  );
})();

/** Every string of a locale, with its key */
function localeStrings(node, key = "") {
  if (typeof node === "string") return [[key, node]];
  return Object.entries(node).flatMap(([name, value]) =>
    localeStrings(value, key ? `${key}.${name}` : name)
  );
}

/** The files under a folder with one of the extensions */
function filesUnder(dir, extensions) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, extensions);
    return extensions.includes(path.extname(entry.name)) ? [full] : [];
  });
}

/**
 * The characters of the [where, text] pairs that neither Motiva Sans nor,
 * for Cyrillic, Arial draws, as "where: U+2713 ✓"
 */
function outsideTheFonts(pairs) {
  const found = new Set();
  for (const [where, text] of pairs) {
    for (const char of text) {
      const code = char.codePointAt(0);
      if (code < 0x20 || CYRILLIC.test(char) || MOTIVA.has(code)) continue;
      const hex = code.toString(16).toUpperCase().padStart(4, "0");
      found.add(`${where}: U+${hex} ${char}`);
    }
  }
  return [...found];
}

test("the fonts are read: Motiva Sans has Latin, digits and signs, no Cyrillic", () => {
  for (const char of "Casual Enjoyer v0.9.5 «»—…·“”") {
    expect(MOTIVA.has(char.codePointAt(0))).toBe(true);
  }
  expect(MOTIVA.has("Ж".codePointAt(0))).toBe(false);
  expect(MOTIVA.has("✓".codePointAt(0))).toBe(false);
});

test.each([
  ["ru", ru],
  ["en", en],
])("every character of the %s locale is in the app's fonts", (_, locale) => {
  expect(outsideTheFonts(localeStrings(locale))).toEqual([]);
});

test("no other file the app ships shows a character outside its fonts", () => {
  const files = [
    path.join(ROOT, "index.html"),
    ...filesUnder(path.join(ROOT, "src"), [".js", ".html"]).filter(
      (file) => !file.includes(`${path.sep}locales${path.sep}`)
    ),
    ...filesUnder(path.join(ROOT, "css"), [".css"]),
  ];
  const pairs = files.map((file) => [
    path.relative(ROOT, file),
    fs
      .readFileSync(file, "utf-8")
      // Comments, which are never shown
      .replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
      // An icon's alt words show only if the icon itself fails to load
      .replace(/alt="[^"]*"/g, ""),
  ]);

  expect(outsideTheFonts(pairs)).toEqual([]);
});
