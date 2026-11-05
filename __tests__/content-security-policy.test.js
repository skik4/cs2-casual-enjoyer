/**
 * Jest tests for the page's Content Security Policy. Images may come from the
 * app itself, data: URLs and Steam's avatar hosts, never from just any https
 * host. The UI stand serves its avatars as data: URLs, so a look at the stand
 * cannot tell a policy that lets too much or too little through: these read
 * the policy itself.
 */

import fs from "fs";
import path from "path";

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf-8");

/**
 * The page's policy, directive by directive
 * @returns {Map<string, string[]>} - Directive name -> its sources
 */
function readPolicy() {
  const content = read("index.html").match(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i
  )?.[1];
  return new Map(
    (content || "")
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name.toLowerCase(), sources])
  );
}

const policy = readPolicy();
const imgSrc = policy.get("img-src") || [];

/**
 * Whether a source list lets a remote image load, by CSP's rules for the two
 * kinds of source the list holds besides 'self': a scheme such as data:, and
 * a scheme with a host, where a leading "*." stands for any subdomain,
 * however deep
 * @param {string[]} sources - A directive's sources
 * @param {string} url - Absolute URL of the image
 * @returns {boolean}
 */
function allows(sources, url) {
  const target = new URL(url);
  return sources.some((source) => {
    if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) {
      return target.protocol === source.toLowerCase();
    }
    const parts = source.match(/^([a-z][a-z0-9+.-]*):\/\/(\*\.)?([^/:]+)$/i);
    if (!parts) return false;
    const [, scheme, wildcard, host] = parts;
    if (target.protocol !== `${scheme.toLowerCase()}:`) return false;
    return wildcard
      ? target.hostname.endsWith(`.${host.toLowerCase()}`)
      : target.hostname === host.toLowerCase();
  });
}

/** The files under a folder with one of the extensions, relative to ROOT */
function filesUnder(dir, extensions) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(file, extensions);
    return extensions.includes(path.extname(entry.name)) ? [file] : [];
  });
}

const HASH = "c5d56249ee5d28a07db4ac9f7f60af961fab5426";

test("images load from the app, data: URLs and Steam's avatar hosts only", () => {
  expect(imgSrc).toEqual([
    "'self'",
    "data:",
    "https://*.steamstatic.com",
    "https://steamcdn-a.akamaihd.net",
  ]);
});

test.each([
  `https://avatars.steamstatic.com/${HASH}_full.jpg`,
  `https://avatars.akamai.steamstatic.com/${HASH}_medium.jpg`,
  `https://avatars.fastly.steamstatic.com/${HASH}.jpg`,
  `https://avatars.cloudflare.steamstatic.com/${HASH}.jpg`,
  `https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/${HASH}_full.jpg`,
  // A fake friend's placeholder until Steam answers, and the UI stand's avatars
  "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E",
])("a Steam avatar loads: %s", (url) => {
  expect(allows(imgSrc, url)).toBe(true);
});

test.each([
  "https://example.com/avatar.jpg",
  "https://steamstatic.com.example.com/avatar.jpg",
  "https://notsteamstatic.com/avatar.jpg",
  "https://other-a.akamaihd.net/avatar.jpg",
])("any other host stays out: %s", (url) => {
  expect(allows(imgSrc, url)).toBe(false);
});

test("every remote image the page's own code names may load", () => {
  // The main process is not under the page's policy
  const files = [
    ...filesUnder("src", [".js"]).filter((file) => !file.startsWith("src/main/")),
    ...filesUnder("css", [".css"]),
    "index.html",
  ];
  const urls = files.flatMap((file) =>
    [...read(file).matchAll(/https?:\/\/[^\s"'`)<>]+\.(?:jpe?g|png|gif|webp|svg|ico)\b/gi)].map(
      ([url]) => url
    )
  );

  // The tutorial's made-up friend wears a real Steam avatar
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) expect([url, allows(imgSrc, url)]).toEqual([url, true]);
});

test("the policy names no navigate-to, which Chromium never shipped", () => {
  expect(policy.size).toBeGreaterThan(0);
  expect(policy.has("navigate-to")).toBe(false);
});
