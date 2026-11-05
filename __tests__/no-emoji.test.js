/**
 * Jest tests that the app says everything in words: no emoji in its locale
 * strings, its tutorial, its page or any other file it ships
 */

import fs from "fs";
import path from "path";
import ru from "../src/i18n/locales/ru.js";
import en from "../src/i18n/locales/en.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";
import { TUTORIAL_TEMPLATES } from "../src/ui/tutorial/tutorial-templates.js";

// A character Unicode counts as emoji, ASCII aside (Unicode counts the
// digits, # and * for their keycaps), and the marks that make text an emoji
const EMOJI = /(?=\p{Emoji})\P{ASCII}|[️⃣]/u;

const ROOT = path.join(__dirname, "..");

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

/** The [where, text] pairs whose text carries an emoji */
const withEmoji = (pairs) => pairs.filter(([, text]) => EMOJI.test(text));

afterEach(() => setLanguage("en"));

test.each([
  ["ru", ru],
  ["en", en],
])("no %s locale string carries an emoji", (_, locale) => {
  expect(withEmoji(localeStrings(locale))).toEqual([]);
});

test.each(["ru", "en"])(
  "the %s tutorial names and explains every step in words only",
  (language) => {
    setLanguage(language);
    const steps = TUTORIAL_TEMPLATES.getSteps();

    steps.forEach((step) => {
      expect(step).not.toHaveProperty("icon");
      expect(`${step.title} ${step.content}`).not.toMatch(EMOJI);
    });

    const last = steps.length - 1;
    const modal = TUTORIAL_TEMPLATES.MODAL_CONTENT(
      steps[last].title,
      last + 1,
      steps.length,
      steps[last].content,
      false,
      true
    );
    expect(modal).not.toMatch(/<img/);
    expect(modal).not.toMatch(EMOJI);
  }
);

test("no file the app ships carries an emoji", () => {
  const files = [
    path.join(ROOT, "index.html"),
    ...filesUnder(path.join(ROOT, "src"), [".js", ".cjs", ".html"]),
    ...filesUnder(path.join(ROOT, "css"), [".css"]),
  ];
  const lines = files.flatMap((file) =>
    fs
      .readFileSync(file, "utf-8")
      .split(/\r?\n/)
      .map((line, i) => [`${path.relative(ROOT, file)}:${i + 1}`, line])
  );

  expect(withEmoji(lines)).toEqual([]);
});
