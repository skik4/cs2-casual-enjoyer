# 03. Joining

This part specifies join attempts: how one starts, the loop that watches Steam and sends CS2 to a free slot, how an attempt ends, what the user sees meanwhile, and the journal it writes. It describes version 0.9.7 (commit `4f1b311`). That is the behaviour 1.0 must keep, unless the last section says otherwise.

How to read it:

- Rules are requirements, whatever the platform. "Current:" names the 0.9.7 mechanism, as evidence and to trace the rule.
- `path:line` references point into the 0.9.7 repository.
- Tests are cited by file name without `__tests__/` and `.test.js`, with the test's name in quotes. The names state intended behaviour.
- "Measured" facts come from the join journal, from Steam's own logs, or from CS2's console log, which the owner enabled on their own PC for research only. Each carries its date. "Owner's decision" marks what the owner decided, with its date.
- Where earlier session notes and the code differ, the code wins, and the difference is noted.
- Related parts:
  - [01](01-overview.md): glossary and decisions log;
  - [04](04-maps.md): the map finder and keeper, which hand map joins their players;
  - [05](05-cs2-gsi-and-local-steam.md): Steam's game log, GSI, and whether CS2 is open;
  - [06](06-steam-web-api.md): requests, batching, cache and timeouts;
  - [07](07-ui-shell-security-and-updates.md): the shell, the link allow-list and the look.

## 1. Terms

| Target                 | Join id                               | Started by                                                |
| ---------------------- | ------------------------------------- | --------------------------------------------------------- |
| Friend, or fake friend | the player's SteamID64                | Join on a row of Friends or Fake Friends                  |
| Map                    | `map-<map code>`, e.g. `map-de_dust2` | Join on a map row in Maps                                 |
| Server                 | `srv-<game server Steam ID>`          | Join on a server row of an expanded map                   |
| Pinned maps            | `maps-pinned`                         | Join on the "Any pinned map" row, or the keeper by itself |

- Map, server and pinned join ids must never look like a SteamID64 (`src/game/join-manager.js:38-49`, `src/shared/constants.js:107-119`; map: "build ids that never look like a SteamID64"). Other parts tell a friend attempt from the rest by that alone (`src/core/app-friends-manager.js:212-213`).
- **Connect string**: the `connect` value of a player's rich presence. Only a validated one is ever used (section 12).
- **Join token**: a connect string that is `+gcconnect` followed by hex digits only (`isJoinToken`, `src/steam/rich-presence.js:104-114`). In CS2 today it is three groups of 8 hex digits: a token, the player's own account id, a second token (client.dll format `+gcconnect%08X%08X%08X`). In all 181 sightings the middle group was the player's account id, and in all 67 changes both other groups changed together (measured 2026-11-06). Lobby connects (`+gcconnectG…`) and local-server connects (`+gcconnectL…`) carry no token.
- **Link**: whether a player shows a connect at all. "A link appears" means a connect where the player showed none.
- **Snapshot**: the one Steam answer an iteration of the loop reads, about the user and the target (section 4.1).
- **Attempt state**: `{status, cancelled, personaname?}` in memory, by join id (`src/shared/types.js:21-25`). Nothing about attempts is saved; a restart ends them all.
- **Running**: status waiting, connecting or missing, and not cancelled (`isActive`, `src/game/join-manager.js:27-31`, `:109-115`).
- **Used tokens**: the tokens sent, or skipped as the user's own arrival, shared by all attempts (section 5).

## 2. Starting an attempt

**What the user sees and can do**

- Join on a friend or fake-friend row, on a map row, on a server row, or on the pinned row. While the attempt runs, the same button reads Cancel, and the join bar above the tabs shows it (section 11).
- A row where the user already is, or whose match has ended, shows Join disabled with the reason. The owner chose "show but block" over hiding on 2026-11-03.
- The keeper starts the pinned-maps attempt by itself when the user's match ends or lands on a map not pinned ([04](04-maps.md)).
- The first connect goes out one CS2 check and one Steam round trip after the click (integration: "the first connect goes out one CS2 check and one Steam round trip after the click"). Measured 2026-11-04: five connects left 0.2-0.3 s after each click.
- On the tutorial's join step a click on Join moves the tutorial on and joins nothing (`src/ui/friends-view.js:54-77`; friends-view-clicks: "on the tutorial's join step a click moves it on and joins nothing").

**What each kind of start hands the loop**

- Friend or fake friend: the player's id. The target is read from a snapshot of the user and that player (section 4.1; `src/game/join-manager.js:152-156`, `:204-222`).
- Map: the map, `serverId: null`, the map's name as label, and functions read again every iteration:

  - the players to join through, best server first;
  - Prime only, as the switch stands;
  - whether a player shows a sign of Prime;
  - the friend check's verdict of a server, for the journal only.

  (`src/ui/map-finder-view.js:233-238`, `:253-263`.)

- Server: the map, the server, a label "<map name> <score at the click>", its players, and the Prime functions without Prime only: "A server the user picked is joined whatever Prime only says" (`src/ui/map-finder-view.js:239-252`).
- Pinned maps: `maps-pinned`, the pinned maps and the label "Dust II / Mirage" as functions, the players of every pinned map's joinable servers, the best server of all first, and the Prime functions (`src/game/map-keeper.js:101-113`). The keeper starts none while one runs (`:102`).
- Effects on the pins ([04](04-maps.md)):
  - A friend or fake-friend Join lets every pin go (`src/ui/friends-view.js:82-84`, `src/ui/fake-friends-view.js:93-95`).
  - So does a map or server Join for a map not pinned (`src/ui/map-finder-view.js:230-231`, `src/game/map-keeper.js:84-86`).
  - Letting the pins go cancels a running pinned-maps attempt, reason `unpinned` (`src/game/map-keeper.js:189-192`).

**Rules: the steps of a start, in order** (`_startAttempt`, `src/game/join-manager.js:355-444`)

1. Ask whether the user is in CS2 (section 3).
   - `false`: offer the launch. Declined, nothing happens: no attempt state, no journal record, no UI change (loop: "a user out of CS2 is offered a launch, and declining it aborts the join").
   - `null`, Steam could not be asked: go on without an offer.
   - `true`: go on.
2. Read the credentials once: the SteamID64 and the token or key as the fields hold them now (`src/core/app.js:192-198`). If either is missing, the start fails: logged, nothing created (`src/game/join-manager.js:401-408`). The attempt keeps these credentials for its whole life. A change of credential resets attempts instead (section 9).
3. Guard against a second loop. An attempt for the same join id that exists and is not cancelled makes this start end silently. An attempt in its JOINED display counts as existing. The guard runs after the CS2 check, because that check is a network round trip during which the button still reads Join (`src/game/join-manager.js:410-417`; loop: "a second click while the CS2 check is out does not start a second loop").
4. Create the state:
   - status WAITING, not cancelled;
   - for map, server and pinned attempts, named after the label at once, so the bar names the attempt before Steam answers (map: "an attempt is named after its label before Steam answers");
   - a cancelled state for the same id is replaced;
   - journal `attempt-start`;
   - both UI callbacks hear WAITING (`src/game/join-manager.js:419-429`).
5. Run the loop until the attempt ends (section 4).

**Failure handling**

- An error before the state exists is logged and changes nothing. It must not cancel an attempt already running for the same target (`src/game/join-manager.js:433-443`; loop: "a start that fails before its attempt exists leaves the running one alone"; integration: "a CS2 check that throws is logged and no attempt starts").
- An error after the state exists cancels this attempt only, reason `error`.
- The user is not told why a start failed; see the smells.

## 3. The CS2 check and the launch offer

**What the user sees and can do**

- With CS2 closed, Join opens an overlay "Launch CS2 First" ("Сначала запусти CS2"): "You need to launch Counter-Strike 2 before joining your friend's game." It has Launch CS2 and Close.
- Launch: "Launching CS2..." with a spinner on the disabled button. The overlay closes by itself once CS2 reaches its main menu, and the join goes on.
- Close: the overlay goes and no attempt starts. A launch under way is called off.
- No menu within 180 s: "CS2 Did Not Start" with "Try Again". The overlay stays up, and the join waits on the user's answer.
- A language switch re-renders the phase shown (cs2-launch-dialog: "a language switch re-renders the phase it shows").
- The footer's "Waiting for CS2" offers the same overlay with no join waiting ([05](05-cs2-gsi-and-local-steam.md), [07](07-ui-shell-security-and-updates.md)). A join's question takes the overlay from that offer, and calls off its launch under way. That offer never opens over a join's overlay (cs2-launch-dialog: "a join's question takes the overlay over, a launch under way included", "never opens over the join's own offer").
- Texts: `src/i18n/locales/en.js:42-79`; the dialog: `src/ui/cs2-launch-dialog.js:80-92`, `:165-290`.

**Rules: is the user in CS2** (`checkUserInCS2`, `src/game/cs2-manager.js:55-57`, `:77-134`), in this order:

1. Not configured: false.
2. Steam's game log has CS2 closed: false, with no request.
3. A fresh GSI state for the account entered in the app: true, with no request.
4. The log has CS2 open: true, with no request. The comment: "Open, though not posting: still starting, or on an old cfg."
5. SteamID or credential missing: false.
6. One Steam request:
   - true when Steam shows the user in app 730;
   - false when it does not;
   - null when Steam could not be asked: a failed request, HTTP 429, a timeout or an exception.

- Null must differ from false. "Offering to launch a game that may well be running would be wrong; the loop's failure budget deals with an outage instead" (`src/game/join-manager.js:367-369`; loop: "Steam not answering the CS2 check goes ahead without offering a launch"; cs2-manager: "returns null when Steam cannot be asked").
- Tests with the log: cs2-manager "CS2 closed by the log is not in CS2, and Steam is not asked", "CS2 open by the log is in CS2 with no request; only the menu is left to Steam".

**Rules: the launch** (`launchAndWaitForLobby`, `src/game/cs2-manager.js:237-304`)

- Open `steam://run/730/` (`src/game/steam-protocol.js:11`) without waiting for Steam's answer.
- Wait for CS2's main menu, two ways:
  - GSI posting a menu state ends the wait at once (`src/game/cs2-manager.js:194-201`; cs2-manager: "launchAndWaitForLobby resolves the moment CS2 reports the menu");
  - as a fallback while GSI is not delivering, every `CS2_LOBBY_POLL_MS` (3 s) the app asks whether the user is in CS2 and in its menu (`src/shared/constants.js:16-19`). The log closed means no; fresh GSI says whether it is the menu; otherwise Steam's rich presence `game:state` must be `lobby`. Unknown counts as not yet (cs2-manager: "treats an unknown (null) lobby check as not ready").
- A GSI state from a match does not end the wait (cs2-manager: "a state from a match does not end the launch wait").
- Deadline `CS2_LAUNCH_TIMEOUT_MS` (180 s). "Without a deadline a CS2 that never starts keeps this polling forever" (`src/game/cs2-manager.js:288`). The value has no recorded reason.
- A new launch settles an unfinished one as false. A check from a cancelled wait must not settle or stop a newer wait (cs2-manager: "a stale check from a cancelled wait does not settle or stop a new wait").
- Close during a launch stops the polling and the GSI listening, clears the deadline, and answers false (cs2-manager: "cancelLaunchOperations resolves false and clears the deadline").
- Launch pressed twice starts one launch. A launch that throws answers false and takes the overlay down. A page without the overlay answers false, and the join does not start (cs2-launch-dialog: "Launch starts CS2 once and answers true when the lobby is reached", "a launch that throws answers false", "answers false when the page has no overlay").

**Why**

- Changelog 0.4.0: CS2 is launched when it is not running at a join.
- 0.9.7, commit `2295a04`: the check answers from Steam's game log with no request, and only the menu is left to GSI or Steam.

## 4. The join loop

### 4.1 Pace and the snapshot

**Rules**

- One Steam request per iteration. Every Steam fact the iteration decides on comes from that one answer (`src/game/join-manager.js:505-506`; loop: "each iteration asks Steam exactly once, through getJoinSnapshot only").
- One request at a time. The next request leaves only after the answer and a pause:

  - `JOIN_LOOP_INTERVAL_MS` (200 ms) after an iteration that sent nothing;
  - `JOIN_RETRY_INTERVAL_MS` (400 ms) after a connect (`src/game/join-manager.js:712-713`).

  (Integration: "one request at a time: the pauses after answers about %s".)

- With a request of about 0.3 s, the cycle is about 0.5 s, and a running attempt costs about two requests a second.
- The loop must keep this pace while fullscreen CS2 covers the app's window, for as long as it is covered: joining happens exactly then.
  - Measured 2026-11-03 with a probe window: a shown window placed off-screen, standing in for one covered by CS2, reports itself hidden. Electron's defaults stretched its 200 ms pauses to 1000 ms. After 5 minutes hidden, Chromium's intensive throttling woke it once after a 42 s gap.
  - Journal attempts of 2026-11-02 show snapshot gaps of 60-75 s that fit this, though score changes could explain them too.
  - A window never shown reports itself visible and is not throttled, so a test with one proves nothing.
  - Current: the main window turns background throttling off (`src/main/main.js:106-109`).
  - The rewrite must run the loop outside the page, where no page throttling applies: in the Rust core under Tauri, since Tauri's `backgroundThrottling` option is unsupported on Windows per a mirror of its docs; or in Electron's main or a utility process. See [architecture.md](../architecture.md).
- A snapshot must be fresh: at most about half a loop pause old.
  - Current: the Steam client may answer from a cache that lives `JOIN_LOOP_INTERVAL_MS / 2` (100 ms), or from a request already out that covers the same ids, such as the friends refresh (`src/steam/steam-api-client.js:52-56`, `:174-224`; [06](06-steam-web-api.md)).
- A request that hangs ends after `REQUEST_TIMEOUT_MS` (10 s) and counts as failed. "Steam answers in well under a second" (`src/shared/constants.js:32-35`).

**Measured timing** (2026-10-25 unless dated)

- The connect leaves in the same poll that first shows the slot.
- Steam runs the URL in the same second; Steam's `logs/console_log.txt` notes every `ExecuteSteamURL`.
- GetPlayerLinkDetails for 22 ids answered in about 0.3 s.
- The Web API shows a change 1-1.5 s after the Steam client does.
- Steam shows the join about 2 s after the connect, at connection time; the map loaded 3-12 s after it.
- For the user's successful joins, the slot stayed visible 2.6-4 s, from the connect until the Web API showed the server full again.
- Journal of 10-25 to 10-27, analysed 2026-10-30: 9 slots with a known outcome, 5 taken and 4 missed.
  - Every first connect went out in the poll that first showed the slot.
  - Two misses vanished 1.1 s and 2.9 s after they appeared: the other player was connecting before the slot showed, or about a tie.
  - The other two stayed visible 24-26 s and were refused twice each. Likely cause, unverified: Valve's matchmaking had given the slot to a queued player still loading.
  - Faster polling would not have changed any outcome. Dropping the 200 ms pause would gain about 0.1 s on average.
- The fixture's six recorded joins (section 13):
  - each ended as joined 3.5-6.0 s after its connect;
  - the target's token renewed 2.0-4.7 s after it, where seen;
  - GSI showed the new map 3.6-4.0 s after the connect, in the four recordings that have it;
  - coming from a match, GSI showed the menu 0.5-0.7 s after the connect.
- The 200 ms pause is the owner's own change: commit `c56a7c9` of 2025-06-15, from 500 ms (changelog 0.4.7).

**The friend snapshot** (`resolveFriendTarget`, `src/game/join-manager.js:204-222`; `getJoinSnapshot`, `src/steam/steam-api-client.js:565-599`)

- The user and the friend share one GetPlayerLinkDetails request.
- A side is null when Steam could not be asked, i.e. its id is missing from the answer. An account Steam has no record of reads as "not in CS2", not as unknown (steam-api-join-snapshot: "reports a side Steam has no account for as not in CS2, not as unknown").
- Per player (`processJoinInfoResponse`, `src/steam/steam-api-response-processor.js:181-224`):
  - `inCS2`: the game id is 730;
  - `inProtectedMatch` (section 4.5);
  - `offlineGame`: `{map, mode}` when `game:server` is `offline`;
  - `inSupportedMode`: in CS2, `game:mode` casual, and `game:state` neither empty nor `lobby` (`src/steam/rich-presence.js:144-149`);
  - `connect`: only in a supported mode, and only a valid one (section 12);
  - `serverId`: rich presence `game_server_steam_id`, else the account's private data; rich presence seldom carries it;
  - `statusKey`: the server id plus the whole rich presence, sorted, with the join token stripped (`src/steam/rich-presence.js:74-102`). Since 0.9.4 joining only writes it to the journal; the map finder uses it too ([04](04-maps.md));
  - `personaname`.
- The target: the friend's name, `inSupportedMode`, `connect`, `joinAs` (the friend's id), `statusKey`, and the "is joined" rule (section 4.4).
- Only casual counts as a supported target mode. A friend in deathmatch is missing (rich-presence: "only a running casual match is a supported mode"). Deathmatch targets were dropped on 2026-10-25 in `8d028f6` ("Casual only from here on"). The README and changelog 0.4.0 still say otherwise; see the smells.

Map, server and pinned snapshots are in section 7.

### 4.2 The order of checks inside one iteration

The order is a requirement: several tests depend on it (`src/game/join-manager.js:503-725`).

1. Ask Steam for the snapshot. When the answer comes, stop at once if the attempt is no longer alive (section 4.9).
2. Steam could not be asked, i.e. the user or the target is missing: count it against the failure budget (4.8), pause 200 ms, next iteration. Nothing else is decided, nothing is sent, and the status stays as it was.
3. A real answer:
   - clear the failure streak;
   - note what changed in the journal (`snapshot`);
   - follow the connect the target's player shows (section 5.4).
4. Read the user's state:

   - CS2's own state from GSI, when fresh and from the entered account;
   - whether CS2 is open, from Steam's game log as last known.

   The user is in CS2 by the log's answer. Where the log cannot tell, the user is in CS2 while GSI is fresh, and otherwise by Steam's `inCS2` (`src/game/join-manager.js:520-527`).

5. Not in CS2: cancel. The reason is `cs2-closed` when the log has CS2 closed, else `left-cs2` (4.6).
6. In a protected match: cancel `protected-match` (4.5).
7. Update the memory of the server just left (4.4).
8. Joined, and not on the server just left: JOINED (4.4). This comes before anything that could connect, "so a game that is already where it should be never gets another connect".
9. The target has nothing to join: MISSING, with its own 60 s budget, then cancel `missing` (4.7). Otherwise the missing timer is cleared.
10. CS2 loaded a map since this attempt's first connect, less than 15 s ago: hold. CONNECTING, no connect (section 6.1).
11. No connect offered: WAITING.
12. The connect offered was used already, sent by any attempt or skipped as the user's arrival: no connect. CONNECTING, or WAITING once 15 s passed with no map loaded since it was used (section 6.2).
13. A connect is coming. Read Steam's game log afresh; CS2 closed means cancel `cs2-closed` (4.6). Stop if no longer alive.
14. Ask whether this new token is the user's own arrival (section 5.2). Stop if no longer alive.
15. Look in the used tokens again. Another attempt may have sent it meanwhile: pause 200 ms, with no status change.
16. The user's own arrival:
    - mark the token used, as skipped;
    - journal `skip`;
    - CONNECTING, pause 200 ms.
17. Otherwise connect:
    - CONNECTING;
    - work out the reason (5.4);
    - note the attempt's first connect time;
    - mark the token used, as sent, and note the time of the last connect of any attempt;
    - journal `connect`;
    - hand the join URL to Steam;
    - pause 400 ms.

Other rules of the iteration:

- An exception anywhere in an iteration is logged. If the attempt is still alive, it counts against the failure budget like an unanswered request, and the loop pauses 200 ms (`src/game/join-manager.js:714-723`).
- Steps 15 to 17 must be atomic across attempts: no other attempt may check or mark the same token in between. Current: JavaScript's single thread, with nothing awaited between `src/game/join-manager.js:671` and `:710`. A multi-threaded core needs a lock or a single owner of the used tokens.
- A connect handed to Steam cannot be called back. A cancel that lands after step 17 stops only what follows.

### 4.3 Statuses

| Status     | Meaning                                                         | Set when                                                                                                                                |
| ---------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| waiting    | Nothing to send now: no link, or the token sent was turned away | the start; no connect offered; a used token older than 15 s with no map loaded since                                                    |
| connecting | A connect is out, or CS2 is on its way                          | a connect sent; a used token younger than 15 s, or a map loaded since; a token skipped as the user's arrival; the hold after a map load |
| missing    | The target has nothing to join                                  | a friend not in a running casual match; no joinable player for a map, server or pinned target                                           |
| joined     | The user is where the attempt wanted                            | the "is joined" rule holds                                                                                                              |
| cancelled  | The attempt has ended                                           | any cancel; the end of the JOINED display                                                                                               |

- Steam not answering changes no status.
- JOINED is shown for `JOIN_SUCCESS_DISPLAY_MS` (1.5 s), then the attempt is cancelled, with the journal's reason staying `joined` (`src/game/join-manager.js:578-580`).
- The UI hears an attempt only when its status or its name changes: the name of a pinned-maps attempt follows the pins mid-join (`updateJoinState`, `src/game/join-manager.js:732-755`).
- The row and bar texts for each status are in section 11.

### 4.4 "Is joined"

**Rules**

- Friend: Steam shows the user and the friend on the same server, and both have a server (`src/game/join-manager.js:218-219`; loop: "neither side reporting a server does not count as joined").
- Server: Steam shows the user on that server (`src/game/join-manager.js:314-319`; map: "a server join succeeds on that server only").
- Map and pinned maps (`src/game/join-manager.js:313-343`). With a fresh GSI state in a match, joined means:

  - the mode is casual;
  - the map is one of the target's maps, as they are now;
  - the phase is not `gameover`.

  CS2 knows its map and mode at once, while Steam keeps the old ones for a while after the match ends and the server moves on. The map alone is not enough: a deathmatch on Dust II is no casual match there (map: "a map join goes by the map CS2 shows, not the one Steam still shows", "a map join does not count a match on the map in another mode").

- Without GSI in a match, Steam decides:

  - a server is needed;
  - a final score, a side at 8 rounds, is no join: "the user is on a server about to load another map, most likely the one they were on when the attempt started";
  - joined on any server where a known player of the target plays a running match;
  - or on any official casual server Steam shows on one of the maps, "even one whose known players left as the user arrived".

  (Map: "a map join succeeds on any server of the map", "without CS2's state, a finished match on the user's own server is not a join"; replay: "the same without CS2's states: Steam's final score says the match is over".)

**The server just left** (`src/game/join-manager.js:550-566`)

- Steam keeps showing a server for seconds after the user leaves it.
- While GSI is fresh and shows the menu, and the attempt has not connected yet, the server Steam shows, or none, is remembered as the one just left.
- Once Steam shows a different server, or none, the memory is cleared: Steam has caught up.
- While Steam shows the remembered server and GSI shows no match, or there is no GSI, that server does not count as joined.
- Outcomes:
  - In the menu, with Steam still on the friend's server: not joined, and a connect goes out if a token shows (gsi: "does not count as joined while CS2 shows the menu").
  - GSI with a map loaded again: joined (gsi: "counts once CS2 has a map loaded again").
  - Steam lets go of the server, and a later connect lands there: joined at once, even before the map has loaded (gsi: "once Steam lets go of it, the server it shows after a connect counts at once").
  - Map: "a server of the map the user just left does not count while CS2 shows the menu".
- Measured 2026-10-26: Steam kept showing the server the user had just left, and a new attempt ended as joined at once. Fixed in `957ae73` (2026-10-30).

**On joined** (`src/game/join-manager.js:564-582`)

- JOINED, and journal `attempt-end` with reason `joined`.
- If the attempt had connected, it leaves `{from: its first connect, to: now}` for the log's self-check (5.3).
- Every other attempt is cancelled with `other-joined`: the user is on a server now, and another connect would pull them away.
- After the 1.5 s display the attempt is cancelled. The end of the display must not cancel a newer attempt for the same target (loop: "the end of a JOINED display does not cancel a newer attempt for the friend").
- Already there at the start: JOINED on the first snapshot, without a connect (loop: "already on the friend's server: JOINED on the first snapshot, without a connect"; gsi: "in a match there it counts at once, without a connect").

### 4.5 Protected matches

**Rule.** A join must never pull the user out of a running match in any mode but casual and deathmatch, unless it is offline training (`INTERRUPTIBLE_MODES`, `src/shared/constants.js:190-196`).

- Protected modes: competitive, Premier, Wingman (`scrimcomp2v2`), `rush`, workshop maps (`custom`), and any mode not seen yet. "Steam was seen naming all of these but deathmatch."
- Without GSI, Steam's rich presence decides (`src/steam/rich-presence.js:171-198`): protected when `game:state` is set and not `lobby`, the mode is neither casual nor deathmatch, and `game:server` is not `offline`.
  - The lobby does not count, since the mode there may be only what is picked in the play menu. Queueing for competitive keeps the attempt; the match starting ends it (integration: "queueing for competitive from the menu keeps the attempt; the match starting cancels it").
  - Tests: steam-api-join-snapshot "mode %s with state %s -> %s", "an offline %s game is training, which a join may interrupt".
- With fresh GSI, CS2's mode wins, since CS2 reports it the moment it changes (`_inProtectedMatch`, `src/game/join-manager.js:941-959`).
  - GSI in the menu, casual or deathmatch: not protected, whatever Steam still shows (gsi: "a casual state from CS2 outweighs a stale competitive one from Steam").
  - GSI in another mode: protected, unless Steam shows an offline game with the same map and mode as CS2. CS2 reports training in the mode picked for it, and only Steam knows the game is offline (gsi: "training: a competitive game Steam shows offline on the same map may be left").
  - A match just found after training is not training (gsi: "a competitive match just found after training is not taken for training").
  - A GSI match without a mode counts as protected (`src/game/gsi-manager.js:53`).
  - Tests: gsi "cancels as soon as CS2 reports a competitive match", "cancels as soon as CS2 reports a %s match" (premier, scrimcomp2v2, rush, custom), "a deathmatch may be left: the join goes ahead".
- Outcome: cancel `protected-match`. Every attempt cancels on its own next snapshot, and nothing is sent after (competitive: "the user entering a competitive or premier match cancels every running attempt", "cancels between connect attempts, before the next connect", "already in a competitive or premier match: cancelled on the first snapshot, never connects").
- Only what a snapshot sees counts. A match entered and left between two polls is never seen (competitive: "rapid mode switches: only the state a snapshot sees counts").
- History: changelog 0.4.7 (competitive and Premier), then 0.9.0 and commit `85e19dd` of 2026-11-03 (any mode but casual, deathmatch or training).

### 4.6 CS2 closed, or the user out of CS2

**Rule.** CS2 closing must end every attempt at once, with no connect after it. A join URL handed to Steam with CS2 closed starts CS2 again through `steam://rungame` (`src/game/join-manager.js:652-661`).

- At step 5, the log having CS2 closed cancels `cs2-closed`, even while CS2's last GSI state is still fresh (loop: "ends a waiting join at once, though CS2's last state is still fresh, and sends nothing"). GSI's freshness also ends at a logged close ([05](05-cs2-gsi-and-local-steam.md)).
- Right before every connect the log is read afresh, and CS2 closed cancels `cs2-closed` (loop: "a CS2 that closes between the snapshot and the connect gets no connect").
- With the log saying open, Steam not showing the user in CS2 does not end the attempt: Steam's copy lags, or the user hides game details (loop: "with CS2 open by the log, Steam not showing the user in CS2 does not end the join").
- Without the log:
  - fresh GSI means in CS2 (gsi: "keeps joining while CS2 reports itself though Steam lags behind");
  - otherwise Steam's copy decides, and "not in CS2" cancels `left-cs2` (loop: "without the log, Steam not showing the user in CS2 ends the join, as before"; gsi: "without GSI, Steam saying the user left CS2 still cancels").
- Coming back to CS2 does not resume an ended attempt (integration: "leaving CS2 ends the attempt for good: coming back does not resume it").
- When the log can tell: only once it has shown CS2 starting or ending at all. It stops answering for the rest of the run if CS2 posts a GSI state while the log has it closed since before, since it then missed a start (`src/game/cs2-process.js:16-28`, `:68-74`, `:101-118`, `:149-155`; [05](05-cs2-gsi-and-local-steam.md)).
- Timing: the log's state reaches the loop within about a second, since the file is looked at once a second ([05](05-cs2-gsi-and-local-steam.md)). The check before a connect reads the file directly (`src/game/cs2-process.js:59-66`).
- Why: before 0.9.7 an attempt ended only once CS2's GSI state went stale, about 15 s, and a connect in that window could start CS2 again (changelog 0.9.7 Fixed; `2295a04`).
- Not yet seen in game. The journal should show `cs2-closed` within about a second of Steam logging the exit, with no connect after it.

### 4.7 Target missing

**Rules**

- MISSING when the target has nothing to join (`src/game/join-manager.js:586-606`):
  - a friend not in a running casual match: in the menu, a lobby, another mode, out of CS2, or with no Steam account;
  - a map, server or pinned target with no joinable player (section 7).
- More than `MISSING_TIMEOUT_MS` (60 s) in a row cancels `missing`. The timer starts over whenever the target is back.
- The row says "not in casual" and the bar "Left casual: waiting a minute for a return" (section 11).
- While its attempt runs, a friend's row stays listed even when the friend left casual or the list no longer has them, so its Cancel stays reachable. A placeholder stands in for a friend not known (`src/core/app-friends-manager.js:193-227`).
- The 60 s has no recorded reason.

### 4.8 Steam not answering: the failure budget

**Rules** (`src/game/join-manager.js:486-516`)

- "Steam could not be asked" is unknown. It is never a reason to cancel or to act: the loop sends nothing and keeps the status (loop: "for %s does not cancel and sends nothing to the game"). It keeps asking at the normal pace.
- More than `MISSING_TIMEOUT_MS` (60 s) of failures in a row cancels `no-answer`: "a lasting outage (expired token, network down) spends the budget" (loop: "for longer than MISSING_TIMEOUT_MS in a row cancels the attempt"). A real answer in between starts the budget over (loop: "a real answer in between starts the failure budget over").
- The first failure of a streak writes a `no-answer` journal record.
- Failures are:

  - a request failed or timed out;
  - Steam answered 401, 403, 429 or 5xx;
  - the iteration threw.

  (Competitive: "a rejected snapshot does not cancel, and a match is still caught after it"; integration: "Steam failing once mid-join does not cancel; the attempt connects once Steam answers again".)

- During an outage the CS2 and protected-match checks do not run, since step 2 comes before them. Nothing is sent meanwhile; see the smells.

### 4.9 Acting only for its own attempt

**Rule.** An attempt ends when it is cancelled, reset, or replaced by a newer attempt for the same id, and any of these can land while a request is out. After every awaited step the loop must check that its attempt is still the current, uncancelled one for its id, before it touches the state, the UI or the game (`src/game/join-manager.js:463-467`; checks at `:503`, `:507`, `:580`, `:656`, `:668`, `:721`).

- Tests:
  - loop: "an answer that would show %s, arriving after a cancel, is ignored";
  - loop: "cancel and start again while the old snapshot is out: the old loop never acts";
  - loop: "friend A joined while friend B's snapshot is out: B's answer opens nothing";
  - integration: "a match starting while a request is out stops the connects when Steam answers".

## 5. The join-token rule

### 5.1 The rule

Owner's decision, 2026-11-06; shipped in 0.9.4 (`34c9062`):

- Connect on any token of the target not sent yet, a link appearing included, at once, through whichever player the attempt follows.
- Never send a token that went out already, from this attempt or any other, nor one skipped as the user's own arrival.
- Skip a new token when Steam's game log shows a "Game server change" since the last connect and before the token first showed: that renewal is the user's own arrival.
- When that log cannot be used, connect on every new token. That means the file is missing, or a join it should hold is missing from it. The owner's reason: "легче закрыть окно что сервер полон чем пропустить место", easier to close a "server is full" message than to miss a slot.
- A change of status alone (score, map, round) never triggers a connect, and nothing waits a fixed time before a connect.
- `JOIN_LOAD_WINDOW_MS` (15 s) stays, only for the "waiting for a slot" label (section 6.2).

**Mechanics** (`src/game/join-manager.js:69-73`, `:840-871`)

- The used tokens: each token with `{at, sent}`, shared by all attempts, kept in order of use, at most `JOIN_USED_TOKENS_MAX` (500), the oldest dropped first. "The journal of 2026-10-25 to 11-06 holds 87 connects" (`src/shared/constants.js:29-31`).
- Connects that carry no token, lobby or local server, are remembered per attempt only (`src/game/join-manager.js:477-482`).
- Only a reset empties the used tokens (section 9). They are not saved across restarts.

**Tests**

- Loop:
  - "an unchanged token gets a single connect, however long it lasts";
  - "a connect CS2 never acts on turns into waiting for a slot, and a new status with the same token sends nothing";
  - "a token renewed by someone else after the connect gets a connect at once";
  - "a token never goes out twice, not even from a new attempt";
  - "a link that goes away and comes back gets a connect on its new token".
- Map: "another player's token after a refusal gets a connect, and the journal says why", "a server and its map joined at once through one player send one connect".

### 5.2 The user's own arrival

**Why it matters**

- The user's own arrival on a server renews the token of every player there. Measured 2026-10-25: the token changed about 2 s after an accepted connect. The loop of that day took it as a new status and connected again, and CS2 answered "Game is full".
- Measured 2026-11-06: after 16 successful connects the target's token was seen to change 1.7-4.7 s later. The other 18 joined attempts ended 1.3-4.5 s after the connect, before a change could be seen. Without CS2's console log the app cannot tell, in those seconds, an accepted connect from a refused one.

**The signal**

- Steam's own game log, `logs\gameprocess_log.txt` in the Steam folder, written without any launch option, has a line `[YYYY-MM-DD HH:MM:SS] SSGL: Game server change [730]` each time CS2 changes game server, joining or leaving one. It is in local time, to the second (`src/main/steam-game-log.js:7-29`).
- Measured 2026-11-06 against the 11 answers of CS2's game coordinator on 2026-11-05/06, read from the owner's console log:
  - a line 0-3 s after each of the 6 accepted connects, and none after the 5 refused ones;
  - in all 4 cases where the target's renewal was seen too, the line came first, by about 0.4-1.8 s;
  - nothing else in Steam's logs marks a refusal.
- A join from inside a match logs two lines about 2 s apart, leaving and then joining (measured 2026-11-06 on the real file).

**Rules** (`_isOwnArrival`, `src/game/join-manager.js:873-909`)

- Only a player's first change of connect after the last connect of any attempt can be the arrival: the player's previous connect must have shown since that last connect or earlier. With no connect since the last reset, nothing is.
- Steam's log is read up to now. The new token is the arrival when the log holds a server change in the second of the last connect or later, and no later than the moment the token first showed.
- A log that is unusable or untrusted (5.3) makes no token the arrival. So does an error while reading it.
- A skip:

  - marks the token used, as not sent;
  - writes journal `skip` with `why: "own-arrival"`;
  - shows CONNECTING.

  The last-connect time stays, so the player's next change counts as someone else's.

- The log reader keeps only server changes appended after the app started, since only those can follow a connect of this run. It reads on demand, from where the last read stopped, and keeps the newest 200. A shorter or replaced file is read from its start: Steam started anew (`src/main/steam-game-log.js:164-232`, `:318-357`; [05](05-cs2-gsi-and-local-steam.md)).

**Tests**

- Loop:
  - "the user's own arrival: Steam logs the change of server, and the token it renews gets no connect";
  - "without Steam's game log every new token gets a connect, the user's own arrival's too";
  - "only the first new token after a connect can be the user's own arrival".
- Map: "the user's own arrival renews every token on the server: no connect through another player there".
- Replay: "Steam logs the change of server, and no second connect goes out", "without Steam's log the renewed token gets a connect too, and the join still lands".

**Known cost.** A server change that was not the join, such as the user leaving a match by hand, makes the next first change of a player be skipped. The change after that is connected (loop: "only the first new token after a connect can be the user's own arrival").

### 5.3 The self-check that distrusts the log

**Rules** (`src/game/join-manager.js:76-83`, `:888-901`)

- The log is trusted until a join it should hold is missing from it.
- An attempt that connected and then ended as joined leaves `{from: its first connect, to: when it saw the join}`.
- The next own-arrival question from any attempt that gets past the first rule of 5.2 first reads the log from `from` on:
  - readable: the log is trusted exactly when it holds a server change no later than `to`;
  - either way, the pending check is dropped.
- Untrusted, every new token is connected, as with no log, until a later join shows up in the log and trusts it again (loop: "a Steam log that missed a join is not trusted until it logs one", "a join Steam's log holds keeps it trusted").
- The journal notes the log's state whenever it changes: `steam-log` with `usable`, `untrusted` or `missing` (`src/game/join-manager.js:911-921`).
- A reset trusts the log again and drops a pending check (`src/game/join-manager.js:809-813`).

### 5.4 Following players, and why a connect went out

**Rules**

- For the player the target joins through, the attempt keeps four things (`_watch`, `src/game/join-manager.js:816-837`):
  - the connect they show;
  - since when;
  - since when the previous one showed, or the attempt's start for a player first seen;
  - the previous connect: none known for a player first seen, empty after no connect.
- The reason a connect went out, journal `connect.why` (`src/game/join-manager.js:923-939`):
  - `start`: the connect a player showed when the attempt first saw them, before any connect of its own;
  - `player`: a player the attempt turned to after connecting through someone else;
  - `link`: a connect where the player had shown none;
  - `token`: a new token in place of another.
- Tests: loop "notes why each connect went out, and a token taken for the user's own arrival" (link, token, then a skip); map "another player's token after a refusal gets a connect, and the journal says why" (start, player).

### 5.5 Why: the evidence and the history

**Before the rule**

- Before 2026-10-25 a connect went out every half second while a slot showed. Connects sent while CS2 was still connecting were deferred by CS2 ("Executing deferred gcconnect") and ran after the join as extra attempts (`f92e01b`).
- 2026-10-25, owner's decision: a connect only on a new target status, the whole rich presence and server (`f92e01b`). The session notes still describe this rule; the code no longer follows it.
- 2026-10-26: the owner rejected a fixed 6 s pause after each connect as "a magic number", since timings differ between machines.
- 2026-10-26 to 10-30: CS2's console log was read to time connects by the game coordinator's answer (`JOIN_REPLY_TIMEOUT_MS`, `JOIN_SETTLE_MS`). It was removed because it needs a launch option.
- 2026-10-30: the status left the token out, because all three token-only changes in the journal were wasted connects (`957ae73`).

**What the journal then showed**

- On 2026-11-02 the loop skipped 5 token-only changes in 47 s, and on 2026-11-03 at 20:48 it skipped 3 in 13 s.
- On 2026-11-04 between 01:40 and 01:44:
  - five connects, 0.2-0.3 s after the clicks, were all refused "Game is full";
  - the friend's token stayed at least 68 s while the server was full;
  - a friends refresh ended two waiting attempts, and each new attempt resent the refused token;
  - the attempt left alone got in on a new token after 161 s.

**Token life**, measured 2026-11-06 over the journal of 10-25 to 11-06 and CS2's log from 11-05 23:07:

- While an attempt watched one player, the token changed 46 times, appeared 6 times and vanished 3 times. In 41 of the 46 changes nothing else in the status changed. A replaced token never came back.
- 30 of the 46 renewals came within 5 s of our own connect on that link.
- A refused token mostly stays: 4 of 5 log-confirmed refusals saw no change in the remaining 21-57 s.
- Connects on a token under 1 s old got in 24 of 45 times; on a token already there when the attempt started, 10 of 42.
- A link that appeared after none for 19-158 s got the user in 6 times out of 6, all mid-round with nothing else changing.
- All 3 vanished tokens had gone 1-2 minutes without letting anyone in. After all 16 joins where the change was seen, the token was replaced, never removed.
- The owner's model, 2026-11-06: the link, and Steam's Join button, appears when a place frees, hangs on stale once it is taken, and a new one replaces it. So a renewal while the link stays is no sign of a free place; a link appearing is.

**Resends**

- 87 connects carried 83 distinct tokens. A token went out twice only 4 times, and none of the 4 got in:
  - three from new attempts on 2026-11-04 at 01:41;
  - one on 2026-11-03 at 00:21, a map and a server join firing together.
- All 34 joins came on a token's first send, 16 of them after refused connects.
- Outcomes were inferred from how attempts ended. CS2's console log confirms them only from 2026-11-05 23:07: 6 accepted, 5 "Game is full".

**Status in game.** As of 2026-11-07 13:00 the journal had no record since 2026-11-06 00:28, so the rule has not yet met a real join. The journal's `connect.why`, `skip` and `steam-log` records are to be read after the owner plays.

## 6. GSI map-load confirmation and "waiting for a slot"

### 6.1 The hold after a map load

**Rules** (`isAwaitingJoinConfirmation`, `src/game/join-manager.js:131-146`, `:608-619`; `src/shared/constants.js:20-22`)

- Hold when GSI shows a match whose map loaded after this attempt's first connect, less than `JOIN_GSI_CONFIRM_MS` (15 s) ago. CS2 "is most likely where it should be and Steam just does not show it yet. More connects would only reach a game that is already there."
  - The attempt shows CONNECTING and sends nothing.
  - The hold comes after the "is joined" check, so Steam's confirmation still ends the attempt as joined (gsi: "holds connects once CS2 loads a map, until Steam confirms the server").
- A map counts as loaded at the first GSI post whose map differs from the previous fresh state's, no map or another map (`src/game/gsi-manager.js:116-129`).
- A token that shows during the hold is not lost: once the hold ends, a token not yet used gets its connect (gsi: "a new status during the hold gets its connect once the grace period ends"). An unchanged token gets none (gsi: "after the grace period an unchanged status gets no second connect").
- A map loaded before the first connect, the user's own match, holds nothing (gsi: "a map loaded before the first connect does not hold anything").
- Unit cases: gsi "isAwaitingJoinConfirmation" (no GSI state, no connect yet, the menu, a map before the connect, a map after it, a map too long ago).

**Why.** GSI has no loading phase: it posts menu heartbeats until the map has loaded, 3-12 s after the connect, while Steam shows the join about 2 s after it (measured 2026-10-25). So Steam normally confirms first, and the hold only covers Steam lagging behind. No measurement backs the 15 s.

### 6.2 The "waiting for a slot" label

**Rules** (`src/game/join-manager.js:630-650`; `src/shared/constants.js:23-28`)

- While the token offered was used, sent or skipped, the attempt shows CONNECTING.
- Once `JOIN_LOAD_WINDOW_MS` (15 s) have passed since then with no map loaded, it shows WAITING: "waiting for a slot" on the row, "The server is full: joining as soon as a slot opens" on the bar.
- Only the label depends on this window. The next connect still waits for a new token (owner's rule, 2026-11-06).
- A token used by another attempt counts from that attempt's use.

**Tests**

- Loop: "a connect CS2 never acts on turns into waiting for a slot, and a new status with the same token sends nothing", "a token never goes out twice, not even from a new attempt".
- Gsi: "a connect CS2 loads no map for while the user plays elsewhere waits for a slot".

**Why**

- CS2 loads the map of an accepted connect 3-12 s after it (measured 2026-10-25). Every connect in CS2's log of 2026-11-04 that loaded no map had been turned away, "Game is full".
- Before this label (`c8d7626`, 2026-11-04), an attempt showed "connecting…" for as long as the refused token stayed. That day the user restarted the app four times and got four more refusals. The session notes of that day still describe the old label.

## 7. Map, server and pinned-maps targets

**Rules: one target per iteration** (`resolveMapTarget`, `src/game/join-manager.js:224-346`)

1. Read the players to join through again, so new arrivals count, and drop the user's own id.
2. Ask about the user and all of them in one presence request, at 100 ids per request ([06](06-steam-web-api.md)). The user missing from the answer means Steam could not be asked (map: "reports Steam not answering for the user as unknown").
3. Read the maps again: the pins, or the one map.
4. On the map: a player counts when Steam shows them in a casual match on one of Valve's official servers ([04](04-maps.md) has the signature), on one of the maps, and for a server join, on that server (map: "ignores candidates who moved to another map, a match or a community server", "sticks to the chosen server").
5. Prime:
   - count, server by server, the players who show a sign of Prime in this very poll: "one who moved on takes the server's mark along";
   - with Prime only on, as the switch stands this iteration, only servers with such a player count (map: "with Prime only, a server counts while a candidate on it shows a sign of Prime", "with Prime only and no server showing Prime there is nothing to join", "with Prime only off, signs of Prime are only counted").
6. The user's own server: none while GSI says menu, since back in the menu the user is on no server whatever Steam shows. Otherwise the server Steam shows.
7. Running: drop players whose score says the match is over, a side at `CASUAL_ROUNDS_TO_WIN` (8). The server is about to load another map.
8. Joinable: running, and not on the user's own server, which is "nowhere new" (map: "skips a finished match and the user's own server").
9. Pick the first joinable player who shows a connect. Players come best server first: running before over, a free slot before none, fewer rounds played first ([04](04-maps.md); `src/game/map-finder.js:112-116`, `:734-757`). Map: "joins through the first candidate on the map that offers a connect".
10. The target:
    - its name is the label as it is now;
    - it has something to join while any joinable player is left, else MISSING;
    - the connect and `joinAs` come from the pick;
    - `statusKey` is the pick's id and status, for the journal only (map: "takes its status from the candidate it joins through");
    - the Prime facts `{only, players on the pick's server, check}`, where `check` is the friend check's verdict of that server. They go to the journal with each connect and never decide the pick (map: "the friend check of the server picked is noted, and changes nothing about the pick", "a join that asks nothing about Prime carries no Prime facts").

- "Is joined" (4.4) also uses the servers of the running players.
- While a map, server or pinned attempt runs, the map finder must keep polling, whatever view is open, so its players stay current (`src/core/app.js:199-207`; join-repaint: "the join bar follows the name of a pinned-maps attempt as the pins change", whose comment reads "A map join needs fresh servers from the start"). Its polling is in [04](04-maps.md).

**Pinned maps**

- The maps and the label are read every iteration. Pinning or unpinning a map mid-join changes which servers count, and the bar follows the name (join-repaint: "the join bar follows the name of a pinned-maps attempt as the pins change"; map: "a join of several maps takes a server of any of them").
- Unpinning the last map cancels the attempt, reason `unpinned`. Cancelling it lets the pins go (section 8).

**Server joins**

- The user picked the server, so Prime only is ignored.
- Its players must still be on the map of the card the user clicked. Once the server's match ends and it loads another map, the attempt goes missing and ends after 60 s; see the open questions.

**Evidence**

- Replay "2026-10-30 20:26: the match ends at 8:2 while another Dust II server has a slot". The loop of that day ended as joined at once, because Steam still showed the user on Dust II after CS2 showed gameover.
- `CASUAL_ROUNDS_TO_WIN` was decided on 2026-11-03: matches ended at 8:2 and after round 15, and the server then loads its next map under the same id (`src/shared/constants.js:198-203`).
- In game on 2026-11-05 evening, version 0.9.1: 7 map and pinned joins, all joined within 4-58 s. CS2 refused 5 connects with "Game is full" before success. Every connect had Prime only on.

## 8. Cancelling

**What the user can do.** Cancel on the attempt's row (Friends, Fake Friends, a map, a server, the pinned row) or in the join bar.

**Rules** (`cancelJoin`, `src/game/join-manager.js:757-772`)

- With no state for the id, nothing happens.
- Journal `attempt-end` with the reason, `cancelled` by default. Only an attempt's first end is noted (join-journal: "an attempt is noted as ended once, whatever ends it later").
- The state becomes CANCELLED and cancelled. The UI is painted once, with no delayed repaint (loop: "cancelJoin paints CANCELLED once, with no delayed repaint").
- The state stays in memory, cancelled, until a new start for the id replaces it or a reset deletes it.
- The loop stops at its next check (4.9).
- Cancelling the pinned-maps attempt, from its row or the bar, lets the pins go (`src/ui/join-bar.js:41-49`, `src/ui/map-finder-view.js:218-221`, `src/game/map-keeper.js:88-94`).
- Removing a fake friend cancels its attempt, since a running attempt for an id no longer listed would be invisible (`src/ui/fake-friends-view.js:144-145`).
- Cancelling one attempt leaves the others running (competitive: "one attempt cancelled by hand leaves the other running"; friends-view-clicks: "Cancel on a row cancels its attempt and starts nothing").

**End reasons**, as the journal's `attempt-end.reason` has them:

| Reason            | When                                                                                      | Where                          |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| `joined`          | the "is joined" rule held                                                                 | `src/game/join-manager.js:568` |
| `cancelled`       | the user cancelled; also the call that ends the JOINED display, which the journal ignores | `:762`, `:580`                 |
| `other-joined`    | another attempt saw the user joined                                                       | `:778-784`                     |
| `protected-match` | the user is in a match not to leave                                                       | `:546`                         |
| `cs2-closed`      | Steam's game log has CS2 closed                                                           | `:534`, `:659`                 |
| `left-cs2`        | without the log, neither GSI nor Steam has the user in CS2                                | `:534`                         |
| `missing`         | the target had nothing to join for over 60 s                                              | `:597`                         |
| `no-answer`       | Steam failed for over 60 s in a row                                                       | `:499`                         |
| `error`           | the start failed after its state existed                                                  | `:441`                         |
| `unpinned`        | the pins went while the pinned-maps attempt ran                                           | `src/game/map-keeper.js:191`   |
| `reset`           | a reset ended the attempt                                                                 | `src/game/join-manager.js:801` |

## 9. Resets

**Rules** (`resetAll`, `src/game/join-manager.js:794-814`). A reset:

- deletes every attempt state;
- notes `attempt-end` with `reset` for those still running;
- paints every one CANCELLED through both UI callbacks. The loops notice the missing state and stop without touching the UI, so a dead attempt would otherwise keep showing Cancel (loop: "resetAll paints every attempt CANCELLED and stops the loops");
- empties the used tokens and forgets the last connect: "Another account or credential starts over: no token counts as sent";
- trusts Steam's game log again, drops a pending self-check, and forgets the log state the journal last noted.

**Triggers**

- The credential in the token field really changes: the key or token taken out of the field differs from the previous one, or from the saved one before the user has typed. Every keystroke is checked (`src/core/app-input-manager.js:129-146`; app-input-manager: "changing the key resets joins once", "typing that leaves the extracted value unchanged does not reset", "first edit that keeps the saved key does not reset joins").
- A friends reload for another account or another credential (`src/core/app-friends-manager.js:259-260`, `:312-315`; friends-reload-joins: "a reload for another account ends the running joins", "a reload with another credential ends the running joins").

**Not a trigger.** A reload of the same account and credential keeps running attempts and their rows (friends-reload-joins: "a reload of the same account keeps the running join and its row").

**Why**

- Each attempt goes on with the credentials it started with, so another account or credential must end it.
- `dbf1c6b`, 2026-11-04: a reload had ended two attempts waiting for a slot on a friend's full server, and each new attempt resent the refused token. The session notes of that day still describe the old reset.

## 10. Concurrent attempts

**Rules**

- Any number of attempts run at once, one per join id, each with its own loop and requests. The Steam client shares requests already out for the same ids ([06](06-steam-web-api.md)).
- Shared by all attempts: the used tokens, the time of the last connect, and the trust in Steam's game log.
- Two attempts meeting the same token send one connect, because the token is looked up again after the awaits (step 15). On 2026-11-03 at 00:21:24 a server join and a map join sent the same connect in the same second, and the second could only be turned away (map: "a server and its map joined at once through one player send one connect").
- The first attempt to see the user joined cancels all others with `other-joined` (competitive: "joining one friend cancels the other attempts"). The fixture's "three servers at once" recording has three server attempts, one connect, and two `other-joined` ends.
- A protected match, or CS2 closing, ends each attempt on its own next snapshot.
- A second start for a join id that is running, or in its JOINED display, is ignored (section 2).
- The join bar shows one attempt, the first running one (section 11).

## 11. The join bar and the status labels

### The join bar

**What the user sees** (`src/ui/join-bar.js:28-104`; markup `index.html:167-175`)

- One line above the tabs about a running attempt, whatever tab it started from, with a Cancel of its own. It is a polite live region with role `status`.
- It shows the first running attempt, in the order the join ids were first used. With none running it shows the first one in its JOINED display, and otherwise it is hidden.
- Title "Joining {name}" ("Подключаемся: {name}"). The name, in order of preference:
  - the attempt's own name: the friend's Steam name, or the label of a map, server or pinned attempt;
  - the name on the friend's row;
  - for the pinned attempt, the pins' label;
  - for a map, the map's name;
  - else the raw join id.
- The detail line by status (`src/i18n/locales/en.js:187-193`, `src/i18n/locales/ru.js:186-192`):

| Status     | English                                             | Russian                                                 |
| ---------- | --------------------------------------------------- | ------------------------------------------------------- |
| connecting | Connect sent, waiting for CS2                       | Попытка отправлена, ждём CS2                            |
| waiting    | The server is full: joining as soon as a slot opens | Сервер полон: подключимся, как только освободится место |
| missing    | Left casual: waiting a minute for a return          | Вышел из casual: ждём минуту, вдруг вернётся            |
| joined     | You are on the server                               | Ты на сервере                                           |

- Cancel is hidden while JOINED. It cancels the attempt shown, and for the pinned attempt lets the pins go.
- A coloured line on the left and a spinner. Missing is purple; joined is green, and the spinner stops (`css/account.css:225-290`; [07](07-ui-shell-security-and-updates.md) has the palette).
- It is redrawn on every status or name change of any attempt and on a language switch, and hidden once nothing runs.
- Tests: join-bar "stays hidden while nothing joins", "shows the running attempt, named from its row before Steam names it", "names a map attempt after the map and explains a full server", "Cancel cancels the attempt it shows", "a join that landed shows without Cancel; a cancelled one hides the bar".

### Row labels and buttons

**The label of a row** (`statusLabel`, `src/ui/join-status.js:73-102`; texts `src/i18n/locales/en.js:171-185`, `ru.js:170-184`):

| State of the row                 | Label (English / Russian)                      |
| -------------------------------- | ---------------------------------------------- |
| connecting                       | "connecting…" / "подключаемся…"                |
| waiting                          | "waiting for a slot" / "ждём место"            |
| missing                          | "not in casual" / "не в casual"                |
| joined                           | "on the server" / "на сервере"                 |
| no attempt, target out of casual | none, or the row's own text                    |
| no attempt, match over           | "match over" / "матч закончился"               |
| no attempt, the user is there    | the row's text, or "you're here" / "вы здесь"  |
| no attempt, a link shows         | the row's text, or "free slot" / "есть место"  |
| no attempt, no link              | the row's text, or "no free slot" / "мест нет" |

- A cancelled attempt reads as no attempt.
- The row's own texts:
  - a friend on the user's server: "you're together" / "вы вместе";
  - the map the user plays: "you're on this map" / "вы на этой карте";
  - the pinned row on a pinned map: "you're on a pinned map" / "вы на закреплённой карте";
  - a map with several free servers: "{count} with a free slot" / "{count} со свободным местом".
- Tests: join-status "%s (%s) on %j", "an idle text replaces the slot text; out of casual the label hides".

**The button** (`joinButtonLook`, `src/ui/join-status.js:104-129`):

- While the attempt runs: Cancel ("Отменить").
- No attempt:
  - the target in casual and the user there, or its match over: Join, disabled;
  - in casual without a link: "Wait for a slot" ("Ждать место");
  - otherwise, a link showing or the target out of casual: Join ("Подключиться").
- During the JOINED display: disabled.
- Tests: join-status "Cancel while the attempt is %s", "Join for a free slot, Wait for a slot when full, Join out of casual", "disabled for the moment it shows a join that landed", "a row where the user already is says so and cannot be joined", "a finished match cannot be joined, even with a slot", "a running attempt still shows itself and can be cancelled".

**Where the facts come from**

- A row keeps its slot facts on its label and button: free, casual, here, over, and its own text. A status change repaints from the status alone (`src/ui/join-status.js:27-71`, `src/ui/status-manager.js:11-40`; join-status "survive the trip through attributes, quotes and markup included").
- Friend rows: free means in casual with a valid link; here means Steam shows the friend on the user's server (`src/ui/friends-renderer.js:170-181`).
- Map, server and pinned rows: [04](04-maps.md) (`src/ui/map-finder-view.js:610-715`).
- "Free slot" means the player shows a link. A link can hang on for a while after the place is taken, so the label lags; on 2026-11-04 one stayed at least 68 s on a full server.

**Repainting**

- A running attempt is repainted only when its status or name changes, and when a refresh rebuilds its row from the attempt states. No timer is needed (join-repaint: "a refresh rebuilds the row of a waiting attempt from the join states, with no timer").
- A 1 s repaint timer was dropped in `2ee1fc7` (2026-11-04).

## 12. The steam:// join URL and its validation

**Rules**

- Join URL: `steam://rungame/730/<joinAs>/<connect>`, where `joinAs` is the SteamID64 the connect belongs to. Launch URL: `steam://run/730/` (`src/game/steam-protocol.js:8-21`).
- Two gates must both pass:
  1. A rich presence connect is used only when it is one bare `+gcconnect` value: `+gcconnect` followed by 1 to 64 letters, digits, `:`, `_` or `-` (`VALIDATION_PATTERNS.GC_CONNECT`, `src/shared/constants.js:153-155`). The value is written by the other player's client and becomes CS2's launch arguments, so spaces, encoded characters, quotes or more `+` commands must never reach the game (`src/steam/rich-presence.js:116-128`). A bad value is dropped and warned about once per distinct value, since the loop reads a snapshot every iteration (`src/steam/steam-api-response-processor.js:161-209`). Tests: steam-api-join-snapshot "rejects %s", "the snapshot drops a malformed connect and warns once per value".
  2. The host opens a `steam://` URL only in the app's own shapes. For `rungame` that is app 730, a 17-digit SteamID64 and a `GC_CONNECT` value, with nothing after (`src/main/external-links.js:31-65`). Main-settings "isAllowedExternalUrl: steam:// commands" refuses launch options, a second path part, a plain `+connect` to an address, another app id and a non-SteamID.
- The opener hands the URL to the OS, which passes it to Steam, and does not wait for CS2. Current: IPC to the main process, then `shell.openExternal`, whose answer means "allowed", not "opened" (`src/main/main.js:62-80`, `:240-248`). Without the bridge, as in tests, the page opens it itself (`src/game/steam-protocol.js:23-34`; integration: "without the Electron bridge it connects through window.open, then stops on a match").

**What happens after** (measured)

- Steam runs the URL in the same second, and gcconnect reaches CS2 as a command-line request, not a console command (2026-10-25).
- The game coordinator answers in about 1 s: "Joinfriend: connecting to …" when it accepts, "Failed to connect to friend: Game is full" when it refuses (2026-10-26). Only CS2's console log shows this, and the app must not rely on it: it needs a launch option.
- The coordinator lets a non-friend join through `+gcconnect`. The owner verified it on 2026-10-25 by joining strangers on an official Dust II casual server added as fake friends.

## 13. The join journal

**Purpose.** It "only records facts, one JSON object per line, and decides nothing". It exists to tune the loop from real joins (`src/game/join-journal.js:10-18`). Every attempt is logged (owner's decision, 2026-10-25). Most measurements above come from it, and the replay tests are built from it. The owner's journal is read after they play to confirm changes in game.

**The file** (`src/main/join-journal-file.js`; `src/shared/constants.js:38-50`; path `src/main/main.js:21-24`)

- `%APPDATA%\cs2-casual-enjoyer\join-journal.log`, one JSON object per line, UTF-8.
- A line never holds a raw line break: runs of CR and LF inside one become a space, so a value cannot forge a record (join-journal-file: "a line break inside a line cannot start a line of its own").
- Batches are appended one after another, in the order they came (join-journal-file: "appends each batch as lines, in the order the batches came").
- Rotation: before an append, a file at or past `MAX_BYTES` (5 MiB) is renamed to `join-journal.log.old`, replacing the previous one. The journal thus takes at most about twice that, plus one batch (join-journal-file: "a file grown past the limit is moved aside and a new one started").
- A batch is refused, with nothing written, when it is not a list, is empty, has more than 500 lines, or holds a line that is not text or is longer than 8 KiB (join-journal-file: "refuses %s").
- A failed write fails that append only, never the next, and never throws (join-journal-file: "a folder that cannot be written to fails the append, not the next one").
- The producer buffers lines and hands them over 1 s after the first (`FLUSH_MS`), or at once at 500 lines. Without a writer it drops them, so nothing piles up. A failed hand-over is logged as a warning and those lines are lost (`src/game/join-journal.js:31-46`, `:79-97`; join-journal: "buffers events and hands them over in one batch", "a full buffer is handed over at once", "without the bridge nothing is written and nothing piles up").
- The journal holds SteamID64s (the user's, friends', other players'), server ids and join tokens. It must stay on the PC. Data taken from it for tests must be anonymised ([test-plan.md](../test-plan.md)).

**Records.** Every record has `t`, epoch ms from the app's clock, and `event`.

| Event           | Other fields                                                                                                                                                   | Written when                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `attempt-start` | `join`                                                                                                                                                         | an attempt starts                                                                                                    |
| `attempt-end`   | `join`, `reason` (section 8)                                                                                                                                   | an attempt ends; once per attempt                                                                                    |
| `snapshot`      | `join`, and those of `userInCS2` (Steam's copy), `userServer`, `targetSupported`, `joinAs`, `connect`, `status` (the target's status key) that changed         | the attempt's first snapshot with all six, then each snapshot where any changed (`src/game/join-manager.js:961-989`) |
| `connect`       | `join`, `joinAs`, `connect`, `why` (`start`, `link`, `token`, `player`), and `prime: {only, players, check?}` for map, server and pinned attempts              | a connect is handed to Steam                                                                                         |
| `skip`          | `join`, `joinAs`, `connect`, `why: "own-arrival"`                                                                                                              | a token is taken for the user's own arrival                                                                          |
| `steam-log`     | `state`: `usable`, `untrusted` or `missing`                                                                                                                    | what Steam's game log is good for changes; no `join`                                                                 |
| `no-answer`     | `join`                                                                                                                                                         | the first failure of a streak                                                                                        |
| `gsi`           | `map`, `mode`, `phase`, `round`, `activity`, `player` (the SteamID64 CS2 shows: the user or the player watched), `team`, `listed` (how many players CS2 lists) | see below (`src/game/join-journal.js:114-142`)                                                                       |
| `seeds`         | `asked`, `answered`, `pooled`, `notInGame`, `other`                                                                                                            | written by the map finder about seeds ([04](04-maps.md); `src/game/map-finder.js:468-498`)                           |

- The session notes list `waiting` among the `seeds` fields; the code has no such field.

**CS2's states**

- Every new GSI post is noted while any attempt runs, and for `TRAIL_MS` (60 s) after one ends, to see the join land.
- Otherwise a post is noted only when the number of players CS2 lists changes. CS2 going quiet is not a new state.
- The journal follows GSI from the app's start (`src/core/app.js:233`).
- Tests: join-journal "notes CS2's states while an attempt runs and for a while after", "outside attempts notes only a change in how many players CS2 lists", "CS2 going quiet is not a new state".

**The replay fixture** `__tests__/fixtures/join-journal-replays.json`

- Six recordings of joins that went right, between 2026-10-30 and 2026-11-02:
  - a Dust II map join with one connect;
  - a Dust II map join from a Mirage match after 3.5 minutes with no free slot;
  - three server attempts started within 3 s, one connect;
  - a friend on Cache whose server was full for 2 minutes;
  - a Dust II map join from a Mirage match whose token renewed;
  - a friend on Dust II joined from an Inferno warmup.
- Each recording has:
  - `name`;
  - `start`, an ISO time;
  - `attempts`: the target (`kind` friend, map or server, with the friend, map or server), `startAt`, the `candidates` to join through, `endedAt`, and `outcome` (`joined` or `other-joined`);
  - `steps`: at ms from the start, what CS2 posted (`gsi`: the map block and activity), Steam's copy of the user (`user`: server, in CS2), and each player's rich presence string and server (`players`);
  - `connects`: the connects that got the user in, with their time, player and token.
- Player, server and token ids are made up, one real id always by the same made-up one. Maps, scores, rich presence fields and timings are as recorded.
- Steam's copy of the user's rich presence is not in the journal; the test gives the user the map of the server they are on.
- The recordings are older than the token rule, so the test models Steam's log on 2026-11-05: a server change 1 s after each accepted connect.
- The test requires the same outcomes and exactly the recorded connects, one per recording: "one less never joins, one more can find the user's own slot taken" (join-replay-journal: "%s: joins as it did, with the same connects").
- The two cases that once went wrong, the user's own arrival of 2026-10-25 20:53 and the match over of 2026-10-30 20:26, live inline in `__tests__/join-replay.test.js`, not in this fixture.

## 14. Release history of joining

From `CHANGELOG.md`, for tracing when a behaviour came in:

- 0.3.0 (2024-06-04): the first release joins a friend's casual match as soon as a slot is free.
- 0.4.0 (2024-06-04): CS2 is launched when it is not running at a join. Friends in deathmatch could be joined; dropped since, see section 4.1.
- 0.4.7 (2025-06-15): a join is cancelled in a competitive or Premier match; the loop checks every 200 ms instead of 500 ms.
- 0.9.0 (2026-11-06):
  - one connect per change in the target's status, replaced in 0.9.4, and the "server full, waiting for a slot" text;
  - a reload of the same account keeps running joins;
  - a join stops in any match it must not interrupt;
  - timers keep full speed while CS2 covers the window;
  - finished matches are skipped and the user's own server cannot be joined;
  - Steam requests give up after 10 s;
  - the local join journal.
- 0.9.4 (2026-11-06): "Joins follow the join tokens players show, no longer their status." A token already sent never goes out again from any attempt. The user's own arrival is told apart by Steam's game log, and without the log every new token gets a connect. The journal says why each connect went out.
- 0.9.7 (2026-11-07): Steam's game log is the one answer to whether CS2 is open, and a join waiting for a slot ends the moment CS2 closes.

## 15. Constants

| Name                                | Value              | Used for                                              | Reason or evidence                                                                         |
| ----------------------------------- | ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `JOIN_LOOP_INTERVAL_MS`             | 200 ms             | pause after an iteration that sent nothing            | owner's change of 2025-06-15, from 500 ms; dropping it would gain about 0.1 s (2026-10-30) |
| `JOIN_RETRY_INTERVAL_MS`            | 400 ms             | pause after a connect                                 | "Give the game a moment to act on this attempt before the next one"; no measurement        |
| `MISSING_TIMEOUT_MS`                | 60 s               | target missing, and Steam failing, each in a row      | none recorded; the bar promises "a minute"                                                 |
| `JOIN_SUCCESS_DISPLAY_MS`           | 1.5 s              | JOINED shown before the attempt is cleared            | display only                                                                               |
| `JOIN_GSI_CONFIRM_MS`               | 15 s               | hold after a map load that followed the first connect | Steam confirming late; no measurement for the value                                        |
| `JOIN_LOAD_WINDOW_MS`               | 15 s               | label only: CONNECTING becomes WAITING                | map loads 3-12 s after an accepted connect (2026-10-25); refusals of 2026-11-04            |
| `JOIN_USED_TOKENS_MAX`              | 500                | cap of the used tokens                                | 87 connects in the journal of 10-25 to 11-06                                               |
| `CS2_LAUNCH_TIMEOUT_MS`             | 180 s              | launch deadline                                       | keeps a launch from polling forever; value unexplained                                     |
| `CS2_LOBBY_POLL_MS`                 | 3 s                | Steam asked for the menu after a launch               | fallback while GSI does not deliver                                                        |
| `REQUEST_TIMEOUT_MS`                | 10 s               | a hung request ends and counts as failed              | Steam answers well under a second                                                          |
| Steam client cache                  | 100 ms             | answers shared between callers                        | half a loop pause ([06](06-steam-web-api.md))                                              |
| `CASUAL_ROUNDS_TO_WIN`              | 8                  | match over                                            | journal 10-30, 10-31, 11-03; decided 2026-11-03                                            |
| `INTERRUPTIBLE_MODES`               | casual, deathmatch | modes a join may leave                                | section 4.5                                                                                |
| Steam game log, server changes kept | 200                | own-arrival look-ups                                  | `src/main/steam-game-log.js:130`                                                           |
| `JOIN_JOURNAL_CONFIG.MAX_BYTES`     | 5 MiB              | rotation                                              |                                                                                            |
| `FLUSH_MS`                          | 1 s                | journal buffer                                        |                                                                                            |
| `TRAIL_MS`                          | 60 s               | CS2's states noted after an attempt                   | "to see the join land"                                                                     |
| `MAX_LINES_PER_APPEND`              | 500                | batch cap, and flush at once                          |                                                                                            |
| `MAX_LINE_LENGTH`                   | 8 KiB              | per-line cap                                          |                                                                                            |

## 16. Smells and open questions

### Smells: accidental, duplicated or inconsistent

- **CS2's state is read three times in one iteration.** The map target, the loop and the "is joined" rule each read GSI at their own moment (`src/game/join-manager.js:280`, `:522`, `:324`). "Every decision below reads this snapshot" holds for Steam only. 1.0 should take one user state per iteration.
- **One fact, several answers.** "The user's server" is worked out in `resolveMapTarget` and again in `userLocation.getServerId`. "In CS2" is worked out in the loop, in `userLocation.isInCS2` and in `CS2Manager._userState`. Same rules, separate code, against the one-answer-per-fact rule.
- **`MISSING_TIMEOUT_MS` serves two budgets**, a missing target and a failing Steam. No reason is recorded for 60 s.
- **The 400 ms pause after a connect has no measurement.** With the token rule nothing can be resent, so the extra 200 ms only delays the next look.
- **`JOIN_GSI_CONFIRM_MS` has no measurement either.** Its 15 s equals `JOIN_LOAD_WINDOW_MS` and GSI's freshness window, perhaps by chance.
- **Friend-only texts on other targets.**
  - For a map, server or pinned attempt, missing means no known player left, yet the bar says "Left casual: waiting a minute for a return".
  - The launch overlay speaks of "joining your friend's game" for map joins too.
- **The bar shows one attempt even when several run**, and its Cancel reaches only that one. Its choice depends on the order ids were first used, since cancelled states keep their place.
- **The opener's answer is ignored.** A URL the host refuses, or that fails to open, is still journaled as a connect, and its token is marked used. The host answers "allowed" before the OS has opened anything.
- **A rejected credential keeps polling.** The loop does not consult the rejected-credential state that other pollers honour (`src/steam/credential-state.js`). An expired token costs a failed request every few hundred milliseconds, for a minute, per attempt.
- **Checks skipped during an outage.** While Steam fails, the CS2-closed and protected-match checks do not run. Nothing is sent, but an attempt outlives a closed CS2 until Steam answers or the budget ends, though the log needs no Steam.
- **Credentials are checked after the CS2 check.** With empty fields and CS2 closed, the launch is offered, and the start then fails silently. Start failures never reach the user.
- **Why an attempt ended is shown nowhere but the journal.** A `missing`, `no-answer`, `protected-match` or `cs2-closed` end just takes the bar down and gives the row its Join back. While Steam fails, the bar keeps its last text until the attempt ends.
- **A second launch question orphans the first.** While the join overlay is up, another join's question re-renders it. The first question's buttons are replaced and its answer never comes, so that attempt never starts.
- **Every credential change resets.** The daily token renewal for the same account resets every attempt and forgets the used tokens, so a new attempt may resend a token CS2 refused minutes before. Whether a same-account renewal should keep attempts and tokens is for the owner to decide.
- **Partial Steam failures look like a missing target.** For a map target with more than 99 players, a later chunk failing reads as fewer players, possibly as missing, not as unknown.
- **Map attempts are costly.** A map attempt asks about every player of every joinable server each iteration, one request per 100 ids, about twice a second.
- **The last connect is shared by all attempts.** With two attempts connecting close together, one attempt's own-arrival check uses the other's connect time.
- **Steam's log has 1 s resolution.** A server change logged in the same second as a connect, but before it (the user leaving a match by hand), counts as after it.
- **The self-check can distrust wrongly.** A join seen without a server change in the log, for instance the user already on the server while Steam lagged, makes the log untrusted until the next logged join.
- **The map load time only moves when the map name changes.** A move between two servers of the same map with no menu state in between leaves it unchanged: no hold, and the label may say "waiting" while CS2 moves. The fixtures always show a menu state in between; whether CS2 always posts one is unverified.
- **Outdated words.**
  - Some test names and comments still speak of a "new status" where the rule is now a new token. Gsi: "a new status during the hold gets its connect once the grace period ends", "after the grace period an unchanged status gets no second connect". Competitive comment: "The friend's new status is what earns the second connect".
  - The README ("join a friend in Casual or Deathmatch") and changelog 0.4.0 are outdated: deathmatch targets were dropped in `8d028f6` (2026-10-25), with no changelog entry.
  - [test-plan.md](../test-plan.md) says the fixture holds the two recorded joins of the own arrival and the match end. Those two are inline in `join-replay.test.js`, and the fixture holds the six other recordings (section 13).
- **Journal losses.**
  - One line over 8 KiB makes the whole batch refused, and its up to 500 lines are lost.
  - Records buffered when the app closes, up to 1 s of them, are lost: nothing flushes on close.
  - Records carry no format version.
- **Cancelled states pile up.** They stay in the attempt map until a reset. Harmless, but it grows with each target, and the bar's order depends on it.
- **The end of the JOINED display relies on the journal.** It calls the generic cancel, and the journal keeps `joined` only because it ignores a second end of the same id.
- **Training detection can misfire.** Training is "Steam's offline game has CS2's map and mode". While Steam lags, a real competitive match found on the same map right after training reads as training.

### Open questions and what is unverified in game

- **The 0.9.4 token rule in real joins.** By 2026-11-07 13:00 it had not met one. The `connect.why`, `skip` and `steam-log` records are to be read after the owner plays.
- **The `cs2-closed` end in game.** Not seen yet: CS2 closed while an attempt waits.
- **Joins under Electron 45 (0.9.2 and later).** None in the journal yet, background throttling included. The throttling was measured on 2026-11-03, before the upgrade.
- **A refused connect from inside a match.** Does Steam log a "Game server change" for leaving the old server? If so, the next token would be wrongly skipped as the user's arrival. This follows from the rule, not from a measurement: the 5 refusals of 2026-11-05/06 logged no change, but whether any of them was sent from inside a match is not known.
- **Slots without a visible change, and resending.**
  - Can a slot open with no visible change? On 2026-11-04 the owner's friends said slots opened while Steam showed no change in 38 s.
  - Would resending the same token catch short-lived slots? Untested.
  - The owner chose never to resend. An experiment would need a fixed period, against the signals-over-waits rule, and resends would have to stay in the menu, since the loop may run while the user plays casual.
- **Deferred or refused?** CS2 deferred connects sent while it was connecting (`f92e01b`, "Executing deferred gcconnect"). On 2026-10-26 a second gcconnect during loading was answered at once and refused. Both were seen; the conditions that separate them are unknown.
- **A protected match while it loads.** A match accepted from the menu most likely shows as the menu in GSI until its map loads, as casual joins do, and Steam's copy lags. A connect in that window could then leave it. Neither that nor what CS2 does with a gcconnect while loading a competitive match has been checked.
- **A server join whose server changes map.** Its players must still be on the clicked map, so it ends as missing once the match is over and the server loads another map. Intended, or should a server join follow the server?
- **Lag at match end.** How long other players' presence lags at match end was not measured: the token had expired, and few players were online that morning.
- **What 1.0 should decide:**
  - whether the used tokens survive a credential renewal or a restart;
  - whether the bar lists every running attempt;
  - whether a start checks the credentials before offering a launch, and tells the user why it failed;
  - whether the loop stops for a rejected credential at once;
  - whether the journal keeps today's record shapes, so old and new journals can be read together;
  - reasons, or event signals, for the unexplained constants: `MISSING_TIMEOUT_MS`, `JOIN_RETRY_INTERVAL_MS`, `JOIN_GSI_CONFIRM_MS`, `CS2_LAUNCH_TIMEOUT_MS`.
