/**
 * Replays of joins recorded in the join journal. The rich presence Steam
 * showed goes through the real presence processing and join loop, and CS2's
 * states arrive as the journal recorded them, at the recorded moments. Each
 * case once went wrong; the replay checks what the loop does now.
 * Player, server and token ids are made up; maps, scores, rich presence
 * fields and timings are as recorded.
 */

jest.mock("../src/steam/steam-api.js");
jest.mock("../src/utils/error-handler.js");
jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import joinManager, { getMapJoinId } from "../src/game/join-manager.js";
import { interpretGsiPayload } from "../src/game/gsi-manager.js";
import SteamAPIResponseProcessor from "../src/steam/steam-api-response-processor.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
import SteamAPI from "../src/steam/steam-api.js";

const USER = "76561198000000001";
const PICK = "76561198000000011";
const AUTH = "ABCD1234EFGH5678IJKL9012MNOP3456";
const USER_SERVER = "90296145700000001";
const PICK_SERVER = "90295772100000002";

/** Rich presence of a player in a casual Dust II match, as Steam lists it */
const dustKv = (score, connect, xptrail = "3") =>
  [
    ...(connect ? [["connect", connect]] : []),
    ["game:map", "de_dust2"],
    ["game:mode", "casual"],
    ["game:score", score],
    ["game:server", "kv"],
    ["game:state", "game"],
    ["game:xptrail", xptrail],
    ["status", `Casual Dust II ${score}`],
    ["steam_display", "#display_GameKnownMapScore"],
    ["version", "14193"],
  ]
    .map(([key, value]) => `"${key}" "${value}"`)
    .join(" ");

/**
 * What Steam and CS2 showed at a moment of a recording: the latest step at
 * or before `elapsed` wins, field by field
 * @param {Array<Object>} steps - {at, gsi?, user?, pick?}, `at` in ms from the attempt's start
 * @param {number} elapsed - ms since the attempt started
 */
const stateAt = (steps, elapsed) =>
  steps
    .filter((step) => step.at <= elapsed)
    .reduce((state, { at: _at, ...step }) => ({ ...state, ...step }), {});

const account = (steamid, kv, server) => ({
  response: {
    accounts: [
      {
        public_data: { steamid, persona_name: steamid },
        private_data: {
          game_id: "730",
          rich_presence_kv: kv,
          ...(server ? { game_server_steam_id: server } : {}),
        },
      },
    ],
  },
});

/**
 * Run a map join for Dust II against a recording
 * @param {number} start - Epoch ms of the attempt's start
 * @param {Array<Object>} steps - The recording
 * @param {number} until - ms to run for
 * @param {Object} [options]
 * @param {boolean} [options.withGsi] - False replays without CS2's states,
 *   as before CS2 has read the cfg: Steam alone decides
 */
async function replay(start, steps, until, { withGsi = true } = {}) {
  jest.useFakeTimers({ now: start });
  const elapsed = () => Date.now() - start;
  let mapLoadedAt = 0;
  let lastMap = null;

  SteamAPI.getPresence.mockImplementation(async (ids) => {
    const { user, pick } = stateAt(steps, elapsed());
    const presence = new Map();
    for (const id of ids) {
      let raw = null;
      if (id === USER && user) raw = account(USER, user.kv, user.server);
      if (id === PICK && pick) raw = account(PICK, pick.kv, pick.server);
      if (raw) presence.set(id, SteamAPIResponseProcessor.processPresenceResponse(raw));
    }
    return presence;
  });

  joinManager.setCS2Manager({
    checkUserInCS2: jest.fn().mockResolvedValue(true),
    getGsiUserState: () => {
      if (!withGsi) return null;
      const { gsi } = stateAt(steps, elapsed());
      const state = interpretGsiPayload({
        provider: { steamid: USER },
        ...(gsi.map ? { map: gsi.map } : {}),
        player: { steamid: USER, activity: gsi.activity },
      });
      if (state.mapName !== lastMap) {
        if (state.inMatch) mapLoadedAt = Date.now();
        lastMap = state.mapName;
      }
      return { ...state, mapLoadedAt };
    },
  });

  joinManager.startMapJoin({
    map: "de_dust2",
    serverId: null,
    label: "Dust II",
    getCandidateIds: () => [PICK],
  });
  await jest.advanceTimersByTimeAsync(until);
}

let openExternal;
let updateDot;

beforeEach(() => {
  jest.clearAllMocks();
  updateDot = jest.fn();
  joinManager.setUICallbacks(updateDot, jest.fn());
  joinManager.configure({
    getCredentials: () => ({ steamId: USER, auth: AUTH }),
  });
  openExternal = jest.fn().mockResolvedValue(true);
  global.window.electronAPI = { shell: { openExternal } };
});

afterEach(() => {
  joinManager.resetAll();
  jest.clearAllTimers();
  jest.useRealTimers();
  delete global.window.electronAPI;
});

test("2026-10-25 20:53: the user's own arrival renews the join token, and no second connect goes out", async () => {
  // The loop of that day connected again 2 s later, on the new token alone,
  // and CS2 answered "Game is full"
  const first = "+gcconnect7F8619FB1C0000AA56F804EE";
  const renewed = "+gcconnect297784E91C0000AA139423A2";
  const menu = { activity: "menu" };
  const steps = [
    { at: 0, gsi: menu, user: { kv: "" }, pick: { kv: dustKv("[ 7 : 3 ]"), server: PICK_SERVER } },
    { at: 9003, pick: { kv: dustKv("[ 7 : 3 ]", first), server: PICK_SERVER } },
    { at: 10976, pick: { kv: dustKv("[ 7 : 3 ]", renewed), server: PICK_SERVER } },
    { at: 13001, user: { kv: dustKv("[ 7 : 3 ]"), server: PICK_SERVER } },
    {
      at: 13022,
      gsi: { map: { name: "de_dust2", mode: "casual", phase: "live", round: 10 }, activity: "playing" },
    },
  ];

  await replay(Date.parse("2026-10-25T20:53:55.379Z"), steps, 14000);

  expect(openExternal).toHaveBeenCalledTimes(1);
  expect(openExternal).toHaveBeenCalledWith(`steam://rungame/730/${PICK}/${first}`);
  expect(updateDot).toHaveBeenCalledWith(getMapJoinId("de_dust2"), STATUS_TYPES.JOINED);
});

describe("2026-10-30 20:26: the match ends at 8:2 while another Dust II server has a slot", () => {
  // The user's Dust II match was over (CS2 showed gameover) and Steam still
  // showed them on Dust II, so the loop of that day ended as joined at once
  const offer = "+gcconnect30317BC60300000046CBA681";
  const gameover = {
    map: { name: "de_dust2", mode: "casual", phase: "gameover", round: 10 },
    activity: "playing",
  };
  const steps = [
    {
      at: 0,
      gsi: gameover,
      user: { kv: dustKv("[ 8 : 2 ]"), server: USER_SERVER },
      pick: { kv: dustKv("[ 7 : 2 ]", offer, "0"), server: PICK_SERVER },
    },
    { at: 9403, gsi: { activity: "menu" } },
    {
      at: 18322,
      gsi: { map: { name: "de_mirage", mode: "casual", phase: "warmup", round: 0 }, activity: "playing" },
    },
  ];

  test("the map is not taken as joined, and another server is", async () => {
    await replay(Date.parse("2026-10-30T20:26:10.001Z"), steps, 1000);

    expect(updateDot).not.toHaveBeenCalledWith(getMapJoinId("de_dust2"), STATUS_TYPES.JOINED);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(`steam://rungame/730/${PICK}/${offer}`);
  });

  test("the same without CS2's states: Steam's final score says the match is over", async () => {
    // Before CS2 has read the cfg there is no GSI, and Steam shows the user
    // on Dust II with the final score
    await replay(Date.parse("2026-10-30T20:26:10.001Z"), steps, 1000, { withGsi: false });

    expect(updateDot).not.toHaveBeenCalledWith(getMapJoinId("de_dust2"), STATUS_TYPES.JOINED);
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(`steam://rungame/730/${PICK}/${offer}`);
  });
});
