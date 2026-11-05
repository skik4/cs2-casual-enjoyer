/**
 * Jest tests for the fonts the app ships: every face css/fonts.css declares
 * points at a TrueType file that is there, the stylesheet is loaded first,
 * and the weights the styles use all have a face of their own or the Bold
 */

import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf-8");

const faces = [
  ...read("css/fonts.css").matchAll(/@font-face\s*\{([^}]*)\}/g),
].map(([, body]) => ({
  family: body.match(/font-family:\s*"([^"]+)"/)?.[1],
  url: body.match(/url\("([^"]+)"\)/)?.[1],
  weight: Number(body.match(/font-weight:\s*(\d+)/)?.[1]),
  style: body.match(/font-style:\s*(\w+)/)?.[1],
}));

test("every face is Motiva Sans in a TrueType file that ships with the app", () => {
  expect(faces.map((face) => `${face.weight} ${face.style}`)).toEqual([
    "400 normal",
    "400 italic",
    "500 normal",
    "700 normal",
  ]);
  for (const face of faces) {
    expect(face.family).toBe("Motiva Sans");
    const file = path.resolve(root, "css", face.url);
    expect(file.startsWith(path.join(root, "assets", "fonts"))).toBe(true);
    // TrueType files start with version 1.0, 00 01 00 00
    expect(fs.readFileSync(file).readUInt32BE(0)).toBe(0x00010000);
  }
});

test("the font files are all used, and packed into the build", () => {
  const used = new Set(faces.map((face) => path.basename(face.url)));
  expect(fs.readdirSync(path.join(root, "assets", "fonts")).sort()).toEqual(
    [...used].sort()
  );
  expect(JSON.parse(read("package.json")).build.files).toContain("assets/**/*");
});

test("the stylesheet loads the fonts before anything uses them", () => {
  const imports = [
    ...read("css/styles.css").matchAll(/@import url\("\.\/([^"]+)"\)/g),
  ].map(([, file]) => file);
  expect(imports[0]).toBe("fonts.css");
  expect(read("css/variables.css")).toMatch(/--font-family:\s*"Motiva Sans"/);
});

test("the weights the styles ask for are 400, 500, 600 or 700, which the faces cover", () => {
  const css = fs
    .readdirSync(path.join(root, "css"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => read(`css/${file}`))
    .join("\n");
  const tokens = Object.fromEntries(
    [...css.matchAll(/--(font-weight-[a-z]+):\s*(\d+)/g)].map(
      ([, name, value]) => [name, Number(value)]
    )
  );
  const weights = new Set(
    [...css.matchAll(/font-weight:\s*([^;]+);/g)].map(([, value]) => {
      const token = value.match(/var\(--(font-weight-[a-z]+)\)/);
      return token
        ? tokens[token[1]]
        : value.trim() === "bold"
          ? 700
          : Number(value);
    })
  );
  // 600 has no face of its own: CSS takes the next heavier one, the Bold
  for (const weight of weights) expect([400, 500, 600, 700]).toContain(weight);
});
