/**
 * GetPlayerLinkDetails requests shared between callers: the map finder asks
 * about thousands of ids in one batch, the join loop and the friends refresh
 * about a few, and the few must not wait for the many - exercised through
 * the real SteamAPIClient with only fetch mocked
 */

jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import SteamAPIClient from "../src/steam/steam-api-client.js";
import credentialState from "../src/steam/credential-state.js";

const USER = "76561198000000001";
const AUTH = "ABCDEF0123456789ABCDEF0123456789";
const CASUAL = '"game:mode" "casual" "game:state" "game" "game:map" "de_dust2"';

const account = (steamid) => ({
  public_data: { steamid, persona_name: steamid },
  private_data: { game_id: "730", rich_presence_kv: CASUAL },
});

const okResponse = (accounts) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => ({ response: { accounts } }),
});

/** Steam ids a fetch call asked for */
const requestedIds = (url) =>
  [...new URL(url).searchParams.entries()]
    .filter(([key]) => key.startsWith("steamids["))
    .map(([, value]) => value);

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** The promise's value, or "stalled" when it has not settled in time */
const within = (promise, ms) =>
  Promise.race([promise, tick(ms).then(() => "stalled")]);

beforeEach(() => {
  jest.clearAllMocks();
  SteamAPIClient.reset();
  global.fetch = jest.fn();
});

test("a few ids wait for the request that holds them, not for every chunk of a big batch", async () => {
  // The map finder asks about 150 players: two requests, sent one after the
  // other. The first is slow and the second never answers.
  const ids = Array.from({ length: 150 }, (_, i) =>
    String(76561198100000000n + BigInt(i))
  );
  let answerFirst;
  global.fetch.mockImplementation(async (url) => {
    const asked = requestedIds(url);
    if (asked.includes(ids[0])) {
      return new Promise((resolve) => {
        answerFirst = () => resolve(okResponse(asked.map(account)));
      });
    }
    if (asked.includes(ids[100])) return new Promise(() => {});
    return okResponse(asked.map(account));
  });

  const finder = SteamAPIClient.getPresence(ids, AUTH);
  await tick(SteamAPIClient._BATCH_WINDOW_MS + 5);
  expect(global.fetch).toHaveBeenCalledTimes(1);

  // Meanwhile the join loop asks about the user and a player of the first
  // request, which is still out
  const snapshot = SteamAPIClient.getJoinSnapshot(USER, ids[5], AUTH);
  await tick(SteamAPIClient._BATCH_WINDOW_MS + 5);
  answerFirst();

  const result = await within(snapshot, 200);
  expect(result).not.toBe("stalled");
  expect(result.user).toMatchObject({ inCS2: true });
  expect(result.friend).toMatchObject({ inCS2: true, inSupportedMode: true });
  // The finder's own batch still waits on its second request
  expect(await within(finder, 50)).toBe("stalled");
});

const errorResponse = (status, statusText) => ({
  ok: false,
  status,
  statusText,
  json: async () => ({}),
});

describe("Steam saying stop", () => {
  const ids = Array.from({ length: 350 }, (_, i) =>
    String(76561198200000000n + BigInt(i))
  );

  afterEach(() => credentialState.reset());

  test.each([
    [429, "Too Many Requests"],
    [503, "Service Unavailable"],
  ])("an HTTP %s stops the rest of the batch, its ids left unanswered", async (status, text) => {
    global.fetch.mockImplementation(async (url) => {
      const asked = requestedIds(url);
      return asked.includes(ids[100])
        ? errorResponse(status, text)
        : okResponse(asked.map(account));
    });

    const presence = await SteamAPIClient.getPresence(ids, AUTH);

    // The first chunk answered, the second failed, the third and fourth
    // were never sent
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(presence.has(ids[0])).toBe(true);
    expect(presence.has(ids[100])).toBe(false);
    expect(presence.has(ids[300])).toBe(false);
  });

  test("a 401 marks the credential turned down, and an answer takes it back", async () => {
    global.fetch.mockResolvedValue(errorResponse(401, "Unauthorized"));

    await SteamAPIClient.getPresence(ids, AUTH);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(credentialState.isRejected(AUTH)).toBe(true);

    // A reload the user asks for is answered: polling may go on
    SteamAPIClient.reset();
    global.fetch.mockImplementation(async (url) => okResponse(requestedIds(url).map(account)));
    await SteamAPIClient.getPresence([USER], AUTH);

    expect(credentialState.isRejected(AUTH)).toBe(false);
  });

  test("another credential is not held back by one Steam turned down", async () => {
    global.fetch.mockResolvedValue(errorResponse(403, "Forbidden"));
    await SteamAPIClient.getPresence([USER], AUTH);

    expect(credentialState.isRejected(AUTH)).toBe(true);
    expect(credentialState.isRejected("FEDCBA9876543210FEDCBA9876543210")).toBe(false);
  });
});
