// UI and utilities
import {
  API_CONFIG,
  GAME_MODES,
  JOIN_TARGET_PREFIXES,
  STATUS_TYPES,
} from "../shared/constants.js";
import SteamAPI from "../steam/steam-api.js";
import {
  connectKind,
  isJoinToken,
  isMatchOver,
} from "../steam/rich-presence.js";
import logger from "../utils/logger.js";

// Game singletons
import joinJournal from "./join-journal.js";

// The Steam client
import steamLog from "./steam-log.js";
import { joinUrl, openSteamUrl } from "./steam-protocol.js";

/**
 * Statuses of a join attempt that is still running
 */
const ACTIVE_STATUSES = [
  STATUS_TYPES.WAITING,
  STATUS_TYPES.CONNECTING,
  STATUS_TYPES.MISSING,
];

/**
 * Join id of an attempt on any known server playing a map
 * @param {string} map - Map code
 * @returns {string}
 */
export function getMapJoinId(map) {
  return `${JOIN_TARGET_PREFIXES.MAP}${map}`;
}

/**
 * Join id of an attempt on one server
 * @param {string} serverId - Game server Steam ID
 * @returns {string}
 */
export function getServerJoinId(serverId) {
  return `${JOIN_TARGET_PREFIXES.SERVER}${serverId}`;
}

/**
 * Join Manager module
 * Handles the process of joining a friend's game, or a map or server found
 * through other players
 */
class JoinManager {
  constructor() {
    this.joinStates = {};
    this.onUpdateDot = null;
    this.onUpdateJoinButton = null;
    this.cs2Manager = null;
    this.onRequestCS2Launch = null; // Callback for requesting CS2 launch from UI layer
    // Set by configure: the user's Steam ID and token or key
    this.getCredentials = null;
    this.journal = joinJournal;
    this.steamLog = steamLog;
    // Join tokens sent, or taken for the user's own arrival: none goes out
    // twice, from any attempt. CS2 turns a token away for as long as the
    // server stays full, and a player arriving or leaving gives a new one -
    // a replaced token never came back in the journal. Token -> {at, sent}
    this._usedTokens = new Map();
    // When the last connect of any attempt went out
    this._lastSentAt = null;
    // Steam's game log is trusted until a join it should have logged is
    // missing from it. The last attempt that joined waits to be looked up
    // there: {from: its first connect, to: when it joined}
    this._steamLogTrusted = true;
    this._joinToCheck = null;
    // What the journal last heard about the log: "usable", "untrusted" or
    // "missing"
    this._steamLogNoted = null;
  }

  /**
   * Set CS2Manager instance
   * @param {CS2Manager} cs2Manager - CS2Manager instance
   */
  setCS2Manager(cs2Manager) {
    this.cs2Manager = cs2Manager;
  }

  /**
   * Where the credentials come from
   * @param {Object} options
   * @param {() => {steamId: string, auth: string}} options.getCredentials -
   *   The user's Steam ID and API key or token, empty when missing
   */
  configure({ getCredentials }) {
    this.getCredentials = getCredentials;
  }

  /**
   * Whether a join state belongs to an attempt that is still running
   * @param {import('../shared/types.js').JoinState} state - Join state
   * @returns {boolean} - True for a waiting, connecting or missing attempt
   */
  isActive(state) {
    return (
      Boolean(state) &&
      !state.cancelled &&
      ACTIVE_STATUSES.includes(state.status)
    );
  }

  /**
   * Whether a map or server join is running
   * @returns {boolean}
   */
  hasActiveMapJoin() {
    return Object.entries(this.joinStates).some(
      ([id, state]) =>
        (id.startsWith(JOIN_TARGET_PREFIXES.MAP) ||
          id.startsWith(JOIN_TARGET_PREFIXES.SERVER) ||
          id.startsWith(JOIN_TARGET_PREFIXES.MAPS)) &&
        this.isActive(state)
    );
  }

  /**
   * Whether CS2 loaded a map after an attempt first asked it to connect, so
   * recently that Steam may simply not show the user's new server yet
   * @param {import('../shared/types.js').GsiUserState|null} gsiState - The user's game as CS2 reports it
   * @param {number|null} firstConnectAt - When the attempt first asked CS2 to connect
   * @param {number} [now] - Current time
   * @returns {boolean} - True while connects should wait for Steam to confirm
   */
  isAwaitingJoinConfirmation(gsiState, firstConnectAt, now = Date.now()) {
    return Boolean(
      gsiState?.inMatch &&
        firstConnectAt !== null &&
        gsiState.mapLoadedAt >= firstConnectAt &&
        now - gsiState.mapLoadedAt < API_CONFIG.JOIN_GSI_CONFIRM_MS
    );
  }

  /**
   * Start the process of joining a friend's game
   * @param {string} friend_id - Steam ID of the friend to join
   */
  async startJoin(friend_id) {
    return this._startAttempt(friend_id, (user_steam_id, auth) =>
      this.resolveFriendTarget(friend_id, user_steam_id, auth)
    );
  }

  /**
   * Start joining a map - any known official casual server playing it - or
   * one server of it, or any of several maps, through the players known to
   * be there
   * @param {Object} target
   * @param {string} [target.map] - Map code
   * @param {string[]|Function} [target.maps] - Several maps instead, or a
   *   function returning them, read again every iteration
   * @param {string|null} [target.serverId] - One server, null for any
   * @param {string} [target.joinId] - Id of the attempt, when not the map's
   * @param {string|Function} [target.label] - Name shown for the attempt
   * @param {Function} target.getCandidateIds - Players to join through, best
   *   first; read again every iteration so new arrivals count
   * @param {boolean|Function} [target.primeOnly] - Only servers where a
   *   candidate shows a sign of Prime; a function is read every iteration
   * @param {Function} [target.isPrime] - Whether a candidate's presence
   *   shows a sign of Prime, now or before. Prime only needs it, and the
   *   journal notes the count for the server picked.
   * @param {Function} [target.primeCheck] - What the friend check says
   *   about a server, by its id: only noted in the journal for the server
   *   picked, never used to pick it
   */
  async startMapJoin(target) {
    const join_id =
      target.joinId ??
      (target.serverId
        ? getServerJoinId(target.serverId)
        : getMapJoinId(target.map));
    // Named from the start: the join bar shows the attempt before Steam answers
    const label =
      typeof target.label === "function" ? target.label() : target.label;
    return this._startAttempt(
      join_id,
      (user_steam_id, auth) =>
        this.resolveMapTarget(target, user_steam_id, auth),
      label || null
    );
  }

  /**
   * What the loop needs about a friend: one request for both sides
   * @param {string} friend_id - Steam ID of the friend
   * @param {string} user_steam_id - Steam ID of the user
   * @param {string} auth - API key or token
   * @returns {Promise<{user: import('../shared/types.js').PlayerJoinInfo|null, target: import('../shared/types.js').JoinTarget|null}>}
   */
  async resolveFriendTarget(friend_id, user_steam_id, auth) {
    const { user, friend } = await SteamAPI.getJoinSnapshot(
      user_steam_id,
      friend_id,
      auth
    );
    return {
      user,
      target: friend && {
        personaname: friend.personaname,
        inSupportedMode: friend.inSupportedMode,
        connect: friend.connect,
        joinAs: friend_id,
        statusKey: friend.statusKey ?? null,
        isJoined: (userInfo) =>
          Boolean(userInfo.serverId && userInfo.serverId === friend.serverId),
      },
    };
  }

  /**
   * What the loop needs about a map: the user and every candidate in one
   * batch, reduced to the candidates still playing that map on an official
   * server (and on the chosen server, if there is one)
   * @param {Object} target - See startMapJoin
   * @param {string} user_steam_id - Steam ID of the user
   * @param {string} auth - API key or token
   * @returns {Promise<{user: import('../shared/types.js').PlayerPresence|null, target: import('../shared/types.js').JoinTarget|null}>}
   */
  async resolveMapTarget(target, user_steam_id, auth) {
    const candidateIds = target
      .getCandidateIds()
      .map(String)
      .filter((id) => id !== String(user_steam_id));
    const presence = await SteamAPI.getPresence(
      [user_steam_id, ...candidateIds],
      auth
    );

    const user = presence.get(String(user_steam_id)) ?? null;
    if (!user) return { user: null, target: null };

    const maps =
      typeof target.maps === "function"
        ? target.maps()
        : (target.maps ?? [target.map]);
    // Official means a running casual match on one of Valve's servers
    const onMap = candidateIds
      .map((id) => presence.get(id))
      .filter(
        (player) =>
          player?.official &&
          maps.includes(player.map) &&
          (!target.serverId || player.serverId === target.serverId)
      );
    // Candidates showing a sign of Prime, by server, as this very poll has
    // them: one who moved on takes the server's mark along
    const primeOnServer = new Map();
    for (const player of onMap) {
      if (target.isPrime?.(player)) {
        primeOnServer.set(
          player.serverId,
          (primeOnServer.get(player.serverId) ?? 0) + 1
        );
      }
    }
    const primeOnly =
      typeof target.primeOnly === "function"
        ? Boolean(target.primeOnly())
        : Boolean(target.primeOnly);
    const eligible = primeOnly
      ? onMap.filter((player) => primeOnServer.has(player.serverId))
      : onMap;
    // A finished match is about to load another map, and the user's own
    // server is nowhere new. Back in the menu the user is on no server,
    // whatever Steam still shows.
    const gsi = this.cs2Manager?.getGsiUserState?.() ?? null;
    const ownServerId = gsi && !gsi.inMatch ? null : user.serverId;
    const running = eligible.filter((player) => !isMatchOver(player.score));
    const joinable = running.filter(
      (player) => !ownServerId || player.serverId !== ownServerId
    );
    // Servers the user could have landed on through a candidate
    const servers = new Set(running.map((player) => player.serverId));
    // Candidates come best server first, so the first offer is the one to take
    const pick = joinable.find((player) => player.connect) ?? null;

    return {
      user,
      target: {
        personaname:
          (typeof target.label === "function"
            ? target.label()
            : target.label) || null,
        inSupportedMode: joinable.length > 0,
        connect: pick?.connect ?? null,
        joinAs: pick?.steamid ?? null,
        statusKey: pick
          ? `${pick.steamid}\n${pick.statusKey ?? connectKind(pick.connect)}`
          : null,
        prime: target.isPrime
          ? {
              only: primeOnly,
              players: pick ? (primeOnServer.get(pick.serverId) ?? 0) : 0,
              ...(target.primeCheck && {
                check: pick ? (target.primeCheck(pick.serverId) ?? null) : null,
              }),
            }
          : null,
        isJoined: (userInfo) => {
          if (target.serverId) {
            return (
              Boolean(userInfo.serverId) &&
              userInfo.serverId === target.serverId
            );
          }
          // CS2 knows its map and mode at once; Steam keeps showing the old
          // ones for a while after the match ends and the server moves on.
          // The map alone is not enough: a deathmatch on it is not a casual
          // match there.
          const gsiNow = this.cs2Manager?.getGsiUserState?.() ?? null;
          if (gsiNow?.inMatch) {
            return (
              gsiNow.mode === GAME_MODES.CASUAL &&
              maps.includes(gsiNow.mapName) &&
              gsiNow.phase !== "gameover"
            );
          }
          if (!userInfo.serverId) return false;
          // Without CS2's state Steam's final score tells the same: the
          // user is on a server about to load another map, most likely the
          // one they were on when the attempt started
          if (isMatchOver(userInfo.score)) return false;
          // Any server of the map will do - even one whose known players
          // left as the user arrived
          return (
            servers.has(userInfo.serverId) ||
            Boolean(userInfo.official && maps.includes(userInfo.map))
          );
        },
      },
    };
  }

  /**
   * Run one join attempt: make sure CS2 is up, then loop until it joins or ends
   * @param {string} join_id - Friend's Steam ID, or a map or server join id
   * @param {Function} resolveTarget - (user_steam_id, auth) => {user, target}
   * @param {string|null} [personaname] - Name shown until the first answer names it
   * @private
   */
  async _startAttempt(join_id, resolveTarget, personaname = null) {
    let state = null;

    try {
      logger.info("JoinManager", "Starting join", { join_id });

      // First check if user is in CS2
      if (this.cs2Manager) {
        logger.debug("JoinManager", "Checking if user is in CS2");
        const isInCS2 = await this.cs2Manager.checkUserInCS2();
        logger.debug("JoinManager", "User in CS2 check result", { isInCS2 });

        // null means Steam could not be asked. Offering to launch a game that
        // may well be running would be wrong; the loop's failure budget deals
        // with an outage instead.
        if (isInCS2 === false) {
          logger.info("JoinManager", "User not in CS2, requesting launch", {
            join_id,
          });
          // Request CS2 launch from UI layer
          if (this.onRequestCS2Launch) {
            const shouldLaunch = await this.onRequestCS2Launch(join_id);
            logger.debug("JoinManager", "Launch request result", {
              shouldLaunch,
            });
            if (!shouldLaunch) {
              // User cancelled, don't proceed with join
              logger.info(
                "JoinManager",
                "User cancelled launch, aborting join",
                {
                  join_id,
                }
              );
              return;
            }
            // CS2 launch notification will handle waiting for CS2 to start
          }
        } else {
          logger.debug(
            "JoinManager",
            "User already in CS2, proceeding with join"
          );
        }
      }

      // Read once: the loop goes on with the credentials it started with. A
      // credential that changes mid-join resets the attempts itself
      // (AppInputManager.handleAuthInput).
      const { steamId: steam_id, auth } = this.getCredentials?.() ?? {};

      if (!steam_id || !auth) {
        throw new Error("Steam ID and API auth are required");
      }

      // The CS2 check above is a network round trip, during which the
      // button still reads Join - a second click would otherwise start a
      // second loop.
      const existing = this.joinStates[join_id];
      if (existing && !existing.cancelled) {
        logger.info("JoinManager", "Join already in progress", { join_id });
        return;
      }

      state = {
        status: STATUS_TYPES.WAITING,
        cancelled: false,
      };
      if (personaname) state.personaname = personaname;
      this.joinStates[join_id] = state;
      this.journal.attemptStarted(join_id);

      if (this.onUpdateJoinButton)
        this.onUpdateJoinButton(join_id, STATUS_TYPES.WAITING);
      if (this.onUpdateDot) this.onUpdateDot(join_id, STATUS_TYPES.WAITING);

      // Start the join loop
      await this.joinLoop(join_id, state, steam_id, auth, resolveTarget);
    } catch (error) {
      logger.error("JoinManager", "Starting the join failed", {
        join_id,
        error: error.message,
      });
      // Only this attempt's own state - an error before it existed must not
      // cancel an attempt that is already running for the friend
      if (state && this.joinStates[join_id] === state) {
        this.cancelJoin(join_id, "error");
      }
    }
  }

  /**
   * The main loop for joining a friend's game, or a map or server
   * @param {string} join_id - Friend's Steam ID, or a map or server join id
   * @param {import('../shared/types.js').JoinState} state - State of this attempt
   * @param {string} user_steam_id - Steam ID of the user
   * @param {string} auth - API key or token for Steam API
   * @param {Function} [resolveTarget] - (user_steam_id, auth) => {user, target};
   *   joins the friend `join_id` when left out
   */
  async joinLoop(
    join_id,
    state,
    user_steam_id,
    auth,
    resolveTarget = (userId, apiAuth) =>
      this.resolveFriendTarget(join_id, userId, apiAuth)
  ) {
    // The loop only ever acts for its own attempt. A cancel, a reset or a newer
    // attempt for the same target all end it, and any of them can land while a
    // request is out - so this is checked after every await, before the loop
    // touches the state, the UI or the game.
    const alive = () => this.joinStates[join_id] === state && !state.cancelled;

    let missingSince = null;
    let failingSince = null;
    // When this attempt started, and when it first asked CS2 to connect
    const startedAt = Date.now();
    let firstConnectAt = null;
    // The server Steam showed for the user while CS2 had them out of a match
    // and this attempt had not connected yet: the one they just left
    let leftServerId = null;
    // Every player this attempt has watched: the connect they show, since
    // when, and what they showed before (see _watch)
    const watched = new Map();
    // Connects without a join token this attempt has sent; a token is
    // remembered for every attempt (_usedTokens)
    const sentHere = new Map();
    // Facts of the last snapshot written to the journal
    let journaled = null;

    // Counts a failed iteration; true once the budget is spent and the attempt
    // has been cancelled
    const giveUpAfterFailure = () => {
      if (!failingSince) {
        failingSince = Date.now();
        this.journal.record("no-answer", { join: join_id });
      }
      if (Date.now() - failingSince <= API_CONFIG.MISSING_TIMEOUT_MS) {
        return false;
      }
      logger.info("JoinManager", "Giving up after repeated errors", {
        join_id,
      });
      this.cancelJoin(join_id, "no-answer");
      return true;
    };

    while (alive()) {
      try {
        // One batch per iteration - every decision below reads this snapshot
        const { user, target } = await resolveTarget(user_steam_id, auth);
        if (!alive()) break;

        // Steam could not be asked. Unknown is not a reason to cancel, but a
        // lasting outage (expired token, network down) spends the budget.
        if (!user || !target) {
          if (giveUpAfterFailure()) break;
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }
        failingSince = null;
        journaled = this._journalSnapshot(join_id, user, target, journaled);
        this._watch(watched, target, startedAt);

        // CS2 reports the user's own game the moment it changes, while
        // Steam's copy of it lags by seconds - a fresh GSI state wins
        const gsiState = this.cs2Manager?.getGsiUserState?.() ?? null;
        const userInCS2 = gsiState ? true : user.inCS2;
        const userInProtectedMatch = this._inProtectedMatch(user, gsiState);

        if (!userInCS2) {
          logger.info("JoinManager", "User no longer in CS2, stopping join", {
            join_id,
          });
          this.cancelJoin(join_id, "left-cs2");
          break;
        }

        // Only casual, deathmatch and training may be left for the join;
        // Competitive, Premier, Wingman and the rest never are
        if (userInProtectedMatch) {
          logger.info(
            "JoinManager",
            "User is in a match not to leave, stopping join",
            { join_id }
          );
          this.cancelJoin(join_id, "protected-match");
          break;
        }

        // Steam keeps showing a server for seconds after the user leaves it,
        // so a server it shows while CS2 has the user in the menu counts only
        // once CS2 has a map loaded again
        if (gsiState && !gsiState.inMatch && firstConnectAt === null) {
          leftServerId = user.serverId ?? null;
        } else if (user.serverId !== leftServerId) {
          // Steam has caught up; whatever it shows from now on is current
          leftServerId = null;
        }
        const onLeftServer =
          leftServerId !== null &&
          user.serverId === leftServerId &&
          !gsiState?.inMatch;

        // Checked before connecting, so a game that is already where it
        // should be never gets another connect
        if (!onLeftServer && target.isJoined(user)) {
          this.updateJoinState(join_id, { status: STATUS_TYPES.JOINED });
          this.journal.attemptEnded(join_id, "joined");
          // Steam's game log should hold this join, logged between the first
          // connect and now; the next time the loop asks it, it looks
          if (firstConnectAt !== null) {
            this._joinToCheck = { from: firstConnectAt, to: Date.now() };
          }

          // Stop all other join loops
          this.cancelAllExcept(join_id);

          // Keep the green status for a bit before resetting
          await this.sleep(API_CONFIG.JOIN_SUCCESS_DISPLAY_MS);
          if (alive()) this.cancelJoin(join_id);
          break;
        }

        const personaname = target.personaname || state.personaname;

        if (!target.inSupportedMode) {
          // Nothing to join right now (friend out of a supported mode, or no
          // known player left on the map) - mark as "missing"
          if (!missingSince) missingSince = Date.now();
          this.updateJoinState(join_id, {
            status: STATUS_TYPES.MISSING,
            personaname,
          });

          // If missing for more than timeout, cancel
          if (Date.now() - missingSince > API_CONFIG.MISSING_TIMEOUT_MS) {
            this.cancelJoin(join_id, "missing");
            break;
          }

          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }

        // Target is back in supported mode - reset the timer
        missingSince = null;

        // CS2 has loaded a map since this attempt asked it to connect, so it
        // is most likely where it should be and Steam just does not show it
        // yet. More connects would only reach a game that is already there,
        // so hold them until Steam confirms or the grace ends.
        if (this.isAwaitingJoinConfirmation(gsiState, firstConnectAt)) {
          this.updateJoinState(join_id, {
            status: STATUS_TYPES.CONNECTING,
            personaname,
          });
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }

        if (!target.connect) {
          this.updateJoinState(join_id, {
            status: STATUS_TYPES.WAITING,
            personaname,
          });
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }

        // This connect has gone out already, from this attempt or another,
        // or was taken for the user's own arrival. CS2 turns a token away for
        // as long as the server stays full, and someone arriving or leaving
        // gives the player a new one, so the loop waits for that. Once CS2
        // has had the time to load a map for it and has not, it was turned
        // away, and the user reads that the attempt waits for a slot.
        const used = this._usedConnect(target.connect, sentHere);
        if (used) {
          const mapLoadedSince = Boolean(
            gsiState?.inMatch && gsiState.mapLoadedAt >= used.at
          );
          const turnedAway =
            !mapLoadedSince &&
            Date.now() - used.at >= API_CONFIG.JOIN_LOAD_WINDOW_MS;
          this.updateJoinState(join_id, {
            status: turnedAway ? STATUS_TYPES.WAITING : STATUS_TYPES.CONNECTING,
            personaname,
          });
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }

        // A new token: someone arrived or left. It may be the user, whose
        // own arrival renews the token of every player on the server - a
        // connect then would only run into the user's own slot.
        const seen = watched.get(target.joinAs);
        const ownArrival = await this._isOwnArrival(seen);
        if (!alive()) break;
        // Another attempt may have sent it meanwhile - a server and its map
        // joined at once through the same player
        if (this._usedConnect(target.connect, sentHere)) {
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }
        if (ownArrival) {
          this._useConnect(target.connect, sentHere, false);
          this.journal.record("skip", {
            join: join_id,
            joinAs: target.joinAs,
            connect: target.connect,
            why: "own-arrival",
          });
          this.updateJoinState(join_id, {
            status: STATUS_TYPES.CONNECTING,
            personaname,
          });
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }

        // We have connect info, try to join
        this.updateJoinState(join_id, {
          status: STATUS_TYPES.CONNECTING,
          personaname,
        });

        // Attempt to join via Steam protocol through main process
        const why = this._connectReason(seen, firstConnectAt);
        if (firstConnectAt === null) firstConnectAt = Date.now();
        this._useConnect(target.connect, sentHere, true);
        this.journal.record("connect", {
          join: join_id,
          joinAs: target.joinAs,
          connect: target.connect,
          why,
          // If the user lands in a match without Prime, this says what the
          // server showed when the connect went out
          ...(target.prime ? { prime: target.prime } : {}),
        });
        await openSteamUrl(joinUrl(target.joinAs, target.connect));

        // Give the game a moment to act on this attempt before the next one
        await this.sleep(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      } catch (error) {
        logger.error("JoinManager", "Join loop iteration failed", {
          join_id,
          user_steam_id,
          error: error.message,
        });

        if (!alive() || giveUpAfterFailure()) break;
        await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
      }
    }
  }

  /**
   * Update join state for a friend
   * @param {string} friend_id - Steam ID of the friend
   * @param {Partial<import('../shared/types.js').JoinState>} updates - State updates
   */
  updateJoinState(friend_id, updates) {
    const state = this.joinStates[friend_id];
    if (!state) return;

    const previousStatus = state.status;
    const previousName = state.personaname ?? null;
    Object.assign(state, updates);

    // Notify at once on every change the UI shows: the status, which the row
    // and the join bar draw, and the name the bar is titled with - a
    // pinned-maps attempt is named after the pins, which change mid-join.
    // Nothing else repaints a running attempt; the rows a refresh re-renders
    // are built from the join states.
    const statusChanged =
      updates.status !== undefined && updates.status !== previousStatus;
    const nameChanged =
      "personaname" in updates &&
      (updates.personaname ?? null) !== previousName;
    if (statusChanged || nameChanged) {
      if (this.onUpdateDot) this.onUpdateDot(friend_id, state.status);
      if (this.onUpdateJoinButton)
        this.onUpdateJoinButton(friend_id, state.status);
    }
  }

  /**
   * Cancel an ongoing join attempt
   * @param {string} friend_id - Steam ID of the friend whose join attempt to cancel
   * @param {string} [reason] - Why, for the join journal
   */
  cancelJoin(friend_id, reason = "cancelled") {
    const state = this.joinStates[friend_id];
    if (!state) return;

    this.journal.attemptEnded(friend_id, reason);
    // updateJoinState pushes the CANCELLED status to the UI
    this.updateJoinState(friend_id, {
      status: STATUS_TYPES.CANCELLED,
      cancelled: true,
    });
  }

  /**
   * Cancel all join attempts except specified friend
   * @param {string} exceptFriendId - Friend ID to exclude from cancellation
   */
  cancelAllExcept(exceptFriendId) {
    Object.keys(this.joinStates).forEach((friendId) => {
      if (friendId !== exceptFriendId) {
        this.cancelJoin(friendId, "other-joined");
      }
    });
  }

  /**
   * Get the current join states for all tracked friends
   * @returns {Object} - Copy of the joinStates object
   */
  getJoinStates() {
    return { ...this.joinStates };
  }

  /**
   * Reset all join states and stop all join loops. Another account or
   * credential starts over: no token counts as sent.
   */
  resetAll() {
    Object.keys(this.joinStates).forEach((friendId) => {
      delete this.joinStates[friendId];
      this.journal.attemptEnded(friendId, "reset");

      // The loops notice the missing state and stop without touching the UI,
      // so reset it here - otherwise a dead attempt keeps showing Cancel
      if (this.onUpdateDot) this.onUpdateDot(friendId, STATUS_TYPES.CANCELLED);
      if (this.onUpdateJoinButton)
        this.onUpdateJoinButton(friendId, STATUS_TYPES.CANCELLED);
    });
    this._usedTokens.clear();
    this._lastSentAt = null;
    this._steamLogTrusted = true;
    this._joinToCheck = null;
    this._steamLogNoted = null;
  }

  /**
   * Follow what a player shows. A connect that differs from the last one
   * seen starts a new entry: the connect, when it showed, and since when the
   * one before it showed - the attempt's start for a player not watched
   * before, `previous` undefined for one, null after no connect.
   * @param {Map<string, Object>} watched - The attempt's players
   * @param {import('../shared/types.js').JoinTarget} target - This snapshot's target
   * @param {number} startedAt - When the attempt started
   * @private
   */
  _watch(watched, target, startedAt) {
    if (!target.joinAs) return;
    const connect = target.connect ?? null;
    const last = watched.get(target.joinAs);
    if (last && last.connect === connect) return;
    watched.set(target.joinAs, {
      connect,
      since: Date.now(),
      before: last ? last.since : startedAt,
      previous: last ? last.connect : undefined,
    });
  }

  /**
   * A connect that went out already, or was taken for the user's own arrival
   * @param {string} connect - Connect string
   * @param {Map<string, Object>} sentHere - The attempt's connects without a token
   * @returns {{at: number, sent: boolean}|null} - When, or null for a new one
   * @private
   */
  _usedConnect(connect, sentHere) {
    const used = isJoinToken(connect)
      ? this._usedTokens.get(connect)
      : sentHere.get(connect);
    return used ?? null;
  }

  /**
   * Remember a connect so it never goes out again
   * @param {string} connect - Connect string
   * @param {Map<string, Object>} sentHere - The attempt's connects without a token
   * @param {boolean} sent - Sent, rather than taken for the user's own arrival
   * @private
   */
  _useConnect(connect, sentHere, sent) {
    const at = Date.now();
    if (sent) this._lastSentAt = at;
    if (!isJoinToken(connect)) {
      sentHere.set(connect, { at, sent });
      return;
    }
    this._usedTokens.set(connect, { at, sent });
    if (this._usedTokens.size > API_CONFIG.JOIN_USED_TOKENS_MAX) {
      this._usedTokens.delete(this._usedTokens.keys().next().value);
    }
  }

  /**
   * Whether a player's new token is the user's own arrival. That arrival
   * renews the token of every player on the server, and Steam logs CS2's
   * change of server first: in the joins of 2026-11-05 0-3 s after each
   * accepted connect, before the token changed. Only the first change of a
   * player after the last connect can be it. Without Steam's log, or with
   * one that missed a join, every new token counts as someone else's.
   * @param {Object|undefined} seen - The player's entry (see _watch)
   * @returns {Promise<boolean>}
   * @private
   */
  async _isOwnArrival(seen) {
    const sentAt = this._lastSentAt;
    if (sentAt === null || !seen || seen.before > sentAt) return false;
    try {
      if (this._joinToCheck !== null) {
        const { from, to } = this._joinToCheck;
        const check = await this.steamLog.serverChangesSince(from);
        this._joinToCheck = null;
        if (check.usable) {
          this._steamLogTrusted = check.changes.some((at) => at <= to);
        }
      }
      const { usable, changes } =
        await this.steamLog.serverChangesSince(sentAt);
      this._noteSteamLog(
        !usable ? "missing" : this._steamLogTrusted ? "usable" : "untrusted"
      );
      if (!usable || !this._steamLogTrusted) return false;
      return changes.some((at) => at <= seen.since);
    } catch (error) {
      logger.warn("JoinManager", "Could not read Steam's game log", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Note in the join journal what Steam's game log is good for, when that
   * changes
   * @param {string} state - "usable", "untrusted" or "missing"
   * @private
   */
  _noteSteamLog(state) {
    if (state === this._steamLogNoted) return;
    this._steamLogNoted = state;
    this.journal.record("steam-log", { state });
  }

  /**
   * Why a connect goes out, for the join journal: "start" for the connect a
   * player showed when the attempt started (or when it first saw them,
   * before any connect of its own), "link" for one that showed up after
   * none, "token" for a new token in place of another, "player" for a
   * player the attempt turned to after connecting through someone else
   * @param {Object|undefined} seen - The player's entry (see _watch)
   * @param {number|null} firstConnectAt - The attempt's first connect, if any
   * @returns {string}
   * @private
   */
  _connectReason(seen, firstConnectAt) {
    if (!seen || seen.previous === undefined) {
      return firstConnectAt === null ? "start" : "player";
    }
    return seen.previous === null ? "link" : "token";
  }

  /**
   * Whether the user is in a match a join must not pull them out of. CS2
   * tells the mode the moment it changes; only Steam tells offline training
   * apart, and its copy lags, so it counts only while it shows the map and
   * mode CS2 is on - a match just found after training is not training.
   * @param {import('../shared/types.js').PlayerJoinInfo} user - Steam's copy of the user
   * @param {import('../shared/types.js').GsiUserState|null} gsiState - CS2's fresh state, if any
   * @returns {boolean}
   * @private
   */
  _inProtectedMatch(user, gsiState) {
    if (!gsiState) return Boolean(user.inProtectedMatch);
    if (!gsiState.inProtectedMatch) return false;
    const training =
      Boolean(user.offlineGame) &&
      user.offlineGame.map === gsiState.mapName &&
      user.offlineGame.mode === gsiState.mode;
    return !training;
  }

  /**
   * Note in the join journal whatever changed since the attempt's last
   * snapshot
   * @param {string} join_id - Attempt the snapshot belongs to
   * @param {import('../shared/types.js').PlayerJoinInfo} user - The user
   * @param {import('../shared/types.js').JoinTarget} target - Who to join
   * @param {Object|null} previous - What this returned for the last snapshot
   * @returns {Object} - Facts to compare the next snapshot with
   * @private
   */
  _journalSnapshot(join_id, user, target, previous) {
    const facts = {
      userInCS2: user.inCS2 ?? null,
      userServer: user.serverId ?? null,
      targetSupported: target.inSupportedMode ?? null,
      joinAs: target.joinAs ?? null,
      connect: target.connect ?? null,
      status: target.statusKey ?? null,
    };
    const changed = Object.keys(facts).filter(
      (key) => !previous || facts[key] !== previous[key]
    );
    if (changed.length) {
      const data = { join: join_id };
      for (const key of changed) data[key] = facts[key];
      this.journal.record("snapshot", data);
    }
    return facts;
  }

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set UI update callbacks
   * @param {Function} onUpdateDot - Callback for updating status dot
   * @param {Function} onUpdateJoinButton - Callback for updating join button
   */
  setUICallbacks(onUpdateDot, onUpdateJoinButton) {
    this.onUpdateDot = onUpdateDot;
    this.onUpdateJoinButton = onUpdateJoinButton;
  }

  /**
   * Set CS2 launch request callback
   * @param {Function} onRequestCS2Launch - Callback for requesting CS2 launch (returns Promise<boolean>)
   */
  setCS2LaunchCallback(onRequestCS2Launch) {
    this.onRequestCS2Launch = onRequestCS2Launch;
  }
}

// Create singleton instance
const joinManager = new JoinManager();

export default joinManager;
