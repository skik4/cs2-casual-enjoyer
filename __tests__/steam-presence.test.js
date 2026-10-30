/**
 * Rich presence details for the map finder: official servers, scores,
 * presence of many players and other people's friends lists - exercised
 * through the real Steam modules with only fetch mocked
 */

jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import SteamAPIClient from "../src/steam/steam-api-client.js";
import SteamAPIResponseProcessor from "../src/steam/steam-api-response-processor.js";
import SteamAPIUtils from "../src/steam/steam-api-utils.js";
import Validators from "../src/utils/validators.js";

const A = "76561198000000011";
const B = "76561198000000012";
const KEY = "ABCDEF0123456789ABCDEF0123456789";
const CONNECT = "+gcconnect0A1B2C3D4E5F60718293A4B5";
const OFFICIAL_SERVER = "90071992547409921";

const OFFICIAL_CASUAL = `"status" "Casual Dust II [ 3 : 1 ]" "game:state" "game" "steam_display" "#display_GameKnownMapScore" "game:mode" "casual" "game:map" "de_dust2" "game:score" "[ 3 : 1 ]" "game:server" "kv" "connect" "${CONNECT}" "game_server_steam_id" "90071992547409921"`;
const COMMUNITY_CASUAL = `"status" "Community Casual Dust II" "game:state" "game" "steam_display" "#display_GameKnownMap" "game:mode" "casual" "game:map" "de_dust2" "game:server" "community" "game:act" "community" "Addon" "3329709053" "game_server_steam_id" "85568392920039425"`;
const RELAYED_COMMUNITY = `"status" "Casual de_mirage | RETAKE #271" "game:state" "game" "steam_display" "#display_GameWkshpMapScore" "game:mode" "casual" "game:map" "de_mirage | RETAKE #271" "game:server" "kv"`;

const account = (steamid, rich_presence_kv, game_id = "730") => ({
  public_data: { steamid, persona_name: `name-${steamid.slice(-2)}` },
  private_data: { game_id, rich_presence_kv },
});

const okResponse = (body) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => body,
});

/** Answer presence requests the way Steam does */
const mockSteam = ({ accounts = [] }) => {
  global.fetch.mockImplementation(async () => okResponse({ response: { accounts } }));
};

beforeEach(() => {
  jest.clearAllMocks();
  SteamAPIClient._cache.clear();
  global.fetch = jest.fn();
  // Real token/key detection decides which parameter carries the auth
  Validators.isWebApiToken.mockImplementation((value) =>
    /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value)
  );
});

describe("isOfficialServer", () => {
  test.each([
    ["an official casual match", OFFICIAL_CASUAL, true],
    ["a community server", COMMUNITY_CASUAL, false],
    ["a community server on Valve's relays", RELAYED_COMMUNITY, false],
    [
      "a workshop add-on on a known map",
      `${OFFICIAL_CASUAL} "Addon" "3329709053"`,
      false,
    ],
    [
      // Seen for real: "kv", a known map and no add-on, but a token-listed
      // community server at a public address
      "a community server listed with a login token",
      OFFICIAL_CASUAL.replace("90071992547409921", "85568392931758174"),
      false,
    ],
    ["the main menu", '"game:state" "lobby" "game:mode" "casual"', false],
  ])("%s", (_name, kv, expected) => {
    expect(SteamAPIUtils.isOfficialServer(SteamAPIUtils.parseRichPresence(kv))).toBe(
      expected
    );
  });
});

describe("official server signals", () => {
  test("isAnonymousGameServer reads the account type from the server id", () => {
    expect(SteamAPIUtils.isAnonymousGameServer("90295736594079769")).toBe(true);
    expect(SteamAPIUtils.isAnonymousGameServer("85568392931758174")).toBe(false);
    expect(SteamAPIUtils.isAnonymousGameServer(null)).toBe(false);
    expect(SteamAPIUtils.isAnonymousGameServer("not a number")).toBe(false);
  });

  test("the server id can come from outside rich presence", async () => {
    const withoutId = OFFICIAL_CASUAL.replace(
      ' "game_server_steam_id" "90071992547409921"',
      ""
    );
    mockSteam({
      accounts: [
        {
          public_data: { steamid: A },
          private_data: {
            game_id: "730",
            rich_presence_kv: withoutId,
            game_server_steam_id: OFFICIAL_SERVER,
          },
        },
      ],
    });

    const presence = await SteamAPIClient.getPresence([A], KEY);

    expect(presence.get(A)).toMatchObject({
      serverId: OFFICIAL_SERVER,
      official: true,
    });
  });
});

describe("official servers without addresses", () => {
  test("rich presence and the server account decide, with no address lookup", async () => {
    // Steam has listed no address for any anonymous server since late
    // October 2026, Valve's included, so none is asked for
    mockSteam({
      accounts: [account(A, OFFICIAL_CASUAL), account(B, RELAYED_COMMUNITY)],
    });

    const presence = await SteamAPIClient.getPresence([A, B], KEY);

    expect(presence.get(A).official).toBe(true);
    expect(presence.get(B).official).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(global.fetch.mock.calls[0][0])).toContain("/GetPlayerLinkDetails/");
  });
});

describe("status key", () => {
  const joinInfo = (kv, serverId) =>
    SteamAPIResponseProcessor.processJoinInfoResponse({
      response: {
        accounts: [
          {
            public_data: { steamid: A },
            private_data: { game_id: "730", rich_presence_kv: kv, game_server_steam_id: serverId },
          },
        ],
      },
    });

  test("changes with any value and ignores the order Steam lists them in", () => {
    const key = (kv) => SteamAPIUtils.richPresenceKey(kv);

    expect(key('"a" "1" "b" "2"')).toBe(key('"b" "2" "a" "1"'));
    expect(key('"a" "1" "b" "2"')).not.toBe(key('"a" "1" "b" "3"'));
    expect(key(null)).toBe("");
  });

  test("a new join token alone is no change; a connect showing up or going away is", () => {
    const key = (kv) => SteamAPIUtils.richPresenceKey(kv);
    // Seen live: only the token changed, as the user arrived on the server
    const before = '"connect" "+gcconnect62805B3F4B1347F135DF8FBE" "game:map" "de_dust2"';
    const after = '"connect" "+gcconnect0FB32A434B1347F1A291CB89" "game:map" "de_dust2"';

    expect(key(after)).toBe(key(before));
    expect(key('"game:map" "de_dust2"')).not.toBe(key(before));
    // Joining a lobby is not joining a server
    expect(key('"connect" "+gcconnectG4B1347F1" "game:map" "de_dust2"')).not.toBe(
      key(before)
    );
  });

  test("connectKind keeps what a connect joins and drops its token", () => {
    expect(SteamAPIUtils.connectKind("+gcconnect62805B3F4B1347F135DF8FBE")).toBe(
      "+gcconnect"
    );
    expect(SteamAPIUtils.connectKind("+gcconnectG4B1347F1")).toBe("+gcconnectG");
    expect(SteamAPIUtils.connectKind("+gcconnectL0A0B0C0D0E0F0A0B0C0D0E0F")).toBe(
      "+gcconnectL"
    );
    expect(SteamAPIUtils.connectKind(null)).toBeNull();
  });

  test("a player's key covers the whole rich presence and the server", () => {
    const base = joinInfo(OFFICIAL_CASUAL).statusKey;

    expect(joinInfo(OFFICIAL_CASUAL).statusKey).toBe(base);
    // A new score shows in the status line before anything else changes
    expect(joinInfo(OFFICIAL_CASUAL.replace("[ 3 : 1 ]", "[ 4 : 1 ]")).statusKey).not.toBe(
      base
    );
    // The server id can come from outside rich presence and still counts
    const withoutId = OFFICIAL_CASUAL.replace(
      ' "game_server_steam_id" "90071992547409921"',
      ""
    );
    expect(joinInfo(withoutId, "90071992547409921").statusKey).not.toBe(
      joinInfo(withoutId, "90071992547409922").statusKey
    );
  });
});

describe("parseRoundsPlayed", () => {
  test("adds both sides of the score", () => {
    expect(SteamAPIUtils.parseRoundsPlayed("[ 3 : 1 ]")).toBe(4);
    expect(SteamAPIUtils.parseRoundsPlayed("[ 12 : 10 ]")).toBe(22);
    expect(SteamAPIUtils.parseRoundsPlayed(null)).toBeNull();
    expect(SteamAPIUtils.parseRoundsPlayed("")).toBeNull();
  });
});

describe("getPresence", () => {
  test("reads map, score and whether the server is official", async () => {
    mockSteam({
      accounts: [account(A, OFFICIAL_CASUAL), account(B, COMMUNITY_CASUAL)],
    });

    const presence = await SteamAPIClient.getPresence([A, B], KEY);

    // One request for both players
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(presence.get(A)).toMatchObject({
      steamid: A,
      inSupportedMode: true,
      mode: "casual",
      map: "de_dust2",
      score: "[ 3 : 1 ]",
      connect: CONNECT,
      serverId: "90071992547409921",
      official: true,
    });
    expect(presence.get(B)).toMatchObject({ official: false, map: "de_dust2" });
  });

  test("an id Steam has no account for is answered as not in CS2", async () => {
    global.fetch.mockResolvedValue(okResponse({ response: { accounts: [] } }));

    const presence = await SteamAPIClient.getPresence([A], KEY);

    expect(presence.get(A)).toMatchObject({
      steamid: A,
      inCS2: false,
      official: false,
      map: null,
    });
  });

  test("expired cache entries are dropped, not only ones asked about again", async () => {
    SteamAPIClient._cache.set("76561198000000099", { raw: null, ts: 0 });
    global.fetch.mockResolvedValue(
      okResponse({ response: { accounts: [account(A, OFFICIAL_CASUAL)] } })
    );

    await SteamAPIClient.getPresence([A], KEY);

    expect(SteamAPIClient._cache.has("76561198000000099")).toBe(false);
    expect(SteamAPIClient._cache.has(A)).toBe(true);
  });

  test("a failed request leaves the ids out", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNRESET"));

    const presence = await SteamAPIClient.getPresence([A, B], KEY);

    expect(presence.size).toBe(0);
  });
});

describe("getFriendIdsOf", () => {
  test("lists someone else's friends with an API key", async () => {
    global.fetch.mockResolvedValue(
      okResponse({
        friendslist: {
          friends: [
            { steamid: A, relationship: "friend" },
            { steamid: B, relationship: "requestrecipient" },
          ],
        },
      })
    );

    await expect(SteamAPIClient.getFriendIdsOf("76561198000000001", KEY)).resolves.toEqual([A]);
    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/ISteamUser/GetFriendList/v1/");
    expect(url.searchParams.get("key")).toBe(KEY);
    expect(url.searchParams.get("relationship")).toBe("friend");
  });

  test("a private list comes back empty", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({}),
    });

    await expect(SteamAPIClient.getFriendIdsOf("76561198000000001", KEY)).resolves.toEqual([]);
  });
});
