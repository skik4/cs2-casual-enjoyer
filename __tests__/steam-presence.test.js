/**
 * Rich presence details for the map finder: official servers, scores,
 * presence of many players and other people's friends lists - exercised
 * through the real Steam modules with only fetch mocked
 */

jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import SteamAPIClient from "../src/steam/steam-api-client.js";
import SteamAPIUtils from "../src/steam/steam-api-utils.js";
import Validators from "../src/utils/validators.js";

const A = "76561198000000011";
const B = "76561198000000012";
const KEY = "ABCDEF0123456789ABCDEF0123456789";
const CONNECT = "+gcconnect0A1B2C3D4E5F60718293A4B5";

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
    ["the main menu", '"game:state" "lobby" "game:mode" "casual"', false],
  ])("%s", (_name, kv, expected) => {
    expect(SteamAPIUtils.isOfficialServer(SteamAPIUtils.parseRichPresence(kv))).toBe(
      expected
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
    global.fetch.mockResolvedValue(
      okResponse({
        response: {
          accounts: [account(A, OFFICIAL_CASUAL), account(B, COMMUNITY_CASUAL)],
        },
      })
    );

    const presence = await SteamAPIClient.getPresence([A, B], KEY);

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
