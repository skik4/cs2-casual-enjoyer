/**
 * Jest tests for the rich presence rules: parsing, the modes a join needs,
 * and the matches a join must not pull the user out of
 */

import {
  isInCS2,
  isInProtectedMatch,
  isInSupportedMode,
  isJoinAvailable,
  parseRichPresence,
} from "../src/steam/rich-presence.js";

const rp = (kv) => parseRichPresence(kv);

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
    expect(isInSupportedMode(rp('"game:mode" "casual" "game:state" "game"'))).toBe(true);
    expect(isInSupportedMode(rp('"game:mode" "casual" "game:state" "lobby"'))).toBe(false);
    expect(isInSupportedMode(rp('"game:mode" "deathmatch" "game:state" "game"'))).toBe(false);
    expect(isInSupportedMode(rp('"game:mode" "competitive" "game:state" "game"'))).toBe(false);
  });

  test("join needs a supported mode and a valid connect", () => {
    expect(
      isJoinAvailable(
        rp('"game:mode" "casual" "game:state" "game" "connect" "+gcconnectG1A2B3C4D"')
      )
    ).toBe(true);
    expect(
      isJoinAvailable(rp('"game:mode" "casual" "game:state" "game"'))
    ).toBe(false);
  });

  test("competitive or premier counts only once the match runs", () => {
    const priv = (kv) => ({ game_id: "730", rich_presence_kv: kv });
    expect(
      isInProtectedMatch(
        priv('"game:mode" "premier" "game:state" "game"')
      )
    ).toBe(true);
    expect(
      isInProtectedMatch(
        priv('"game:mode" "competitive" "game:state" "lobby"')
      )
    ).toBe(false);
    expect(isInProtectedMatch(null)).toBe(false);
  });

  test("isInCS2 checks the app id", () => {
    expect(isInCS2({ game_id: "730" })).toBe(true);
    expect(isInCS2({ game_id: "570" })).toBe(false);
    expect(isInCS2(undefined)).toBe(false);
  });
});
