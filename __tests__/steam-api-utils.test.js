/**
 * Jest tests for SteamAPIUtils - friends lists, avatars and HTTP errors
 */

import SteamAPIUtils from "../src/steam/steam-api-utils.js";
import { ERROR_CODES } from "../src/shared/constants.js";

describe("friends lists", () => {
  test("keeps confirmed friends from a token response", () => {
    expect(
      SteamAPIUtils.extractFriendIds(
        {
          response: {
            friendslist: {
              friends: [
                { ulfriendid: "1", efriendrelationship: 3 },
                { ulfriendid: "2", efriendrelationship: 2 },
              ],
            },
          },
        },
        true
      )
    ).toEqual(["1"]);
  });

  test("keeps confirmed friends from an API key response", () => {
    expect(
      SteamAPIUtils.extractFriendIds(
        {
          friendslist: {
            friends: [
              { steamid: "1", relationship: "friend" },
              { steamid: "2", relationship: "requestrecipient" },
            ],
          },
        },
        false
      )
    ).toEqual(["1"]);
  });

  test("an unexpected shape gives no friends", () => {
    expect(SteamAPIUtils.extractFriendIds({}, true)).toEqual([]);
    expect(SteamAPIUtils.extractFriendIds({}, false)).toEqual([]);
  });

  test("player summaries come in two shapes", () => {
    expect(SteamAPIUtils.extractPlayersFromSummaries({ players: [1] })).toEqual(
      [1]
    );
    expect(
      SteamAPIUtils.extractPlayersFromSummaries({ response: { players: [2] } })
    ).toEqual([2]);
    expect(SteamAPIUtils.extractPlayersFromSummaries({})).toEqual([]);
  });
});

describe("avatars and logging helpers", () => {
  test("extractBestAvatar prefers the full size", () => {
    expect(
      SteamAPIUtils.extractBestAvatar({
        avatar: "s",
        avatarfull: "f",
        avatarmedium: "m",
      })
    ).toBe("f");
    expect(SteamAPIUtils.extractBestAvatar({ avatarmedium: "m" })).toBe("m");
    expect(SteamAPIUtils.extractBestAvatar(undefined)).toBe("");
  });

  test("filterMissingAvatars leaves out cached ones", () => {
    expect(SteamAPIUtils.filterMissingAvatars(["1", "2"], { 1: {} })).toEqual([
      "2",
    ]);
  });

  test("maskAuthInUrl hides keys and tokens", () => {
    expect(
      SteamAPIUtils.maskAuthInUrl(
        "https://x/?key=SECRET&a=1&access_token=TOKEN"
      )
    ).toBe("https://x/?key=***&a=1&access_token=***");
  });
});

describe("HTTP errors", () => {
  const response = (status, ok = false) => ({ ok, status, statusText: "S" });

  test("an OK response passes", () => {
    expect(SteamAPIUtils.handleHttpResponse(response(200, true), {})).toBe(
      true
    );
  });

  test("a private friends list has an error of its own", () => {
    const errorHandlers = SteamAPIUtils.getMethodErrorHandlers(
      "GetFriendsList",
      false
    );

    expect(() =>
      SteamAPIUtils.handleHttpResponse(response(401), {
        method: "GetFriendsList",
        errorHandlers,
        allowFailure: true,
      })
    ).toThrow(
      expect.objectContaining({ code: ERROR_CODES.PRIVATE_FRIENDS_LIST })
    );
  });

  test("a token's 401 on the friends list is the token turned down, not a private list", () => {
    expect(() =>
      SteamAPIUtils.handleHttpResponse(response(401), {
        method: "GetFriendsList",
        isToken: true,
        errorHandlers: SteamAPIUtils.getMethodErrorHandlers(
          "GetFriendsList",
          true
        ),
      })
    ).toThrow(
      expect.objectContaining({ code: ERROR_CODES.TOKEN_REJECTED, status: 401 })
    );
  });

  test.each([
    [401, true, ERROR_CODES.TOKEN_REJECTED],
    [403, true, ERROR_CODES.TOKEN_REJECTED],
    [403, false, ERROR_CODES.KEY_REJECTED],
    [429, false, ERROR_CODES.RATE_LIMITED],
    [503, true, ERROR_CODES.STEAM_UNAVAILABLE],
    [404, false, ERROR_CODES.STEAM_ERROR],
  ])("status %i (token: %s) is %s", (status, isToken, code) => {
    expect(() =>
      SteamAPIUtils.handleHttpResponse(response(status), {
        method: "GetPlayerSummaries",
        isToken,
        errorHandlers: SteamAPIUtils.getMethodErrorHandlers(
          "GetPlayerSummaries",
          isToken
        ),
      })
    ).toThrow(expect.objectContaining({ code, status }));
  });

  test("allowFailure turns other errors into false", () => {
    expect(
      SteamAPIUtils.handleHttpResponse(response(429), {
        method: "GetPlayerLinkDetails",
        errorHandlers: SteamAPIUtils.getMethodErrorHandlers(
          "GetPlayerLinkDetails"
        ),
        allowFailure: true,
      })
    ).toBe(false);
  });

  test("without allowFailure an error carries the status, and the log its method", () => {
    expect(() =>
      SteamAPIUtils.handleHttpResponse(response(500), {
        method: "GetPlayerLinkDetails",
        errorHandlers: {},
      })
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.STEAM_UNAVAILABLE,
        status: 500,
        message: "GetPlayerLinkDetails failed: 500 S",
      })
    );
  });
});
