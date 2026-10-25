// UI and utilities
import {
  API_CONFIG,
  JOIN_TARGET_PREFIXES,
  STATUS_TYPES,
} from "../shared/constants.js";
import SteamAPI from "../steam/steam-api.js";
import Validators from "../utils/validators.js";
import ErrorHandler from "../utils/error-handler.js";
import DOMUtils from "../utils/dom-utils.js";

// Game singletons
import joinJournal from "./join-journal.js";

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
    this.journal = joinJournal;
  }

  /**
   * Set CS2Manager instance
   * @param {CS2Manager} cs2Manager - CS2Manager instance
   */
  setCS2Manager(cs2Manager) {
    this.cs2Manager = cs2Manager;
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
   * one server of it, through the players known to be there
   * @param {Object} target
   * @param {string} target.map - Map code
   * @param {string|null} [target.serverId] - One server, null for any
   * @param {string} [target.label] - Name shown for the attempt
   * @param {Function} target.getCandidateIds - Players to join through, best
   *   first; read again every iteration so new arrivals count
   */
  async startMapJoin(target) {
    const join_id = target.serverId
      ? getServerJoinId(target.serverId)
      : getMapJoinId(target.map);
    return this._startAttempt(join_id, (user_steam_id, auth) =>
      this.resolveMapTarget(target, user_steam_id, auth)
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

    // Official means a running casual match on one of Valve's servers
    const onMap = candidateIds
      .map((id) => presence.get(id))
      .filter(
        (player) =>
          player?.official &&
          player.map === target.map &&
          (!target.serverId || player.serverId === target.serverId)
      );
    const servers = new Set(onMap.map((player) => player.serverId));
    // Candidates come best server first, so the first offer is the one to take
    const pick = onMap.find((player) => player.connect) ?? null;

    return {
      user,
      target: {
        personaname: target.label || null,
        inSupportedMode: onMap.length > 0,
        connect: pick?.connect ?? null,
        joinAs: pick?.steamid ?? null,
        statusKey: pick ? `${pick.steamid}\n${pick.statusKey ?? pick.connect}` : null,
        isJoined: (userInfo) => {
          if (!userInfo.serverId) return false;
          if (target.serverId) return userInfo.serverId === target.serverId;
          // Any server of the map will do - even one whose known players
          // left as the user arrived
          return (
            servers.has(userInfo.serverId) ||
            Boolean(userInfo.official && userInfo.map === target.map)
          );
        },
      },
    };
  }

  /**
   * Run one join attempt: make sure CS2 is up, then loop until it joins or ends
   * @param {string} join_id - Friend's Steam ID, or a map or server join id
   * @param {Function} resolveTarget - (user_steam_id, auth) => {user, target}
   * @private
   */
  async _startAttempt(join_id, resolveTarget) {
    let state = null;

    try {
      console.log("JoinManager: Starting join for:", join_id);

      // First check if user is in CS2
      if (this.cs2Manager) {
        console.log("JoinManager: Checking if user is in CS2...");
        const isInCS2 = await this.cs2Manager.checkUserInCS2();
        console.log("JoinManager: User in CS2 check result:", isInCS2);

        // null means Steam could not be asked. Offering to launch a game that
        // may well be running would be wrong; the loop's failure budget deals
        // with an outage instead.
        if (isInCS2 === false) {
          console.log("JoinManager: User not in CS2, requesting launch...");
          // Request CS2 launch from UI layer
          if (this.onRequestCS2Launch) {
            const shouldLaunch = await this.onRequestCS2Launch(join_id);
            console.log("JoinManager: Launch request result:", shouldLaunch);
            if (!shouldLaunch) {
              // User cancelled, don't proceed with join
              console.log("JoinManager: User cancelled launch, aborting join");
              return;
            }
            // CS2 launch notification will handle waiting for CS2 to start
          }
        } else {
          console.log(
            "JoinManager: User already in CS2, proceeding with join..."
          );
        }
      }

      const steamIdInput = DOMUtils.getElementById("steam-id");
      const authInput = DOMUtils.getElementById("auth");

      if (!steamIdInput || !authInput) {
        throw new Error("Required input elements not found");
      }

      const steam_id = steamIdInput.value.trim();
      const auth_raw = authInput.value.trim();
      const auth = Validators.extractApiKeyOrToken(auth_raw);

      if (!steam_id || !auth) {
        throw new Error("Steam ID and API auth are required");
      }

      // The CS2 check above is a network round trip, during which the
      // button still reads Join - a second click would otherwise start a
      // second loop and orphan the first interval.
      const existing = this.joinStates[join_id];
      if (existing && !existing.cancelled) {
        console.log("JoinManager: Join already in progress for:", join_id);
        return;
      }
      if (existing?.interval) clearInterval(existing.interval);

      state = {
        status: STATUS_TYPES.WAITING,
        cancelled: false,
        interval: null,
      };
      this.joinStates[join_id] = state;
      this.journal.attemptStarted(join_id);

      if (this.onUpdateJoinButton)
        this.onUpdateJoinButton(join_id, STATUS_TYPES.WAITING);
      if (this.onUpdateDot) this.onUpdateDot(join_id, STATUS_TYPES.WAITING);

      // Periodic UI re-assert. Closes over its own state and timer id so it
      // always clears itself, never whichever id the current state holds.
      const ownState = state;
      ownState.interval = setInterval(() => {
        if (this.joinStates[join_id] !== ownState) {
          clearInterval(ownState.interval);
          return;
        }

        if (this.onUpdateDot) this.onUpdateDot(join_id, ownState.status);
        if (this.onUpdateJoinButton)
          this.onUpdateJoinButton(join_id, ownState.status);

        if (
          ownState.status === STATUS_TYPES.JOINED ||
          ownState.status === STATUS_TYPES.CANCELLED
        ) {
          clearInterval(ownState.interval);
        }
      }, 1000);

      // Start the join loop
      await this.joinLoop(join_id, state, steam_id, auth, resolveTarget);
    } catch (error) {
      ErrorHandler.logError("JoinManager.startJoin", error, { join_id });
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
    // What Steam showed about the target when the last connect went out, until
    // it shows something else. A connect on the same status would only be
    // turned away again or - while CS2 is still connecting - run after the
    // join as a second connect, so the next one waits for a new status.
    let connectedOn = null;
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
      console.log(
        "JoinManager: Giving up after repeated errors for:",
        join_id
      );
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
        const targetStatus = target.statusKey ?? target.connect ?? null;
        if (connectedOn !== null && targetStatus !== connectedOn) {
          connectedOn = null;
        }

        // CS2 reports the user's own game the moment it changes, while
        // Steam's copy of it lags by seconds - a fresh GSI state wins
        const gsiState = this.cs2Manager?.getGsiUserState?.() ?? null;
        const userInCS2 = gsiState ? true : user.inCS2;
        const userInCompetitiveOrPremier = gsiState
          ? gsiState.inCompetitiveOrPremier
          : user.inCompetitiveOrPremier;

        if (!userInCS2) {
          console.log(
            "JoinManager: User no longer in CS2, stopping join process for:",
            join_id
          );
          this.cancelJoin(join_id, "left-cs2");
          break;
        }

        if (userInCompetitiveOrPremier) {
          console.log(
            "JoinManager: User is in Competitive/Premier mode, stopping join process for:",
            join_id
          );
          this.cancelJoin(join_id, "competitive");
          break;
        }

        // Checked before connecting, so a game that is already where it
        // should be never gets another connect
        if (target.isJoined(user)) {
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

        // We have connect info, try to join
        this.updateJoinState(join_id, {
          status: STATUS_TYPES.CONNECTING,
          personaname,
        });

        // The last connect went out on this very status: CS2 is connecting
        // or was turned away, and nothing says another one would do better
        if (connectedOn !== null) {
          await this.sleep(API_CONFIG.JOIN_LOOP_INTERVAL_MS);
          continue;
        }

        // Attempt to join via Steam protocol through main process
        if (firstConnectAt === null) firstConnectAt = Date.now();
        connectedOn = targetStatus;
        this.journal.record("connect", {
          join: join_id,
          joinAs: target.joinAs,
          connect: target.connect,
        });
        const url = `steam://rungame/730/${target.joinAs}/${target.connect}`;
        if (window.electronAPI?.shell?.openExternal) {
          await window.electronAPI.shell.openExternal(url);
        } else {
          window.open(url, "_self");
        }

        // Give the game a moment to act on this attempt before the next one
        await this.sleep(API_CONFIG.JOIN_RETRY_INTERVAL_MS);
      } catch (error) {
        ErrorHandler.logError("JoinManager.joinLoop", error, {
          join_id,
          user_steam_id,
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
    Object.assign(state, updates);

    // Notify immediately. Without this the UI only catches up on the next
    // 1s tick, so CONNECTING is never drawn and JOINED can be missed
    // entirely inside its 1.5s display window.
    if (updates.status !== undefined && updates.status !== previousStatus) {
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

    if (state.interval) {
      clearInterval(state.interval);
    }
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
      const state = this.joinStates[friendId];
      if (state?.interval) {
        clearInterval(state.interval);
      }
      delete this.joinStates[friendId];
      this.journal.attemptEnded(friendId, "reset");

      // The loops notice the missing state and stop without touching the UI,
      // so reset it here - otherwise a dead attempt keeps showing Cancel
      if (this.onUpdateDot) this.onUpdateDot(friendId, STATUS_TYPES.CANCELLED);
      if (this.onUpdateJoinButton)
        this.onUpdateJoinButton(friendId, STATUS_TYPES.CANCELLED);
    });
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
