/**
 * Whole join attempts recorded in the user's join journal, ones that went
 * right, replayed through the real presence processing and join loop: a
 * change to the loop that would have spoilt one of them fails here.
 * The recordings (fixtures/join-journal-replays.json) hold what Steam showed
 * about the players joined through and about the user's server, and the
 * states CS2 sent, at the recorded moments. Player, server and join-token
 * ids are made up, one real id always by the same made-up one; maps, scores,
 * rich presence fields and timings are as recorded. Steam's copy of the
 * user's own rich presence is not in the journal: here it names the map of
 * the server the user is on.
 */

jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/steam/steam-api.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import joinManager, {
  getMapJoinId,
  getServerJoinId,
} from "../src/game/join-manager.js";
import { interpretGsiPayload } from "../src/game/gsi-manager.js";
import SteamAPIResponseProcessor from "../src/steam/steam-api-response-processor.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
import SteamAPI from "../src/steam/steam-api.js";
import DOMUtils from "../src/utils/dom-utils.js";
import Validators from "../src/utils/validators.js";
import RECORDINGS from "./fixtures/join-journal-replays.json";

const USER = "76561198000000001";
const AUTH = "ABCD1234EFGH5678IJKL9012MNOP3456";

// How long the replay runs past the recorded end: the loop polls on its own
// schedule, so it may notice the arrival a poll later than the recorded loop
const SETTLE_MS = 2000;

/**
 * What Steam and CS2 showed at a moment of a recording: the latest step at
 * or before `elapsed` wins, player by player
 * @param {Array<Object>} steps - {at, gsi?, user?, players?}, `at` in ms from the start
 * @param {number} elapsed - ms since the recording started
 */
const stateAt = (steps, elapsed) =>
  steps
    .filter((step) => step.at <= elapsed)
    .reduce(
      (state, step) => ({
        gsi: step.gsi ?? state.gsi,
        user: step.user ?? state.user,
        players: { ...state.players, ...step.players },
      }),
      { gsi: null, user: null, players: {} },
    );

const account = (steamid, { kv = "", server = null, inCS2 = true }) => ({
  response: {
    accounts: [
      {
        public_data: { steamid, persona_name: steamid },
        private_data: inCS2
          ? {
              game_id: "730",
              rich_presence_kv: kv,
              ...(server ? { game_server_steam_id: server } : {}),
            }
          : {},
      },
    ],
  },
});

const mapOf = (kv) => /"game:map" "([^"]*)"/.exec(kv ?? "")?.[1] ?? null;

/** Steam's copy of the user: on the recorded server, playing its map */
const userAccount = ({ user, players, gsi }) => {
  const server = user?.server ?? null;
  const there = Object.values(players).find(
    (player) => server && player?.server === server,
  );
  const map = there ? mapOf(there.kv) : (gsi?.map?.name ?? null);
  const kv =
    server && map
      ? `"game:map" "${map}" "game:mode" "casual" "game:server" "kv" "game:state" "game" "steam_display" "#display_GameKnownMap"`
      : "";
  return account(USER, { kv, server, inCS2: user?.inCS2 !== false });
};

const joinIdOf = ({ target }) => {
  if (target.kind === "friend") return target.friend;
  return target.kind === "server"
    ? getServerJoinId(target.serverId)
    : getMapJoinId(target.map);
};

const startAttempt = ({ target, candidates }) => {
  if (target.kind === "friend") {
    joinManager.startJoin(target.friend);
    return;
  }
  joinManager.startMapJoin({
    map: target.map,
    serverId: target.serverId ?? null,
    label: target.map,
    getCandidateIds: () => candidates,
  });
};

/**
 * Start the recording's attempts at their recorded moments and run them
 * against it until it ends
 * @param {Object} recording - One entry of the fixtures
 */
async function replay(recording) {
  const start = Date.parse(recording.start);
  jest.useFakeTimers({ now: start });
  const elapsed = () => Date.now() - start;
  const now = () => stateAt(recording.steps, elapsed());
  let mapLoadedAt = 0;
  let lastMap = null;

  SteamAPI.getPresence.mockImplementation(async (ids) => {
    const state = now();
    const presence = new Map();
    for (const id of ids) {
      let raw = null;
      if (id === USER) raw = userAccount(state);
      else if (state.players[id]) raw = account(id, state.players[id]);
      if (raw) {
        presence.set(
          id,
          SteamAPIResponseProcessor.processPresenceResponse(raw),
        );
      }
    }
    return presence;
  });

  SteamAPI.getJoinSnapshot.mockImplementation(async (_userId, friendId) => {
    const state = now();
    const friend = state.players[friendId];
    return {
      user: SteamAPIResponseProcessor.processJoinInfoResponse(
        userAccount(state),
      ),
      friend: friend
        ? SteamAPIResponseProcessor.processJoinInfoResponse(
            account(friendId, friend),
          )
        : null,
    };
  });

  joinManager.setCS2Manager({
    checkUserInCS2: jest.fn().mockResolvedValue(true),
    getGsiUserState: () => {
      const { gsi } = now();
      if (!gsi) return null;
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

  for (const attempt of recording.attempts) {
    await jest.advanceTimersByTimeAsync(attempt.startAt - elapsed());
    startAttempt(attempt);
  }
  const end = Math.max(...recording.attempts.map((attempt) => attempt.endedAt));
  await jest.advanceTimersByTimeAsync(end + SETTLE_MS - elapsed());
}

let openExternal;
let updateDot;

beforeEach(() => {
  jest.clearAllMocks();
  updateDot = jest.fn();
  joinManager.setUICallbacks(updateDot, jest.fn());
  DOMUtils.getElementById.mockImplementation(
    (id) =>
      ({ "steam-id": { value: USER }, auth: { value: AUTH } })[id] || null,
  );
  Validators.extractApiKeyOrToken.mockReturnValue(AUTH);
  openExternal = jest.fn().mockResolvedValue(true);
  global.window.electronAPI = { shell: { openExternal } };
});

afterEach(() => {
  joinManager.resetAll();
  jest.clearAllTimers();
  jest.useRealTimers();
  delete global.window.electronAPI;
});

test.each(RECORDINGS.map((recording) => [recording.name, recording]))(
  "%s: joins as it did, with the same connects",
  async (_name, recording) => {
    await replay(recording);

    for (const attempt of recording.attempts) {
      if (attempt.outcome === "joined") {
        expect(updateDot).toHaveBeenCalledWith(
          joinIdOf(attempt),
          STATUS_TYPES.JOINED,
        );
      } else {
        expect(updateDot).not.toHaveBeenCalledWith(
          joinIdOf(attempt),
          STATUS_TYPES.JOINED,
        );
      }
    }
    // Every connect of that day was needed: one less never joins, one more
    // can find the user's own slot taken
    expect(openExternal.mock.calls.map(([url]) => url)).toEqual(
      recording.connects.map(
        ({ player, connect }) => `steam://rungame/730/${player}/${connect}`,
      ),
    );
  },
);
