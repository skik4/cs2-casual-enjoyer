/**
 * What loading the friends list throws when Steam says no, by credential: an
 * API key meets a private list with 401, a web token reads its owner's own
 * list, so its 401 is the token turned down - through the real
 * SteamAPIClient with only fetch mocked
 */

jest.mock("../src/steam/api-logger.js");
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import SteamAPIClient from "../src/steam/steam-api-client.js";
import { ERROR_CODES } from "../src/shared/constants.js";

const USER = "76561198000000001";
const KEY = "ABCDEF0123456789ABCDEF0123456789";
const TOKEN = "head.payload.signature";

const refusal = (status) => ({
  ok: false,
  status,
  statusText: "S",
  json: async () => ({}),
});

beforeEach(() => {
  SteamAPIClient.reset();
  global.fetch = jest.fn();
});

test.each([
  ["an API key", 401, ERROR_CODES.PRIVATE_FRIENDS_LIST, KEY],
  ["an API key", 403, ERROR_CODES.KEY_REJECTED, KEY],
  ["a web token", 401, ERROR_CODES.TOKEN_REJECTED, TOKEN],
  ["a web token", 403, ERROR_CODES.TOKEN_REJECTED, TOKEN],
  ["a web token", 429, ERROR_CODES.RATE_LIMITED, TOKEN],
  ["an API key", 502, ERROR_CODES.STEAM_UNAVAILABLE, KEY],
])("with %s, Steam's %i reads as %s", async (_, status, code, auth) => {
  global.fetch.mockResolvedValue(refusal(status));

  await expect(SteamAPIClient.getFriendsList(USER, auth)).rejects.toMatchObject({
    code,
  });
});

test("a friends list Steam cannot be reached for is a network error", async () => {
  global.fetch.mockRejectedValue(new TypeError("Failed to fetch"));

  await expect(SteamAPIClient.getFriendsList(USER, TOKEN)).rejects.toMatchObject({
    code: ERROR_CODES.NETWORK_ERROR,
  });
});
