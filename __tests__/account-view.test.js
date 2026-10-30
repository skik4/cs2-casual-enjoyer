/**
 * @jest-environment jsdom
 *
 * Jest tests for the account bar and the account panel
 */

jest.mock("../src/steam/steam-api.js", () => ({
  __esModule: true,
  default: { getPlayerSummaries: jest.fn() },
}));

import AccountView from "../src/ui/account-view.js";
import SteamAPI from "../src/steam/steam-api.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

const STEAM_ID = "76561198000000001";
const AVATAR = "https://avatars.steamstatic.com/abc_medium.jpg";
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** What input validation reports for a working token */
const facts = (overrides = {}) => ({
  steamId: STEAM_ID,
  validSteamId: true,
  auth: "a.b.c",
  validAuth: true,
  isKey: false,
  tokenInfo: { steamid: STEAM_ID, expires: nowSeconds() + 20 * 3600 },
  tokenExpired: false,
  hasFriends: true,
  ...overrides,
});

const element = (id) => document.getElementById(id);
const visible = (id) => !element(id).classList.contains("hidden");
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  setLanguage("en");
  AccountView.reset();
  SteamAPI.getPlayerSummaries.mockReset();
  SteamAPI.getPlayerSummaries.mockResolvedValue({
    [STEAM_ID]: { steamid: STEAM_ID, personaname: "skik4", avatarmedium: AVATAR },
  });
  document.body.innerHTML = `
    <div id="account-bar" class="hidden">
      <span id="account-avatar"></span>
      <span id="account-name"></span>
      <span id="account-status"></span>
    </div>
    <div id="account-panel">
      <button id="account-close-btn" class="hidden"></button>
      <span id="steamid-step-num">3</span>
      <span id="steamid-step-title"></span>
      <div id="steamid-input-row" class="hidden"></div>
    </div>`;
});

afterEach(() => AccountView.reset());

test("a working account shows the bar: name, avatar and the token's expiry", async () => {
  AccountView.update(facts());
  await flush();

  expect(visible("account-bar")).toBe(true);
  expect(visible("account-panel")).toBe(false);
  expect(element("account-name").textContent).toBe("skik4");
  expect(element("account-avatar").querySelector("img").getAttribute("src")).toBe(
    AVATAR
  );
  expect(element("account-status").textContent).toMatch(
    /^Token valid until \d\d\.\d\d, \d\d:\d\d$/
  );
  expect(element("account-status").dataset.state).toBe("ok");
});

test("the avatar shows the first letter until Steam names a picture, and if it fails to load", async () => {
  SteamAPI.getPlayerSummaries.mockResolvedValue({
    [STEAM_ID]: { steamid: STEAM_ID, personaname: "skik4" },
  });
  AccountView.update(facts());
  expect(element("account-avatar").textContent).toBe(STEAM_ID[0]);
  await flush();
  expect(element("account-avatar").textContent).toBe("S");
  expect(element("account-avatar").querySelector("img")).toBeNull();

  AccountView.reset();
  SteamAPI.getPlayerSummaries.mockResolvedValue({
    [STEAM_ID]: { steamid: STEAM_ID, personaname: "skik4", avatarmedium: AVATAR },
  });
  AccountView.update(facts());
  await flush();
  element("account-avatar").querySelector("img").dispatchEvent(new Event("error"));
  expect(element("account-avatar").textContent).toBe("S");
});

test.each([
  ["no valid token or key", { validAuth: false }],
  ["no SteamID", { validSteamId: false }],
  ["an expired token", { tokenExpired: true }],
  ["no friends loaded yet", { hasFriends: false }],
])("%s keeps the panel open with no way to close it", (_name, overrides) => {
  AccountView.update(facts(overrides));

  expect(visible("account-panel")).toBe(true);
  expect(visible("account-bar")).toBe(false);
  expect(visible("account-close-btn")).toBe(false);
});

test("editing a working account opens the panel; closing brings the bar back", () => {
  AccountView.update(facts());

  AccountView.open();
  expect(visible("account-panel")).toBe(true);
  expect(visible("account-close-btn")).toBe(true);

  AccountView.close();
  expect(visible("account-panel")).toBe(false);
  expect(visible("account-bar")).toBe(true);
});

test("the token is called out in its last hour and once it has expired", () => {
  const now = Date.now();
  const expiringIn = (seconds) =>
    facts({ tokenInfo: { steamid: STEAM_ID, expires: Math.floor(now / 1000) + seconds } });

  expect(AccountView.describeAuth(expiringIn(30 * 60), now)).toEqual({
    state: "warn",
    text: "Token expires in 30 min",
  });
  expect(AccountView.describeAuth(expiringIn(-60), now)).toEqual({
    state: "expired",
    text: "Token expired, get a new one",
  });
  expect(
    AccountView.describeAuth(facts({ tokenInfo: null, isKey: true }), now)
  ).toEqual({ state: "ok", text: "Steam Web API key" });
});

test("the SteamID step: read from a token, typed in for an API key", () => {
  AccountView.update(facts({ hasFriends: false }));
  expect(element("steamid-step-title").textContent).toBe(
    `SteamID taken from the token: ${STEAM_ID}`
  );
  expect(visible("steamid-input-row")).toBe(false);
  expect(element("steamid-step-num").textContent).toBe("✓");

  AccountView.update(
    facts({ tokenInfo: null, isKey: true, validSteamId: false, hasFriends: false })
  );
  expect(element("steamid-step-title").textContent).toBe(
    "With an API key, enter your SteamID64 too"
  );
  expect(visible("steamid-input-row")).toBe(true);
  expect(element("steamid-step-num").textContent).toBe("3");
});

test("the Steam profile is asked for once per account, and not without one", async () => {
  AccountView.update(facts());
  AccountView.update(facts());
  await flush();
  AccountView.update(facts());

  expect(SteamAPI.getPlayerSummaries).toHaveBeenCalledTimes(1);
  expect(SteamAPI.getPlayerSummaries).toHaveBeenCalledWith([STEAM_ID], "a.b.c");

  AccountView.update(facts({ steamId: "76561198000000002", validAuth: false }));
  expect(SteamAPI.getPlayerSummaries).toHaveBeenCalledTimes(1);
});
