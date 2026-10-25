/**
 * Jest tests for Validators - credentials, Steam IDs and profile links
 */

import Validators from "../src/utils/validators.js";

const STEAM_ID = "76561198000000001";
const API_KEY = "ABCDEF0123456789ABCDEF0123456789";

/**
 * A web API token whose payload carries the given claims, base64url-encoded
 * like Steam's own
 */
const tokenWith = (claims) =>
  [
    Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "c2lnbmF0dXJl",
  ].join(".");

describe("format checks", () => {
  test("validateSteamId accepts 17 digits only", () => {
    expect(Validators.validateSteamId(STEAM_ID)).toBe(true);
    expect(Validators.validateSteamId("7656119800000000")).toBe(false);
    expect(Validators.validateSteamId(`${STEAM_ID}0`)).toBe(false);
    expect(Validators.validateSteamId(Number(STEAM_ID))).toBe(false);
  });

  test("isApiKey and isWebApiToken tell keys and tokens apart", () => {
    const token = tokenWith({ sub: STEAM_ID, exp: 2000000000 });
    expect(Validators.isApiKey(API_KEY)).toBe(true);
    expect(Validators.isApiKey(token)).toBe(false);
    expect(Validators.isWebApiToken(token)).toBe(true);
    expect(Validators.isWebApiToken(API_KEY)).toBe(false);
    expect(Validators.isWebApiToken(null)).toBe(false);
  });
});

describe("extracting the credential", () => {
  const token = tokenWith({ sub: STEAM_ID, exp: 2000000000 });
  const pastedJson = JSON.stringify({ success: 1, data: { webapi_token: token } });

  test("takes the token out of the JSON Steam shows", () => {
    expect(Validators.extractTokenIfAny(pastedJson)).toBe(token);
    expect(Validators.extractApiKeyOrToken(pastedJson)).toBe(token);
  });

  test("passes a bare token or key through", () => {
    expect(Validators.extractTokenIfAny(token)).toBe(token);
    expect(Validators.extractTokenIfAny(API_KEY)).toBeNull();
    expect(Validators.extractApiKeyOrToken(API_KEY)).toBe(API_KEY);
  });

  test("validateApiAuth accepts a key, a token or the JSON around a token", () => {
    expect(Validators.validateApiAuth(API_KEY)).toBe(true);
    expect(Validators.validateApiAuth(token)).toBe(true);
    expect(Validators.validateApiAuth(pastedJson)).toBe(true);
    expect(Validators.validateApiAuth("not a credential")).toBe(false);
    expect(Validators.validateApiAuth(undefined)).toBe(false);
  });
});

describe("parseWebApiToken", () => {
  test("reads the SteamID and expiry", () => {
    const info = Validators.parseWebApiToken(
      tokenWith({ sub: STEAM_ID, exp: 2000000000 })
    );

    expect(info).toEqual({
      steamid: STEAM_ID,
      expires: 2000000000,
      expiresDate: new Date(2000000000 * 1000),
    });
  });

  test("decodes base64url payloads that plain base64 cannot", () => {
    // Find claims whose encoding uses the url-safe characters - and \_
    let claims;
    let encoded = "";
    for (let i = 0; !/[-_]/.test(encoded); i++) {
      claims = { sub: STEAM_ID, exp: 2000000000, jti: "ÿ".repeat(i % 7) + i };
      encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
    }

    const info = Validators.parseWebApiToken(tokenWith(claims));

    expect(info).toMatchObject({ steamid: STEAM_ID, expires: 2000000000 });
  });

  test("returns null for anything that is not a token", () => {
    expect(Validators.parseWebApiToken(API_KEY)).toBeNull();
    expect(Validators.parseWebApiToken("a.b.c")).toBeNull();
  });
});

describe("validateSteamUrl", () => {
  test("reads a SteamID64 profile link", () => {
    expect(
      Validators.validateSteamUrl(`https://steamcommunity.com/profiles/${STEAM_ID}/`)
    ).toEqual({ valid: true, type: "steamid", value: STEAM_ID });
  });

  test("reads a vanity profile link", () => {
    expect(
      Validators.validateSteamUrl("https://steamcommunity.com/id/skik4/")
    ).toEqual({ valid: true, type: "vanity", value: "skik4" });
  });

  test("rejects other links", () => {
    expect(Validators.validateSteamUrl("https://example.com/id/x").valid).toBe(false);
    expect(Validators.validateSteamUrl("https://steamcommunity.com/market").valid).toBe(
      false
    );
    expect(Validators.validateSteamUrl(42).valid).toBe(false);
  });
});

describe("validateRequiredFields", () => {
  test("passes with a SteamID and a credential", () => {
    expect(
      Validators.validateRequiredFields({ steamId: STEAM_ID, auth: API_KEY })
    ).toEqual({ valid: true, errors: [] });
  });

  test("lists every missing field", () => {
    const result = Validators.validateRequiredFields({ steamId: "", auth: "x" });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});
