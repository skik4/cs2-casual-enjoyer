/**
 * Jest tests for SteamAPIUtils - rich presence, friends lists and HTTP errors
 */

import SteamAPIUtils from "../src/steam/steam-api-utils.js";
import { ERROR_CODES } from "../src/shared/constants.js";

const rp = (kv) => SteamAPIUtils.parseRichPresence(kv);

describe("parseRichPresence", () => {
  test("reads the keys the app uses", () => {
    expect(
      rp(
        '"status" "Casual Dust II [ 3 : 1 ]" "game:state" "game" "game:mode" "casual" "game:map" "de_dust2" "game:score" "[ 3 : 1 ]" "connect" "+gcconnectG1A2B3C4D" "game_server_steam_id" "9001" "game:server" "kv" "steam_display" "#display_GameKnownMapScore"'
      )
    ).toEqual({
      status: "Casual Dust II [ 3 : 1 ]",
      game_state: "game",
      game_mode: "casual",
      game_map: "de_dust2",
      game_score: "[ 3 : 1 ]",
      connect: "+gcconnectG1A2B3C4D",
      game_server_steam_id: "9001",
      game_server: "kv",
      steam_display: "#display_GameKnownMapScore",
      addon: null,
    });
  });

  test("treats a missing string as empty rich presence", () => {
    expect(rp(undefined).game_mode).toBeNull();
    expect(rp(null).connect).toBeNull();
  });
});

describe("modes", () => {
  test("only a running casual match is a supported mode", () => {
    expect(SteamAPIUtils.isInSupportedMode(rp('"game:mode" "casual" "game:state" "game"'))).toBe(true);
    expect(SteamAPIUtils.isInSupportedMode(rp('"game:mode" "casual" "game:state" "lobby"'))).toBe(false);
    expect(SteamAPIUtils.isInSupportedMode(rp('"game:mode" "deathmatch" "game:state" "game"'))).toBe(false);
    expect(SteamAPIUtils.isInSupportedMode(rp('"game:mode" "competitive" "game:state" "game"'))).toBe(false);
  });

  test("join needs a supported mode and a valid connect", () => {
    expect(
      SteamAPIUtils.isJoinAvailable(
        rp('"game:mode" "casual" "game:state" "game" "connect" "+gcconnectG1A2B3C4D"')
      )
    ).toBe(true);
    expect(
      SteamAPIUtils.isJoinAvailable(rp('"game:mode" "casual" "game:state" "game"'))
    ).toBe(false);
  });

  test("competitive or premier counts only once the match runs", () => {
    const priv = (kv) => ({ game_id: "730", rich_presence_kv: kv });
    expect(
      SteamAPIUtils.isPlayerInCompetitiveOrPremier(
        priv('"game:mode" "premier" "game:state" "game"')
      )
    ).toBe(true);
    expect(
      SteamAPIUtils.isPlayerInCompetitiveOrPremier(
        priv('"game:mode" "competitive" "game:state" "lobby"')
      )
    ).toBe(false);
    expect(SteamAPIUtils.isPlayerInCompetitiveOrPremier(null)).toBe(false);
  });

  test("isPlayerInCS2 checks the app id", () => {
    expect(SteamAPIUtils.isPlayerInCS2({ game_id: "730" })).toBe(true);
    expect(SteamAPIUtils.isPlayerInCS2({ game_id: "570" })).toBe(false);
    expect(SteamAPIUtils.isPlayerInCS2(undefined)).toBe(false);
  });
});

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
    expect(SteamAPIUtils.extractPlayersFromSummaries({ players: [1] })).toEqual([1]);
    expect(
      SteamAPIUtils.extractPlayersFromSummaries({ response: { players: [2] } })
    ).toEqual([2]);
    expect(SteamAPIUtils.extractPlayersFromSummaries({})).toEqual([]);
  });
});

describe("avatars and logging helpers", () => {
  test("extractBestAvatar prefers the full size", () => {
    expect(
      SteamAPIUtils.extractBestAvatar({ avatar: "s", avatarfull: "f", avatarmedium: "m" })
    ).toBe("f");
    expect(SteamAPIUtils.extractBestAvatar({ avatarmedium: "m" })).toBe("m");
    expect(SteamAPIUtils.extractBestAvatar(undefined)).toBe("");
  });

  test("filterMissingAvatars leaves out cached ones", () => {
    expect(SteamAPIUtils.filterMissingAvatars(["1", "2"], { 1: {} })).toEqual(["2"]);
  });

  test("maskAuthInUrl hides keys and tokens", () => {
    expect(
      SteamAPIUtils.maskAuthInUrl("https://x/?key=SECRET&a=1&access_token=TOKEN")
    ).toBe("https://x/?key=***&a=1&access_token=***");
  });
});

describe("HTTP errors", () => {
  const response = (status, ok = false) => ({ ok, status, statusText: "S" });

  test("an OK response passes", () => {
    expect(SteamAPIUtils.handleHttpResponse(response(200, true), {})).toBe(true);
  });

  test("a private friends list has an error of its own", () => {
    const errorHandlers = SteamAPIUtils.getMethodErrorHandlers("GetFriendsList");

    expect(() =>
      SteamAPIUtils.handleHttpResponse(response(401), {
        method: "GetFriendsList",
        errorHandlers,
        allowFailure: true,
      })
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.PRIVATE_FRIENDS_LIST }));
  });

  test("allowFailure turns other errors into false", () => {
    expect(
      SteamAPIUtils.handleHttpResponse(response(429), {
        method: "GetPlayerLinkDetails",
        errorHandlers: SteamAPIUtils.getMethodErrorHandlers("GetPlayerLinkDetails"),
        allowFailure: true,
      })
    ).toBe(false);
  });

  test("without allowFailure an error carries the status", () => {
    expect(() =>
      SteamAPIUtils.handleHttpResponse(response(500), {
        method: "GetPlayerLinkDetails",
        errorHandlers: {},
      })
    ).toThrow(expect.objectContaining({ code: "API_ERROR_500" }));
  });
});
