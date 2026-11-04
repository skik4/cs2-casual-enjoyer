// UI and utilities
import {
  API_CONFIG,
  GAME_MODES,
  JOIN_TARGET_PREFIXES,
  STATUS_TYPES,
} from "../shared/constants.js";
import SteamAPI from "../steam/steam-api.js";
import { connectKind, isMatchOver } from "../steam/rich-presence.js";
import logger from "../utils/logger.js";

// Game singletons
import joinJournal from "./join-journal.js";

// The Steam client
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
    // Connect string -> the attempt that sent it, so two attempts going
    // through the same player send it once
    this._sentConnects = new Map();
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
    // A finished match is about to load another map, and the user's own
    // server is nowhere new. Back in the menu the user is on no server,
    // whatever Steam still shows.
    const gsi = this.cs2Manager?.getGsiUserState?.() ?? null;
    const ownServerId = gsi && !gsi.inMatch ? null : user.serverId;
    const running = onMap.filter(
      (player) => !isMatchOver(player.score)
    );
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
          (typeof target.label === "function" ? target.label() : target.label) ||
          null,
        inSupportedMode: joinable.length > 0,
        connect: pick?.connect ?? null,
        joinAs: pick?.steamid ?? null,
        statusKey: pick
          ? `${pick.steamid}\n${pick.statusKey ?? connectKind(pick.connect)}`
          : null,
        isJoined: (userInfo) => {
          if (target.serverId) {
            return Boolean(userInfo.serverId) && userInfo.serverId === target.serverId;
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
              logger.info("JoinManager", "User cancelled launch, aborting join", {
                join_id,
              });
              return;
            }
            // CS2 launch notification will handle waiting for CS2 to start
          }
        } else {
          logger.debug("JoinManager", "User already in CS2, proceeding with join");
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
    const alive = () =>
      this.joinStates[join_id] === state && !state.cancelled;

    let missingSince = null;
    let failingSince = null;
    // When this attempt first asked CS2 to connect
    let firstConnectAt = null;
    // The server Steam showed for the user while CS2 had them out of a match
    // and this attempt had not connected yet: the one they just left
    let leftServerId = null;
    // What Steam showed about the target when the last connect went out, until
    // it shows something else. A connect on the same status would only be
    // turned away again or - while CS2 is still connecting - run after the
    // join as a second connect, so the next one waits for a new status.
    let connectedOn = null;
    // When the connect on connectedOn went out
    let connectedAt = null;
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
      logger.info("JoinManager", "Giving up after repeated errors", { join_id });
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

        // Any change in what Steam shows about the target makes the next
        // connect worth sending, even one that changes back
        const targetStatus =
          target.statusKey ?? connectKind(target.connect);
        if (connectedOn !== null && targetStatus !== connectedOn) {
          connectedOn = null;
        }

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

        // The last connect went out on this very status: CS2 is connecting
        // or was turned away, and nothing says another one would do better.
        // Once CS2 has had the time to load a map for it and has not, it was
        // turned away, so the user reads that the attempt waits for a slot.
        if (connectedOn !== null) {
          const mapLoadedSince = Boolean(
            gsiState?.inMatch && gsiState.mapLoadedAt >= connectedAt
          );
          const turnedAway =
            !mapLoadedSince &&
            Date.now() - connectedAt >= API_CONFIG.JOIN_LOAD_WINDOW_MS;
          this.updateJoinState(join_id, {
            status: turnedAway ? STATUS_TYPES.WAITING : STATUS_TYPES.CONNECTING,
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

        // Another running attempt has just sent this very connect - a server
        // and its map joined at once through the same player. A second one
        // would only be turned away.
        const sender = this._sentConnects.get(target.connect);
        if (sender && sender !== join_id && this.isActive(this.joinStates[sender])) {
          connectedOn = targetStatus;
          connectedAt = Date.now();
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }

        // Attempt to join via Steam protocol through main process
        if (firstConnectAt === null) firstConnectAt = Date.now();
        connectedOn = targetStatus;
        connectedAt = Date.now();
        this._sentConnects.set(target.connect, join_id);
        this.journal.record("connect", {
          join: join_id,
          joinAs: target.joinAs,
          connect: target.connect,
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

    this._forgetConnects(friend_id);
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
   * Reset all join states and stop all join loops
   */
  resetAll() {
    Object.keys(this.joinStates).forEach((friendId) => {
      delete this.joinStates[friendId];
      this._forgetConnects(friendId);
      this.journal.attemptEnded(friendId, "reset");

      // The loops notice the missing state and stop without touching the UI,
      // so reset it here - otherwise a dead attempt keeps showing Cancel
      if (this.onUpdateDot) this.onUpdateDot(friendId, STATUS_TYPES.CANCELLED);
      if (this.onUpdateJoinButton)
        this.onUpdateJoinButton(friendId, STATUS_TYPES.CANCELLED);
    });
  }

  /**
   * Drop the connects an attempt sent, once it is over
   * @param {string} join_id - The attempt
   * @private
   */
  _forgetConnects(join_id) {
    for (const [connect, sender] of this._sentConnects) {
      if (sender === join_id) this._sentConnects.delete(connect);
    }
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
