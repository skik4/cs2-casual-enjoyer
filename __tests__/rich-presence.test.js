/**
 * Jest tests for the rich presence rules: parsing, the modes a join needs,
 * and the matches a join must not pull the user out of
 */

import {
  hasPrimeSign,
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
        '"status" "Casual Dust II [ 3 : 1 ]" "game:state" "game" "game:mode" "casual" "game:map" "de_dust2" "game:score" "[ 3 : 1 ]" "connect" "+gcconnectG1A2B3C4D" "game_server_steam_id" "9001" "game:server" "kv" "steam_display" "#display_GameKnownMapScore" "game:xptrail" "4"'
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
      xptrail: "4",
      qmmflags: null,
    });
  });

  test("treats a missing string as empty rich presence", () => {
    expect(rp(undefined).game_mode).toBeNull();
    expect(rp(null).connect).toBeNull();
  });
});

describe("hasPrimeSign", () => {
  test("an XP trail of 1 or more is a sign of Prime", () => {
    expect(hasPrimeSign(rp('"game:mode" "casual" "game:xptrail" "1"'))).toBe(
      true
    );
    expect(hasPrimeSign(rp('"game:mode" "casual" "game:xptrail" "8"'))).toBe(
      true
    );
  });

  test("Premier, competitive with qmmflags 1, is a sign of Prime", () => {
    expect(
      hasPrimeSign(
        rp('"game:mode" "competitive" "game:qmmflags" "1" "game:xptrail" "0"')
      )
    ).toBe(true);
  });

  test("no trail, plain competitive or junk is no sign", () => {
    expect(hasPrimeSign(rp('"game:mode" "casual" "game:xptrail" "0"'))).toBe(
      false
    );
    expect(hasPrimeSign(rp('"game:mode" "casual"'))).toBe(false);
    expect(
      hasPrimeSign(rp('"game:mode" "competitive" "game:state" "game"'))
    ).toBe(false);
    expect(hasPrimeSign(rp('"game:mode" "casual" "game:qmmflags" "1"'))).toBe(
      false
    );
    expect(hasPrimeSign(rp('"game:xptrail" "lots"'))).toBe(false);
    expect(hasPrimeSign(null)).toBe(false);
  });
});

describe("modes", () => {
  test("only a running casual match is a supported mode", () => {
    expect(
      isInSupportedMode(rp('"game:mode" "casual" "game:state" "game"'))
    ).toBe(true);
    expect(
      isInSupportedMode(rp('"game:mode" "casual" "game:state" "lobby"'))
    ).toBe(false);
    expect(
      isInSupportedMode(rp('"game:mode" "deathmatch" "game:state" "game"'))
    ).toBe(false);
    expect(
      isInSupportedMode(rp('"game:mode" "competitive" "game:state" "game"'))
    ).toBe(false);
  });

  test("join needs a supported mode and a valid connect", () => {
    expect(
      isJoinAvailable(
        rp(
          '"game:mode" "casual" "game:state" "game" "connect" "+gcconnectG1A2B3C4D"'
        )
      )
    ).toBe(true);
    expect(
      isJoinAvailable(rp('"game:mode" "casual" "game:state" "game"'))
    ).toBe(false);
  });

  test("competitive or premier counts only once the match runs", () => {
    const priv = (kv) => ({ game_id: "730", rich_presence_kv: kv });
    expect(
      isInProtectedMatch(priv('"game:mode" "premier" "game:state" "game"'))
    ).toBe(true);
    expect(
      isInProtectedMatch(priv('"game:mode" "competitive" "game:state" "lobby"'))
    ).toBe(false);
    expect(isInProtectedMatch(null)).toBe(false);
  });

  test("isInCS2 checks the app id", () => {
    expect(isInCS2({ game_id: "730" })).toBe(true);
    expect(isInCS2({ game_id: "570" })).toBe(false);
    expect(isInCS2(undefined)).toBe(false);
  });
});
