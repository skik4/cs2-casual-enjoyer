/**
 * Tri-state GetPlayerLinkDetails batching and the join snapshot, exercised
 * through the real SteamAPIClient with only fetch mocked
 */

// Mock modules before importing
jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import SteamAPIClient from "../src/steam/steam-api-client.js";
import SteamAPIResponseProcessor from "../src/steam/steam-api-response-processor.js";
import SteamAPIUtils from "../src/steam/steam-api-utils.js";
import logger from "../src/utils/logger.js";

const USER_ID = "76561198000000001";
const FRIEND_ID = "76561198000000002";
const AUTH = "ABCDEF0123456789ABCDEF0123456789";

const VALID_CONNECT = "+gcconnectG1A2B3C4D";
const CASUAL_RICH_PRESENCE = `"game:mode" "casual" "game:state" "game" "connect" "${VALID_CONNECT}" "game_server_steam_id" "9001"`;

/**
 * Build one GetPlayerLinkDetails account
 * @param {string} steamid
 * @param {Object} [overrides]
 * @returns {Object}
 */
function account(steamid, overrides = {}) {
  const {
    persona_name = `Player ${steamid.slice(-1)}`,
    game_id = "730",
    rich_presence_kv = CASUAL_RICH_PRESENCE,
  } = overrides;
  return {
    public_data: { steamid, persona_name },
    private_data: { game_id, rich_presence_kv },
  };
}

/**
 * Fake fetch Response carrying the given accounts
 * @param {Object[]} accounts
 * @returns {Object}
 */
function okResponse(accounts) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ response: { accounts } }),
  };
}

/**
 * Fake failed fetch Response
 * @param {number} status
 * @param {string} statusText
 * @returns {Object}
 */
function errorResponse(status, statusText) {
  return { ok: false, status, statusText, json: async () => ({}) };
}

/**
 * Steam ids a mocked fetch call asked for
 * @param {Array} call - Entry of fetch.mock.calls
 * @returns {string[]}
 */
function requestedIds(call) {
  return [...new URL(call[0]).searchParams.entries()]
    .filter(([key]) => key.startsWith("steamids["))
    .map(([, value]) => value);
}

describe("SteamAPIClient - join snapshot and tri-state batching", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    SteamAPIClient._cache.clear();
    SteamAPIResponseProcessor._reportedInvalidConnects.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe("isPlayerInCS2", () => {
    test("returns null when the request fails at the network level", async () => {
      global.fetch.mockRejectedValue(new Error("ECONNRESET"));

      await expect(SteamAPIClient.isPlayerInCS2(USER_ID, AUTH)).resolves.toBeNull();
    });

    test("returns null when Steam answers HTTP 429", async () => {
      global.fetch.mockResolvedValue(errorResponse(429, "Too Many Requests"));

      await expect(SteamAPIClient.isPlayerInCS2(USER_ID, AUTH)).resolves.toBeNull();
    });

    test("returns true when the player is in CS2", async () => {
      global.fetch.mockResolvedValue(okResponse([account(USER_ID)]));

      await expect(SteamAPIClient.isPlayerInCS2(USER_ID, AUTH)).resolves.toBe(true);
    });

    test("does not cache a failed request", async () => {
      global.fetch
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockResolvedValueOnce(okResponse([account(USER_ID)]));

      await expect(SteamAPIClient.isPlayerInCS2(USER_ID, AUTH)).resolves.toBeNull();
      await expect(SteamAPIClient.isPlayerInCS2(USER_ID, AUTH)).resolves.toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test("caches a no-account answer and reports false", async () => {
      global.fetch.mockResolvedValue(okResponse([]));

      await expect(SteamAPIClient.isPlayerInCS2(USER_ID, AUTH)).resolves.toBe(false);
      await expect(SteamAPIClient.isPlayerInCS2(USER_ID, AUTH)).resolves.toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("getJoinSnapshot", () => {
    test("asks for both ids in one request and parses both sides", async () => {
      global.fetch.mockResolvedValue(
        okResponse([
          account(USER_ID, {
            persona_name: "Me",
            rich_presence_kv: '"game:mode" "casual" "game:state" "game" "game_server_steam_id" "8000"',
          }),
          account(FRIEND_ID, { persona_name: "Friend" }),
        ])
      );

      const snapshot = await SteamAPIClient.getJoinSnapshot(USER_ID, FRIEND_ID, AUTH);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(requestedIds(global.fetch.mock.calls[0]).sort()).toEqual(
        [USER_ID, FRIEND_ID].sort()
      );
      expect(snapshot).toEqual({
        user: {
          personaname: "Me",
          inCS2: true,
          inCompetitiveOrPremier: false,
          inSupportedMode: true,
          connect: null,
          serverId: "8000",
          statusKey: expect.any(String),
        },
        friend: {
          personaname: "Friend",
          inCS2: true,
          inCompetitiveOrPremier: false,
          inSupportedMode: true,
          connect: VALID_CONNECT,
          serverId: "9001",
          statusKey: expect.any(String),
        },
      });
    });

    test("reports a side Steam has no account for as not in CS2, not as unknown", async () => {
      global.fetch.mockResolvedValue(okResponse([account(USER_ID)]));

      const { user, friend } = await SteamAPIClient.getJoinSnapshot(USER_ID, FRIEND_ID, AUTH);

      expect(user.inCS2).toBe(true);
      expect(friend).toEqual({
        personaname: "",
        inCS2: false,
        inCompetitiveOrPremier: false,
        inSupportedMode: false,
        connect: null,
        serverId: null,
        statusKey: expect.any(String),
      });
    });

    test.each([
      ["a network error", () => global.fetch.mockRejectedValue(new Error("ECONNRESET"))],
      ["HTTP 429", () => global.fetch.mockResolvedValue(errorResponse(429, "Too Many Requests"))],
    ])("returns null for both sides on %s", async (_label, arrange) => {
      arrange();

      await expect(
        SteamAPIClient.getJoinSnapshot(USER_ID, FRIEND_ID, AUTH)
      ).resolves.toEqual({ user: null, friend: null });
    });
  });

  describe("connect validation", () => {
    test("accepts a bare +gcconnect token", () => {
      expect(SteamAPIUtils.isValidConnect(VALID_CONNECT)).toBe(true);
    });

    test.each([
      ["a space", "+gcconnectG1A2B3C4D +exec autoexec"],
      ["an encoded space", "+gcconnectG1A2B3C4D%20+exec"],
      ["an appended +exec", "+gcconnectG1A2B3C4D+exec"],
      ["a plain +exec", "+exec autoexec.cfg"],
      ["a double quote", '+gcconnect"G1A2B3C4D'],
      ["a single quote", "+gcconnect'G1A2B3C4D'"],
      ["no prefix", "G1A2B3C4D"],
      ["a prefix without +", "gcconnectG1A2B3C4D"],
      ["an empty token", "+gcconnect"],
      ["an empty string", ""],
      ["null", null],
      ["a number", 12345],
    ])("rejects %s", (_label, connect) => {
      expect(SteamAPIUtils.isValidConnect(connect)).toBe(false);
    });

    test("isJoinAvailable requires a valid connect", () => {
      const richPresence = { game_mode: "casual", game_state: "game" };

      expect(
        SteamAPIUtils.isJoinAvailable({ ...richPresence, connect: VALID_CONNECT })
      ).toBe(true);
      expect(
        SteamAPIUtils.isJoinAvailable({
          ...richPresence,
          connect: "+gcconnectG1A2B3C4D +exec autoexec",
        })
      ).toBe(false);
    });

    test("the snapshot drops a malformed connect and warns once per value", async () => {
      const warn = jest.spyOn(logger, "warn");
      global.fetch.mockResolvedValue(
        okResponse([
          account(USER_ID),
          account(FRIEND_ID, {
            rich_presence_kv: '"game:mode" "casual" "game:state" "game" "connect" "+gcconnectG1 +exec autoexec"',
          }),
        ])
      );

      const first = await SteamAPIClient.getJoinSnapshot(USER_ID, FRIEND_ID, AUTH);
      SteamAPIClient._cache.clear();
      const second = await SteamAPIClient.getJoinSnapshot(USER_ID, FRIEND_ID, AUTH);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      for (const { friend } of [first, second]) {
        expect(friend.inSupportedMode).toBe(true);
        expect(friend.connect).toBeNull();
      }
      const connectWarnings = warn.mock.calls.filter(([, message]) =>
        message.includes("malformed connect")
      );
      expect(connectWarnings).toHaveLength(1);
    });
  });

  describe("competitive/premier detection", () => {
    test.each([
      ["competitive", "lobby", false],
      ["premier", "lobby", false],
      ["competitive", null, false],
      ["competitive", "game", true],
      ["premier", "game", true],
      ["casual", "game", false],
    ])("mode %s with state %s -> %s", (mode, state, expected) => {
      const rich_presence_kv =
        `"game:mode" "${mode}"` + (state ? ` "game:state" "${state}"` : "");

      expect(
        SteamAPIUtils.isPlayerInCompetitiveOrPremier({ game_id: "730", rich_presence_kv })
      ).toBe(expected);
    });

    test.each([
      ["in the lobby", "lobby", false],
      ["in a match", "game", true],
    ])("the snapshot reports a competitive user %s (state %s) -> %s", async (_label, state, expected) => {
      global.fetch.mockResolvedValue(
        okResponse([
          account(USER_ID, {
            rich_presence_kv: `"game:mode" "competitive" "game:state" "${state}"`,
          }),
          account(FRIEND_ID),
        ])
      );

      const { user } = await SteamAPIClient.getJoinSnapshot(USER_ID, FRIEND_ID, AUTH);

      expect(user.inCS2).toBe(true);
      expect(user.inCompetitiveOrPremier).toBe(expected);
      expect(user.inSupportedMode).toBe(false);
    });
  });
});
