# 05. CS2, GSI and Steam on this computer

What the app learns on the user's own PC, without the network:

- where Steam and CS2 are installed;
- what CS2 itself reports through Game State Integration (GSI);
- from Steam's own game log, whether CS2 runs at all, and when CS2 changed game server;
- where the user plays, merged from these and the user's Steam presence;
- how CS2 is launched, and how joins are handed to the Steam client.

None of it asks the player for anything. The app writes the GSI cfg itself and reads only files Steam writes on its own (the owner's rule, see [working rules](../working-rules.md)).

How to read this document:

- Every rule is a requirement for 1.0 unless section 13 lists it as a smell. "Now" names how 0.9.7 does it, as evidence, not as a design to copy.
- `path:line` references point at the 0.9.7 code, commit `4f1b311`. Quoted test names come from `__tests__/` and state intended behaviour.
- Dated facts come from the research notes of 2026-10-24 to 11-07 and from the join journal. Where the code now differs from a note, this document follows the code and says so.
- Neighbours: joining in [03](03-joining.md), maps in [04](04-maps.md), the user's Steam presence and the Web API in [06](06-steam-web-api.md), links, permissions and the window in [07](07-ui-shell-security-and-updates.md), Steam's coplay file in [08](08-coplay-candidates.md).

## 1. One owner per fact

On 2026-11-07 the owner found GSI, the Web API and a new log check each deciding "is CS2 open" in their own way, and asked for one answer: "надо привести к одному решению". 1.0 keeps one owner per fact, and everything else asks that owner.

| Fact                                                  | Decided by                                                        | Stands in while the owner cannot tell                                | Section |
| ----------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------- |
| CS2 runs on this PC                                   | Steam's game log                                                  | a fresh GSI post means yes; then the user's Steam presence (`inCS2`) | 7       |
| What CS2 does: menu or match, map, mode, phase, score | GSI, while fresh and from the entered account                     | the user's Steam presence, which lags                                | 5       |
| Which account CS2 runs on                             | GSI `provider.steamid`                                            | nothing                                                              | 5.5     |
| Which server the user is on                           | the user's Steam presence (server id); GSI in the menu means none | nothing                                                              | 9       |
| The user's CS2 changed server since a connect         | Steam's game log, while trusted                                   | nothing: every new join token then counts as someone else's          | 8       |
| CS2 reached its menu after a launch                   | GSI posting the menu                                              | Steam presence `game_state` `lobby`, asked every 3 s                 | 10.2    |

Why the log, not GSI, says whether CS2 runs. The owner asked why GSI alone cannot tell:

- GSI has no closing event. It only falls silent, and silence shows only after three missed heartbeats, 15 s.
- Silence also means other things: CS2 still starting, CS2 open on an older cfg, or GSI not set up.
- Steam's Web API shows a start or an end 1 to 1.5 s after the Steam client does (measured 2026-10-25), only between polls, and only to a working token.
- Steam writes its log line the moment the process starts or ends, with no token and no network.

Before 0.9.7, GSI's silence was the only close signal. A join waiting for a slot ended only once CS2's last state was 15 s old, and a connect in that window could start CS2 again (CHANGELOG 0.9.7, Fixed).

## 2. Files read and written

| What                                       | Where                                                         | Access                         | Section |
| ------------------------------------------ | ------------------------------------------------------------- | ------------------------------ | ------- |
| Steam's install path                       | registry, `HKCU` and `HKLM` `...\Valve\Steam`                 | read                           | 3       |
| Steam's libraries                          | `<Steam>\steamapps\libraryfolders.vdf`                        | read                           | 3       |
| CS2's manifest                             | `<library>\steamapps\appmanifest_730.acf`                     | read                           | 3       |
| GSI token and port                         | `%APPDATA%\cs2-casual-enjoyer\gsi.json`                       | read; written when they change | 4.1     |
| GSI cfg                                    | `<CS2>\game\csgo\cfg\gamestate_integration_casualenjoyer.cfg` | written when its text changes  | 4.3     |
| Steam's game log                           | `<Steam>\logs\gameprocess_log.txt`                            | read only                      | 7, 8    |
| Journal records `gsi`, `steam-log`, `skip` | `%APPDATA%\cs2-casual-enjoyer\join-journal.log`               | appended ([03](03-joining.md)) | 5.7, 8  |

The app writes nothing else into Steam's or CS2's folders, and never creates a folder there.

## 3. Finding Steam and CS2

The user sees none of this, unless CS2 is not found: the footer then reads "GSI off" (section 6).

### Steam's folder

- Only on Windows; elsewhere there is none (`src/main/cs2-locator.js:239`).
- The first of these that names an existing folder wins (`cs2-locator.js:11-15, 238-249`):
  1. `HKCU\Software\Valve\Steam`, value `SteamPath`;
  2. `HKLM\SOFTWARE\WOW6432Node\Valve\Steam`, value `InstallPath`;
  3. `HKLM\SOFTWARE\Valve\Steam`, value `InstallPath`;
  4. the folders `C:\Program Files (x86)\Steam`, then `C:\Program Files\Steam`.
- A registry value is normalised to Windows separators.
- The registry is read without running a program found by its bare name. Node looks for a bare name in the working directory before `PATH`, so a `reg.exe` dropped beside the app, in Downloads say, would run in its place (`cs2-locator.js:196-209`). Now: `%SystemRoot%\System32\reg.exe query <key> /v <name>`, or the same under `%windir%`, or `C:\Windows`; hidden, with a 5 s timeout; the value is the text after `REG_<type>` on the line naming it; any failure means "not there" (`cs2-locator.js:217-232`).
- The same folder holds Steam's game log (section 7) and, in 1.0, the coplay file ([08](08-coplay-candidates.md)). It is to be found once and shared; now it is found twice per start (smell S1).

### CS2's folder

- Libraries come from `<Steam>\steamapps\libraryfolders.vdf`, block `libraryfolders` (`cs2-locator.js:138-170`):
  - only numeric keys count;
  - an entry is a block with `path` and `apps`, or a bare path string, as older Steam clients wrote it;
  - order: the libraries whose `apps` lists `730`, then the Steam folder itself, then the rest;
  - duplicates are dropped, compared as resolved paths, ignoring case;
  - without the file, the Steam folder is the only library.
- In each library, in that order (`cs2-locator.js:177-194`):
  - read `steamapps\appmanifest_730.acf`; without it, go on to the next library;
  - the folder name is `AppState` → `installdir`, or `Counter-Strike Global Offensive` when that is missing;
  - the candidate is `<library>\steamapps\common\<installdir>`, and it counts only if `<candidate>\game\csgo` is a folder;
  - the first that counts is CS2's folder.
- Valve's KeyValues text is parsed leniently (`cs2-locator.js:17-105`):
  - quoted strings with the escapes `\n`, `\t`, `\\` and `\"`; any other escaped character stands for itself;
  - bare words, braces, and `//` comments to the end of the line;
  - keys are matched ignoring case, as Steam does; of two equal keys the later wins;
  - broken input gives whatever parsed before the break.
- CS2's folder is looked up once per app start, by the GSI setup (section 4); Steam's folder also by the game log reader (section 7).

### Edge cases

- No Steam: no CS2 folder, so GSI reports `cs2-not-found`, and Steam's game log is unusable for the run.
- A registry that cannot be read, or names a missing folder: the fixed folders are tried.
- A manifest whose game folder is gone is skipped.
- Two CS2 installs: the first in library order gets the cfg. A CS2 started from the other never posts (Q15).
- Steam or CS2 installed, or a library moved, while the app runs: not seen until the next start (smell S2).

Tests, `gsi-main.test.js`: "parses nested blocks, escapes and comments"; "tolerates broken input"; "names the system reg.exe rather than whichever one is found first"; "finds CS2 in the library that lists app 730"; "finds CS2 in the Steam folder itself without libraryfolders.vdf"; "returns null when no library holds CS2"; "ignores a manifest whose game folder is gone".

## 4. GSI setup

The user does nothing for it; the footer shows how it went (section 6). The first time the cfg is written, a CS2 that was open already has to be restarted once.

### 4.1 Token and port: `gsi.json`

Kept in `%APPDATA%\cs2-casual-enjoyer\gsi.json` (`src/main/main.js:16`), with two-space indentation, in UTF-8, without a final newline (`src/main/gsi-service.js:136-138`):

```json
{
  "token": "<32 lowercase hex digits>",
  "port": 47731
}
```

- Read at start (`gsi-service.js:120-130`):
  - a token that is not 32 lowercase hex digits is dropped;
  - a port that is not an integer is dropped; there is no range check (smell S3);
  - a missing or broken file counts as empty.
- The token is the stored one, or else 16 bytes from a cryptographic random source, as hex (`gsi-service.js:78`). It is kept only in this file and in the cfg, and is never logged.
- The port tried first is the stored one, or else 47731 (`GSI_CONFIG.DEFAULT_PORT`, `src/shared/constants.js:56`). No reason is recorded for that number.
- The file is written after the endpoint listens, and only when the token or the port in use differs from the stored ones (`gsi-service.js:86-93`). A failed write is logged and is not fatal: GSI works this run, and the next run starts with a new token and rewrites the cfg (smell S4).
- Why: CS2 keeps using the cfg it read at its own start, so token and port have to stay the same across restarts and updates of the app (`gsi-service.js:12-18`). On 2026-11-07 the owner's cfg still had its write time of 2026-10-25 and port 47731. 1.0 takes this file over, see [migration](../migration.md).

### 4.2 The endpoint

- HTTP, bound to the IPv4 loopback address only (`GSI_CONFIG.HOST`, `constants.js:55`).
- Port (`src/main/gsi-server.js:94-115`):
  - the stored or default port first;
  - while a port is in use, the next one, ten ports in all (`PORT_ATTEMPTS`, `constants.js:57-58`): 47731 to 47740 by default;
  - any other error, or ten ports in use, fails the setup (`error`);
  - the port it got is the one saved and written into the cfg.
- Each request, checked in this order (`gsi-server.js:36-79`):
  1. not POST: 405;
  2. a body over 256 KiB (`MAX_BODY_BYTES`, `constants.js:63`): 413 with `Connection: close`; the rest is drained, and nothing goes on;
  3. a body that is not JSON: 400;
  4. `auth.token` missing or wrong: 401, so that another local program cannot feed the app a made-up game state (`gsi-server.js:29-31`);
  5. otherwise 200 at once, and the state without its `auth` block goes on to the app.
- Path and headers are not checked; the token is the only key.
- Every accepted state reaches the user state at once (now pushed to the window as `gsi-state`, `main.js:324-331`).
- The endpoint closes when the app quits (`main.js:354-358`, `gsi-service.js:63-68`).

### 4.3 The cfg

- Written to `<CS2>\game\csgo\cfg\gamestate_integration_casualenjoyer.cfg` (`GSI_CONFIG.CFG_FILE_NAME`, `constants.js:54`).
- The app never creates a folder inside the game. A missing `cfg` folder means this is not a usable CS2 installation, and the setup fails loudly instead (`src/main/gsi-config.js:58-60`).
- Its exact text is below (`gsi-config.js:12-37`):
  - the indents and gaps are tab characters: one tab between a key and its value, two after `"uri"` and after `"map"`;
  - lines end in CR LF, the last one too; UTF-8 without a byte-order mark;
  - the host is `127.0.0.1` (`GSI_CONFIG.HOST`), the loopback address the endpoint binds to; `<port>` is the port in use and `<token>` the token.

```
"Casual Enjoyer"
{
	"uri"		"http://127.0.0.1:<port>"
	"timeout"	"5.0"
	"buffer"	"0.1"
	"throttle"	"0.5"
	"heartbeat"	"5.0"
	"auth"
	{
		"token"	"<token>"
	}
	"data"
	{
		"provider"	"1"
		"map"		"1"
		"player_id"	"1"
		"player_state"	"1"
		"allplayers_id"	"1"
	}
}
```

- Its parts:
  - `"Casual Enjoyer"` names the service (`GSI_CONFIG.SERVICE_NAME`).
  - `heartbeat` 5 s is what freshness rests on: three heartbeats make `FRESH_MS` (section 5.3).
  - `timeout` 5.0, `buffer` 0.1 and `throttle` 0.5 carry no recorded reason. In Valve's GSI documentation for CS:GO, not checked for CS2: the game waits up to `timeout` seconds for an answer and sends nothing while a post is unanswered; it gathers changes for `buffer` seconds; it leaves at least `throttle` seconds after an answer before the next post; and it posts `heartbeat` seconds after an answer even when nothing changed.
  - `allplayers_id` is asked since commit `0320549`, for the seeds (section 5.6). Nothing reads `player_state` (smell S10).
- Written only when the file's text differs from this text, compared exactly; otherwise left alone (`gsi-config.js:47-62`). Whether it was written this run is kept as `changed`.
- A cfg written this run is unknown to a CS2 that was open already: CS2 reads these files only at its start. That is the code's premise (`gsi-config.js:39-42`), not recorded as measured in CS2 (Q12).
- A cfg rewritten with the same endpoint and token keeps a running CS2 posting. That CS2 keeps the data list it read until it restarts.

### 4.4 Order and outcome

The setup runs once per app run, in this order (`gsi-service.js:75-114`):

1. read `gsi.json` and settle the token;
2. start the endpoint and settle the port;
3. save `gsi.json` if either changed;
4. find CS2 (section 3);
5. write the cfg if its text changed.

| Outcome         | When                                                                               | Carries                      |
| --------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| `ready`         | every step done                                                                    | `port`, `cfgPath`, `changed` |
| `cs2-not-found` | no CS2 folder; the endpoint listens anyway                                         | `port`                       |
| `error`         | any step failed: ports in use, no cfg folder, a write refused, a lookup that threw | nothing                      |

- Later questions get the same outcome; one asked before the setup started gets `error` (`gsi-service.js:46-57`).
- Nothing waits for the setup. GSI is optional, and every reader falls back to Steam's Web API without it (`main.js:324-331`, `src/core/app.js:226-232`).
- The window asks for the outcome once when it loads, and the answer comes once the setup has finished (now IPC `gsi-get-status`, `main.js:198`, `src/main/preload.cjs:96-115`).
- Type: `GsiSetupStatus` (`src/shared/types.js:128-135`).

Tests, `gsi-main.test.js`: "points CS2 at the endpoint with the token"; "writes the cfg once and rewrites it only when it changes"; "never creates the cfg folder"; "passes on a state carrying the token, without the token"; "rejects %s" (a wrong token, no token, invalid JSON); "rejects other methods"; "rejects a body over the limit"; "moves to the next port when the preferred one is taken"; "starts the endpoint, writes the cfg and forwards states"; "keeps the token and port across restarts, so the cfg stays valid"; "reports a missing CS2 installation"; "reports an error instead of throwing"; "getStatus before start reports an error".

## 5. What the app reads from GSI

### 5.1 Fields

| Field                                   | Read as                                                          | Used by                                              |
| --------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| `auth.token`                            | must equal the token; removed before anything else sees the post | the endpoint                                         |
| `provider.steamid`                      | the account CS2 runs on                                          | the account check; left out of the players CS2 shows |
| `map`, with a non-empty `map.name`      | the user is on a server with a map loaded                        | everything below                                     |
| `map.name`                              | the map code, such as `de_dust2`                                 | location, keeper, joins, map load time               |
| `map.mode`                              | `casual`, `competitive`, `deathmatch` and others                 | protected match, location, keeper, seeds, map joins  |
| `map.phase`                             | `warmup`, `live`, `intermission`, `gameover`                     | only `gameover` decides anything: the match is over  |
| `map.team_ct.score`, `map.team_t.score` | rounds each side has won, taken only when both are integers      | the keeper's match point ([04](04-maps.md))          |
| `map.round`                             | as sent                                                          | the join journal only                                |
| `player.steamid`                        | the observed player, when it is not the user                     | seeds                                                |
| `player.activity`                       | `menu`, `playing`, `textinput`                                   | kept, decides nothing; the journal                   |
| `player.team`                           | as sent                                                          | the join journal only                                |
| keys of `allplayers`                    | the SteamID64s of the players CS2 lists                          | seeds; their count goes to the journal               |

- The score names were read from CS2's `client.dll` on 2026-11-07. Whether casual posts carry them is unverified (Q2); without them the keeper polls as before.
- `client.dll`'s `player_id` block also has `xpoverload`, beside the clan and the observer slot; its meaning was not checked (2026-11-04). Nothing in GSI names Prime.

### 5.2 The user state

From the latest fresh post of the entered account (`src/game/gsi-manager.js:32-55`; type `GsiUserState`, `types.js:103-115`):

- `steamId`: `provider.steamid`, or none.
- `inMatch`: the post has a map block with a non-empty name. `inMenu` is its opposite.
  - The menu covers loading too. GSI has no loading phase: it posts menu heartbeats until the map has loaded, 4 to 12 s after a connect (measured 2026-10-25).
  - CS2's pause menu on a server still counts as a match.
- `mode`, `mapName`, `phase`: from the map block, in a match only, and only when they are strings.
- `score`: `{ct, t}` when both team scores are integers, else none.
- `activity`: `player.activity`, or none.
- `inProtectedMatch`: in a match whose mode is neither `casual` nor `deathmatch` (`INTERRUPTIBLE_MODES`, `constants.js:190-196`). A join never pulls the user out of such a match ([03](03-joining.md)).
  - A match without a mode counts as protected (smell S11).
  - GSI cannot tell offline training from a real match; the join loop asks the user's Steam presence for that.
- `mapLoadedAt`: section 5.4.

At match end GSI said `gameover` after round 10 (8:2) and after round 15, and the same server loaded its next map within about 15 s (journal, 10-30, 10-31 and 11-03). A casual match ends when a side wins 8 rounds (`CASUAL_ROUNDS_TO_WIN`, `constants.js:198-203`).

Tests, `gsi-manager.test.js`: "reads the main menu from a state without a map"; "reads the rounds each side has won, when CS2 gives them"; "reads a casual match"; "a %s match is one a join must not interrupt" (competitive, premier, scrimcomp2v2, rush, custom); "a %s match may be left for a join" (casual, deathmatch); "the pause menu on a server still counts as a match"; "tolerates missing blocks"; "ignores payloads that are not objects"; "has no state before CS2 posted anything".

### 5.3 Freshness

A post counts, whatever its account, while both hold (`gsi-manager.js:144-150`):

- it came at most `FRESH_MS` = 15,000 ms ago (`constants.js:60-62`). CS2 posts at least once per heartbeat, so a state older than three heartbeats means it stopped posting: closed, crashed or stuck;
- Steam's game log, while it answers, does not show CS2 closed in or after the second the post came (section 7.5). Nothing comes from a closed CS2, so a post in the very second of a logged exit came before it.

Rules:

- Silence proves nothing: CS2 may be closed, loading, or still on an older cfg. Without a fresh post every reader falls back to the user's Steam presence (`gsi-manager.js:57-65`).
- Listeners hear every accepted post, the moment the last one goes stale, and every change of the CS2-open answer (`gsi-manager.js:90-92, 289-295`). Now a timer fires 15,001 ms after each post, since nothing else marks the silence.
- A listener that fails does not stop the others.
- Every accepted post, of any account, tells the owner of "CS2 runs" that it does (section 7.5).

Tests, `gsi-manager.test.js`: "keeps the state while fresh and drops it once CS2 goes quiet"; "notifies listeners on every state and once CS2 goes quiet"; "a failing listener does not stop the others"; "CS2's last state stops counting the moment the log has CS2 closed"; "a CS2 closed in the very second it posted counts as closed after posting".

### 5.4 When the map loaded

- `mapLoadedAt` becomes a post's arrival time when the post is in a match and the post before it was not fresh, not in a match, or on another map (`gsi-manager.js:117-137`).
- Otherwise it stays as it was, also while CS2 is silent. It starts at 0.
- So a map reported after silence, or after a logged close, counts as a new load.
- The join loop holds further connects for `JOIN_GSI_CONFIRM_MS` (15 s) after a map loaded since its first connect, and shows "waiting for a slot" once a sent token has gone `JOIN_LOAD_WINDOW_MS` (15 s) without a map load (`src/game/join-manager.js:139-146, 636-650`, `constants.js:20-28`; [03](03-joining.md)). Both rest on CS2 loading an accepted connect's map in 3 to 12 s (measured 2026-10-25).

Tests: `gsi-manager.test.js` "records when a map loads and keeps it while the map stays"; "a map reported after CS2 went quiet counts as a new load". `join-manager-gsi.test.js` "holds connects once CS2 loads a map, until Steam confirms the server"; "a map loaded before the first connect does not hold anything".

### 5.5 The account

- The expected account is the SteamID64 in the account field at that moment (`app.js:228-229`). While the field holds no valid SteamID64 (17 digits), nothing is checked.
- A fresh post from another account gives no user state: every reader acts as if there were no GSI, and the footer says "CS2 on another account" (`gsi-manager.js:158-164, 275-283`).
- Steam's game log knows no account (Q1).

Tests: `gsi-manager.test.js` "ignores a state from another Steam account"; "skips the account check while no valid SteamID64 is entered". `cs2-manager.test.js` "asks Steam when CS2 runs on another account".

### 5.6 The players CS2 shows

- **Observed player**: while the last post is fresh, `player.steamid` when it is a valid SteamID64 other than `provider.steamid` (`gsi-manager.js:173-181`). CS2 shows another player there while the user spectates, after dying in casual for one, and that player is on the user's server.
- **Listed players**: while fresh, every key of `allplayers` that is a valid SteamID64, the user's own left out (`gsi-manager.js:190-198`). Valve documents the list for observers and GOTV only, so it is often absent.
- Neither checks the account. The map finder takes them only while the user state's mode is `casual`, and asks Steam about them at once, from any tab (`src/game/map-finder.js:286-310`; [04](04-maps.md)). Smell S8.
- Measured, with the cfg asking for `allplayers_id`:
  - 2026-10-25, official casual: 19 players were listed once, for about 3 s, at 23:43:19. The owner was watching a CT player then, and says they went into the spectator team once in that match. Every other post listed none, through team select, play, and spectating teammates after death. At most 3 of the 19 reached the pool; the rest most likely hide their game details.
  - Whole lists came in warmup and free spectating: 10-26 at 23:43, 10-29 at 23:33 (Dust II warmup, 12 to 16 players), 10-30 at 01:12 (Mirage warmup, 10 players). None came while the owner spectated teammates after death (10-27).
- That scarcity is why 1.0 adds Steam's coplay list as a source ([08](08-coplay-candidates.md)).

Tests: `gsi-manager.test.js` "lists every player CS2 reports, the user left out"; "lists nobody when CS2 sends no player list". `map-finder.test.js` "the player the user spectates becomes a seed"; "every player CS2 lists becomes a seed"; "in another mode are not asked about".

### 5.7 GSI in the join journal

- A new post becomes a `gsi` record while an attempt runs and for 60 s after one ends (`JOIN_JOURNAL_CONFIG.TRAIL_MS`); otherwise only when the number of listed players changes (`src/game/join-journal.js:119-142`).
- Fields: `map`, `mode`, `phase`, `round`, `activity`, `player` (the observed SteamID64), `team`, `listed` (a count). They come from the last raw post, whatever its account (smell S9).
- Most timing facts in this document come from these records. The journal itself is in [03](03-joining.md).

## 6. The footer's GSI status

The user sees a dot and a short label at the left of the footer, saying whether the app hears from CS2; the tooltip explains it and says what to do. Only "Waiting for CS2" can be pressed: it offers to launch CS2 (section 10.5).

| State           | When                                                                                                                                                  | Label, en / ru                                  | Dot    | Tooltip, en                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `active`        | a fresh post from the entered account, or with no valid account entered                                                                               | CS2 connected / CS2 на связи                    | green  | CS2 Game State Integration is connected: the app gets your game state straight from CS2.                                           |
| `other-account` | a fresh post from another account                                                                                                                     | CS2 on another account / CS2 на другом аккаунте | yellow | CS2 is running on a different Steam account than the one entered here, so its game state is ignored.                               |
| `restart`       | no fresh post, setup `ready`, cfg written this run, nothing posted this run, and the log does not say that the CS2 open at the app's start has closed | Restart CS2 / Перезапусти CS2                   | yellow | CS2 Game State Integration was just set up, and the open CS2 reads it only after a restart. Restart CS2 once.                      |
| `waiting`       | no fresh post, setup `ready` and no restart needed; or no outcome yet                                                                                 | Waiting for CS2 / Ждём CS2                      | grey   | CS2 Game State Integration is set up and connects when CS2 starts. While it offers the launch, a second line: Click to launch CS2. |
| `unavailable`   | no fresh post and CS2 not found; or no GSI service at all                                                                                             | GSI off / GSI выключен                          | red    | CS2 installation not found, so Game State Integration is off. The app uses the Steam Web API instead.                              |
| `error`         | no fresh post and the setup failed                                                                                                                    | GSI error / Ошибка GSI                          | red    | Could not set up CS2 Game State Integration. The app uses the Steam Web API instead.                                               |

Texts: `src/i18n/locales/en.js:318-340`, `ru.js:323-345`.

Rules (`gsi-manager.js:205-224, 261-268`):

- A fresh post wins over the setup outcome. A CS2 posting through a cfg from an earlier run shows `active` even when CS2's folder is not found now.
- `restart` asks only while a restart can matter:
  - the log says a CS2 open at the app's start still runs: `restart`;
  - the log cannot tell: `restart`, which is harmless;
  - the log says no such CS2 runs, because it closed or there never was one: `waiting`. A CS2 started after the app reads the new cfg, so its start does not bring `restart` back;
  - once anything has posted this run, of any account, never `restart` again: that CS2 has read the cfg.
- An unchanged cfg never asks for a restart.
- The status is drawn again on every GSI change, every change of the CS2-open answer, and every language switch. Its first drawing after the setup outcome waits for the log's first answer, so it knows at once whether to ask for a restart (`gsi-manager.js:105-109`).
- Only `waiting` is a control (`src/ui/gsi-status-indicator.js:20-24, 72-111`):
  - it is a button in the Tab order. The other states are plain text, out of the Tab order, and ignore clicks and keys;
  - Enter acts on key down, without auto-repeat, and Space on key up, as on a real button. Neither key goes on to the page: Space would scroll it, and Enter would press the Launch button the offer moves the keyboard to;
  - a press checks the state again first, since CS2 may have posted since the last drawing;
  - while the offer asks whether CS2 runs, the status reads as busy (`aria-busy`, a progress cursor).
- The dot's colour follows the state: green connected, grey waiting, yellow something the user can fix, red GSI off (`css/gsi-status.css:23-39`). The palette is Steam's ([07](07-ui-shell-security-and-updates.md)).

Why:

- GSI and the launch offer of "Waiting for CS2" came in 0.9.0.
- Since 0.9.7 the footer asks for a restart only while a CS2 opened before the app still runs, and says "Waiting for CS2" with CS2 closed, as on a first start (CHANGELOG 0.9.7, Fixed). Before, any cfg written in a run asked for a restart until CS2 posted.
- In a hidden-window run under Electron 45 on a copy of the owner's log, with lines appended to the copy (2026-11-07), the status showed `restart` with CS2 open since before, and "Ждём CS2" 0.8 s after the exit lines were added. It has not been seen on a real first install (Q4).

Tests: `gsi-manager.test.js` "the indicator follows the setup status until CS2 posts"; "after CS2 has posted once, quiet means waiting rather than restart"; "initialize subscribes to the bridge and reads the setup status"; "initialize without the bridge leaves GSI unavailable"; "a new cfg asks for a restart only while the CS2 open at the app's start still is"; "a new cfg with CS2 closed waits for CS2, with no call for a restart"; "a new cfg with a CS2 started after the app's start waits for its first state"; "without the log a new cfg asks for the restart, as before". `gsi-status-indicator.test.js` "is a button whose tooltip says it launches CS2"; "%s opens the offer from the keyboard" (Enter, Space); "a click after CS2 has moved the state on offers nothing"; "%s stays plain text: no click or key offers a launch" (active, other-account, restart, unavailable, error).

## 7. Is CS2 open: Steam's game log

The user never sees the log, only what follows from it: the restart call going away when the old CS2 closes, a waiting join ending the moment CS2 closes, the launch offer or "CS2 Is Already Running", and the Maps list polling only while someone can watch it.

### 7.1 The file and its lines

- `<Steam>\logs\gameprocess_log.txt`, with Steam's folder as in section 3 (`src/main/steam-game-log.js:100-103`). Steam writes it with no launch option.
- Every line starts with a local-time stamp to the second, `[YYYY-MM-DD HH:MM:SS] `. Lines end in LF or CR LF.
- The lines that matter, after the stamp (`steam-game-log.js:26-38, 72-94`):

| Kind               | Text                                              | What follows it                                                  |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------------- |
| CS2 starts         | `AppID 730 adding PID <pid> as a tracked process` | the quoted path of `cs2.exe` and its arguments, such as `-steam` |
| CS2 ends           | `AppID 730 no longer tracking PID <pid>`          | `, exit code <n>`                                                |
| No CS2 left        | `Remove 730 from running list`                    | nothing                                                          |
| Steam starts       | `Client version: `                                | Steam's build number                                             |
| CS2 changed server | `SSGL: Game server change [730]`                  | nothing (section 8)                                              |

- Lines of other games, under another app id, and Steam's other lines are ignored, `SSGL: persona state flags` among them.
- The owner's log of 2026-02-04 to 11-07 (662 KB) held 146 starts and 146 ends, all of `cs2.exe`. Each end was a "CS2 ends" line plus "No CS2 left" (2026-11-07).
- Steam's logs say nothing of a server's type, of Prime or of players (2026-11-06).

### 7.2 Reading it

- The file is found once, at the app's start. Without Steam's folder, or without a readable file then, the log is unusable for the whole run (`steam-game-log.js:171-210`).
- **Read-back at start.** The app reads the last 1 MiB of the file, or all of a smaller one (`TAIL_BYTES`, `steam-game-log.js:43-46, 178-199`):
  - whole lines only, up to the last line break. When the read began inside the file, its first, partial line is dropped;
  - only CS2's process lines are taken (section 7.3), to know which CS2 runs as the app starts;
  - server changes in it are not taken: only those from now on can follow a connect of this run (section 8);
  - the position after the last whole line is kept. A line Steam was still writing is read in full later, and a start line read that way counts as written after the app's start;
  - why 1 MiB: a CS2 session adds a few dozen lines, and the owner's log held 662 KB for nine months.
- The read-back runs before any join can start (`main.js:304-308`). A question asked before it has finished waits for it.
- **Later reads** go from the kept position to the end of the file (`steam-game-log.js:322-357`):
  - lines split at LF or CR LF; an unfinished last line waits for the next read;
  - server-change lines are kept, the newest 200 (`maxChanges`, `steam-game-log.js:130`); every other line goes to process tracking;
  - a file shorter than the kept position, or another file under the same name (another file id), means Steam started the file anew; it is read from its beginning.
- Bytes are taken one character per byte (Latin-1). All that is parsed is ASCII; the command line, which may hold a path in any language, is never parsed.
- Reads never overlap. Each waits for the one before it, since two at once would take the same lines (`steam-game-log.js:159-160, 312-316`).
- A read happens at start, on each look that finds the file changed (section 7.4), and whenever the core asks for an answer that cannot wait (sections 7.5 and 8).

Tests, `steam-game-log.test.js`: "keeps reading from where the last read stopped"; "a line Steam has not finished writing counts once it has"; "a file Steam starts anew is read from its beginning"; "Steam's line ends may be Windows ones"; "a start line Steam is still writing at the app's start is read once it is whole".

### 7.3 Following CS2's processes

Per line (`steam-game-log.js:364-399`):

- **CS2 starts**, with a PID and a second: that PID runs from that second.
- **CS2 ends**, with a PID and a second: that PID no longer runs. It no longer counts as one that ran at the app's start either, since a later process may get the same PID. The last exit becomes this second, if later.
- **No CS2 left**: if a PID was still tracked, the last exit becomes this second, if later. Then none runs, and none counts as from the app's start. Steam writes it right after the process's own end.
- **Steam starts**: none runs, and none counts as from the app's start, since nothing the old Steam tracked runs under the new one. No exit is noted.
- Every kind but "Steam starts" marks the log as having shown CS2 (`seen`).
- When the read-back is done, the PIDs that run are the ones "from the app's start" (`steam-game-log.js:196`).

The state the log gives (`Cs2ProcessState`, `types.js:117-126`; `steam-game-log.js:296-305`):

| Field          | Meaning                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `usable`       | the log could be read                                                                                      |
| `seen`         | the log has shown CS2 starting or ending, in the read-back or since                                        |
| `running`      | at least one CS2 PID runs                                                                                  |
| `fromAppStart` | a PID that ran at the app's start still runs                                                               |
| `startedAt`    | the start of the newest running PID, epoch ms of its second, 0 if none runs; no reader uses it (smell S10) |
| `exitedAt`     | the last exit, epoch ms of its second, 0 if none was seen                                                  |

Without a log: `usable` false, and the rest false or 0.

Tests, `steam-game-log.test.js`: "reads CS2 starting and ending, and Steam itself starting"; "ignores other games and Steam's other lines"; "a CS2 open when the app starts is read back from what Steam logged"; "CS2 closing after the app's start leaves none open, and none from before"; "a CS2 started after the app's start is open, but is not one from before"; "a PID that comes back for a later CS2 is not the one from before"; "a log that has never shown CS2 says so"; "Steam starting again leaves nothing of what it tracked before"; "without Steam, or without its log, CS2's process is unknown".

### 7.4 The look, once a second

- Every `LOOK_MS` = 1000 ms the app checks the file's size and id, one `stat` (`steam-game-log.js:48-52, 255-282`). Only when either changed since the last look does it read the new lines and work out the state. When the state differs in any field from the last one it told, it tells the new one. The first look always reads.
- A look that fails, with the file gone for a moment or Steam starting it anew, is skipped; the next one tries again. Looks never overlap.
- With the log unusable at start, there is no look this run.
- Why a look rather than file events: watching Steam's logs folder gave no event in four minutes while Steam appended to two of its logs (2026-11-07). Windows reports nothing for files Steam keeps open. A look is one stat of a local file, and Steam's stamps carry whole seconds, so looking more often gains nothing. The owner was told of this 1 s as the one number of the design; no objection is recorded.
- The look runs where timers keep their pace while CS2 covers the window; now that is the main process. A covered page stretched 200 ms waits to 1000 ms, and after 5 minutes woke about once a minute (measured 2026-11-03, see [01](01-overview.md)).
- In the hidden-window run of 2026-11-07, a start appended to the copy of the log was heard within 1 s.

Tests, `steam-game-log.test.js`: "watch tells each change of CS2's process once, and nothing else".

### 7.5 The answer, and when to trust it

One module owns the answer (now `src/game/cs2-process.js`). It hears every state the look tells, and reads the log at once when asked.

- It answers only while the log is usable, has shown CS2, and is trusted; otherwise it says it cannot tell (`cs2-process.js:153-155`).
  - Why "has shown CS2": until it has, the log's silence says nothing, since a Steam that wrote these lines some other way would look the same (`steam-game-log.js:155-158`).
- Its questions:
  - **Is CS2 open?** Yes, no, or cannot tell (`cs2-process.js:72-74`).
  - **Is CS2 open now?** The same, after reading the log at once, for an answer that cannot wait for the next look (`cs2-process.js:63-66`).
  - **Has CS2 closed since a moment, and not opened again?** True only when it answers, none runs, an exit was seen, and that exit is in or after the moment's second (`cs2-process.js:83-90`).
  - **Does a CS2 open at the app's start still run?** Yes, no, or cannot tell (`cs2-process.js:97-99`).
- **A contradiction.** On every GSI post, of any account (`gsi-manager.js:134-135`), while the answer is "closed" (`cs2-process.js:101-118`):
  1. read the log again, since a look may be under way;
  2. if CS2 now runs, or the log cannot tell, stop;
  3. if the last exit is in or after the post's second, stop: the post came before the close;
  4. otherwise the log missed a start. It is not used again this run; a warning is logged, and listeners hear the change. Everyone then answers as without the log (section 7.7).
- Listeners hear changes only while the log is trusted. A state told twice is one change (`cs2-process.js:161-173`).
- Within a run there is no way back to trusting the log.

Tests, `cs2-process.test.js`: "answers from the log once started, and follows what the main process tells"; "a state told twice is one change"; "check reads the log at once, for an answer that cannot wait"; "closedSince: closed in or after the second of a moment, and not open again"; "a log never seen closing has no close to tell"; "a log that has never shown CS2 tells nothing"; "without the log nothing is known"; "without the bridge, as in tests, nothing is known"; "the log missed a start and is not used again this run"; "a start the last look had not read yet clears it"; "a state from the second CS2 closed in came before the close".

### 7.6 Who asks, and what each does

1. **GSI freshness** (section 5.3): a post stops counting the moment the log shows CS2 closed after it, long before 15 s.
2. **The restart call** (section 6): `restart` only while a CS2 open at the app's start still runs, or the log cannot tell.
3. **"Is the user in CS2"**, asked before a join, by the footer's offer and while a launch waits (section 10.1): closed means no, with no Steam request; open means yes, with no request, and only "in its menu" is left to GSI or Steam.
4. **The user's location** (section 9): when the log answers, it decides whether CS2 runs.
5. **The join loop** ([03](03-joining.md)):
   - each iteration takes the last answer, without a read. "In CS2" is the log's answer, or else a fresh GSI user state, or else the user's Steam presence. Not in CS2 ends the attempt as `cs2-closed` when the log said closed, else as `left-cs2` (`join-manager.js:520-536`);
   - right before each connect, the log is read at once. Closed ends the attempt as `cs2-closed`, with no connect (`join-manager.js:652-661`). A connect to a CS2 that has just closed would start it again through `steam://rungame`, and the app must never start CS2 again after the user closed it ([01](01-overview.md)).
6. **Maps polling** ([04](04-maps.md)): an open Maps tab in a window without focus polls only while CS2 runs, as the location has it (`src/ui/map-finder-view.js:166-173`).

The map keeper does not ask: a pin starts a join only on GSI's own state ([04](04-maps.md)).

Tests: `join-manager-loop.test.js` "ends a waiting join at once, though CS2's last state is still fresh, and sends nothing"; "a CS2 that closes between the snapshot and the connect gets no connect"; "with CS2 open by the log, Steam not showing the user in CS2 does not end the join"; "without the log, Steam not showing the user in CS2 ends the join, as before". `cs2-manager.test.js` "CS2 closed by the log is not in CS2, and Steam is not asked"; "CS2 open by the log is in CS2 with no request; only the menu is left to Steam"; "a log that cannot tell leaves the answer to Steam, as before". `user-location.test.js` "Steam's game log decides, over CS2's last state and Steam's copy of the user"; "without the log, CS2 posting or Steam showing the user in CS2 is enough". `maps-view-minimized.test.js` "with CS2 open the list goes on behind CS2, or on a second screen". `map-keeper.test.js` "without CS2's own state no pin can join: Steam showing CS2 open is not enough".

### 7.7 Failures and edge cases

- **No Steam, or no log at start**: unusable for the run. Every reader falls back to GSI, then to the user's Steam presence.
- **The log unreadable later**: that question, or that state, is unusable; the next look tries again (`steam-game-log.js:222-226, 241-245, 276-278`).
- **No CS2 line yet**, on a fresh Steam or with CS2 not run within the last 1 MiB: no answer until CS2 starts once.
- **Contradicted by GSI**: dropped for the run (section 7.5).
- **Steam restarting**: its start line clears what it tracked without noting an exit, so it does not end GSI's freshness. If CS2 then posts while the log has it closed, the log is dropped for the run.
- **A reused PID**: an exit takes the PID out of those from the app's start, so a later CS2 with the same PID counts as new.
- **The file started anew**: read from its beginning.
- **CS2 on another account**: the log is per PC, not per account (Q1).
- **The reader out of reach** (now an IPC failure): the answer is "unusable" in the usual shape, never an exception (`preload.cjs:217-236`, `src/game/steam-log.js:28-74`).

Now the window asks over IPC `steam-log-cs2` (the main process reads the log at once) and hears each change the look finds on the same channel (`main.js:205-207, 313-319`; `preload.cjs:217-246`).

Tests: `steam-game-log.test.js` "without Steam, or without its log, the log is unusable"; "a log that cannot be read any more is unusable". `steam-log-bridge.test.js` "the preload asks the main process, and hears each change it tells"; "a main process that cannot answer leaves CS2's process unknown"; "the main process answers on that channel, and tells the window each change"; "the page's side passes answers on in a known shape, and none without the bridge".

## 8. Server changes, for the join loop

- The line: `[YYYY-MM-DD HH:MM:SS] SSGL: Game server change [730]`, in local time; another app id does not count (`steam-game-log.js:26-29, 72-75`).
- Kept from the app's start on, the newest 200 (section 7.2).
- The question is "changes since a moment". The answer is `{usable, changes}`: the epoch ms of each line's second, oldest first, counting a change in the moment's own second (`steam-game-log.js:218-232`). It is unusable without a log, when the file cannot be read, or when the moment is not a finite number. An answer in any other shape counts as unusable (`src/game/steam-log.js:14-21`).
- Now: IPC `steam-log-server-changes` (`main.js:200-204`, `preload.cjs:209-216`).

What a line means, measured:

- 2026-10-25: Steam logged one only for joins that worked.
- 2026-11-06, against the 11 answers of CS2's game coordinator on 11-05/06 in the owner's CS2 console log: a line 0 to 3 s after each of the 6 accepted connects, and none after the 5 refused ones. In all 4 cases where the target's new join token was also seen, the line came first, by about 0.4 to 1.8 s at the log's 1-s resolution. Steam's logs hold nothing else that marks a refusal.
- 2026-11-06, read by the app's own code from the owner's file: 14 changes for 11-05/06. A join made from inside a match logs two lines about 2 s apart: leaving, then joining.

How the join loop uses it; the whole token rule is in [03](03-joining.md):

- **The user's own arrival.** It renews the join token of every player on that server, and a connect on such a token would only run into the user's own slot. A player's new token counts as the user's own arrival when all of these hold (`join-manager.js:873-909`):

  - a connect went out, from any attempt;
  - this is that player's first token change since that connect;
  - the log is usable and trusted;
  - it shows a server change at or after the connect's second, and at or before the moment the new token was first seen.

  The token is then marked used with no connect, and the journal gets `skip` with `why: "own-arrival"` (`join-manager.js:663-689`).

- **Self-check.** After an attempt joins, having sent a connect, the next own-arrival question first asks whether the log holds a change between that attempt's first connect and its join. If not, own arrivals are not judged by the log until a later join is found in it. A reset of all attempts trusts it again (`join-manager.js:566-573, 888-895, 798-814`).
- **Without it.** With the log unusable or untrusted, every new token gets a connect. The owner's decision of 2026-11-06: "легче закрыть окно что сервер полон чем пропустить место". Nothing waits a fixed time instead.
- The journal notes `steam-log` with `state` `usable`, `untrusted` or `missing` whenever that changes (`join-manager.js:917-921`).

Tests: `steam-game-log.test.js` "reads the second of a change of game server, in local time"; "ignores Steam's other lines and other games"; "reads only the changes Steam logs after the start"; "answers from a moment on, counting a change in that same second"; "a question before start() has finished waits for it"; "keeps only the newest changes"; "a moment that is not a number gets no answer". `join-manager-loop.test.js` "the user's own arrival: Steam logs the change of server, and the token it renews gets no connect"; "without Steam's game log every new token gets a connect, the user's own arrival's too"; "only the first new token after a connect can be the user's own arrival"; "a Steam log that missed a join is not trusted until it logs one"; "a join Steam's log holds keeps it trusted". `steam-log-bridge.test.js` "the preload asks the main process for the changes from a moment on"; "a main process that cannot answer leaves the log unusable"; "the main process answers on the preload's channel and reads the log from its start"; "an answer that is not one reads as no log".

## 9. Where the user is

The app shows, but blocks, joining where the user already is (the owner's choice of 2026-11-03). A friend on the user's server reads "you're together" ("вы вместе"), the user's server "you're here" ("вы здесь"), the map the user plays "you're on this map" ("вы на этой карте"), and the pinned maps' row "you're on a pinned map" ("вы на закреплённой карте"); their Join is disabled (`src/ui/join-status.js:80-122`; [02](02-account-and-friends.md), [04](04-maps.md)).

Sources:

- the user's own Steam presence, asked with each friends refresh in the same tick, so it rides in the same batched request; none when Steam could not be asked (`src/core/app-friends-manager.js:127-134, 167-180`; its fields are in [06](06-steam-web-api.md));
- the user state from GSI (section 5);
- the CS2-open answer (section 7).

Rules (`src/game/user-location.js`):

- **Server** (`:44-52`): none while GSI shows the user out of a match, whatever Steam still shows. Otherwise Steam's server id, while Steam shows the user in CS2. GSI carries no server id.
- **CS2 runs** (`:60-65`): the log's answer; when it cannot tell, a GSI user state means yes; else Steam's `inCS2`.
- **Own match** (`:72-76`): from the GSI user state alone, `{map, over}`, with `over` meaning phase `gameover`; none outside a match or without a user state.
- **Map to block** (`:83-95`):
  - with a GSI user state: the own match's map while the match is casual and not over;
  - without one: Steam's map while Steam shows the user on an official casual server and the score is not a finished match, a side at 8;
  - otherwise none. Once a match is over, the server moves on to another map under the same id.
- **Changes** (`:102-108, 124-144`): listeners hear a change of the server, the map, the own map, `over` or "CS2 runs", once per change, from Steam or from CS2. Now GSI changes and the CS2-open answer reach it only through the GSI module (smell S7).

Why: CS2's own state wins while fresh, because Steam's copy lags. Steam keeps showing a server for a while after the user leaves it, and the old map after the server has moved on (`user-location.js:14-20`).

- After a match ended, Steam kept the user on the same server id for 20 to 30 s, then showed no server for a while (journal, 10-30 to 11-03).
- On 2026-10-25 Steam still showed the server the user had just left, and a new attempt counted as joined at once. Since 2026-10-26 a server Steam shows while GSI says menu does not count; the join loop has its own form of that rule ([03](03-joining.md)).

Users:

- friend rows, at each drawing of the list (`src/ui/friends-renderer.js:53, 96, 170-181`; smell S16);
- Maps rows. The map list also shows the user's own server with CS2's own map and `over` while Steam's copy differs, with no score and no free slot (`map-finder.js:677-707`, `map-finder-view.js:128, 616, 657, 697`);
- map joins, which skip finished matches and the user's own server ([04](04-maps.md));
- Maps polling (section 7.6).

Tests: `user-location.test.js` "back in the menu the user is on no server, whatever Steam still shows"; "in a match the server comes from Steam and the map from CS2"; "a finished match or another mode is no map to block"; "without CS2's state Steam's presence stands in"; "listeners hear about a change once, from Steam or from CS2". `join-manager-gsi.test.js` "does not count as joined while CS2 shows the menu"; "counts once CS2 has a map loaded again".

## 10. Launching CS2 and waiting for its menu

### 10.1 "Is the user in CS2", and "in its menu"

One question in two strengths. It is asked before a join, by the footer's offer, and every 3 s while a launch waits (`src/game/cs2-manager.js:77-134`). In order:

1. Read the log now (section 7.5). Closed: no, and Steam is not asked.
2. A GSI user state: yes; for "in its menu", whether it is out of a match.
3. The log says open: yes, with no request. Only "in its menu" is left to Steam: CS2 runs but has not posted, still starting or on an older cfg.
4. No SteamID or credential entered: no.
5. Ask Steam's Web API about the user (`src/steam/steam-api-client.js:543-563`). In CS2 when `private_data.game_id` is `730`; in its menu when rich presence `game_state` is also `lobby` (`steam-api-response-processor.js:336, 366-385`).
6. A request that failed, or any error: cannot tell, never no. Each caller decides what an unknown means.

Tests, `cs2-manager.test.js`: "returns null when Steam cannot be asked"; "passes a null Steam result through"; "passes a boolean Steam result through"; "returns false when steamId or auth is missing"; "checkUserInCS2 answers from a fresh state without asking Steam"; "checkUserInCS2AndLobby is true in the menu and false in a match"; "asks Steam again once CS2 has gone quiet"; and the log cases of section 7.6.

### 10.2 Launch and wait

- Launch: hand `steam://run/730/` to the Steam client (section 11), without waiting for its reaction (`cs2-manager.js:139-152`).
- Wait for the menu (`cs2-manager.js:160-304`):
  - a GSI user state in the menu ends the wait at once;
  - as the fallback while GSI does not deliver, "in its menu" (10.1) is asked every `CS2_LOBBY_POLL_MS` = 3 s, the first time 3 s after the launch (`constants.js:16-19`);
  - "cannot tell" is not a yes;
  - a state from a match does not end the wait;
  - the deadline is `CS2_LAUNCH_TIMEOUT_MS` = 180 s (`constants.js:15`), since without one a CS2 that never starts would be polled forever. No reason is recorded for the length;
  - progress is told as `launching`, then `ready` or `timeout`.
- A new launch first settles an unfinished wait with no. A cancel settles it with no.
- Every way a wait ends stops the poll, the GSI listener and the deadline. A check that was out when its wait was cancelled can neither settle nor stop a newer wait.

Tests, `cs2-manager.test.js`: "resolves false and reports timeout when the lobby is never reached"; "treats an unknown (null) lobby check as not ready"; "resolves true when the lobby is detected before the deadline"; "cancelLaunchOperations resolves false and clears the deadline"; "a stale check from a cancelled wait does not settle or stop a new wait"; "launchAndWaitForLobby resolves the moment CS2 reports the menu"; "a state from a match does not end the launch wait"; "cancelling the launch stops listening to GSI".

### 10.3 Before a join

Every attempt, of a friend, a map, a server or the pinned maps, first asks "is the user in CS2" (`join-manager.js:361-399`):

- no: the launch overlay asks (10.4). Its yes, CS2 in its menu, goes on with the join. Its no drops the join before it exists: nothing is drawn and Steam is not polled;
- cannot tell: the join goes ahead without the offer. Offering to launch a game that may well be running would be wrong, and the loop's failure budget deals with an outage;
- yes: the join goes ahead.

Launching CS2 for a join came in 0.4.0.

Tests, `join-manager-loop.test.js`: "Steam not answering the CS2 check goes ahead without offering a launch"; "a user out of CS2 is offered a launch, and declining it aborts the join"; "accepting the offered launch goes on with the join"; "a second click while the CS2 check is out does not start a second loop".

### 10.4 The launch overlay

One overlay, one question at a time (`src/ui/cs2-launch-dialog.js`; texts `en.js:42-79`, `ru.js:42-79`):

| Phase             | Title, en / ru                           | Message, en                                                                                                    | Hint, en                                                                         | Buttons                                      |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| a join asks       | Launch CS2 First / Сначала запусти CS2   | You need to launch Counter-Strike 2 before joining your friend's game.                                         | Wait for the game to fully load before trying to join again.                     | Launch CS2, Close                            |
| launching         | Launching CS2... / Запуск CS2...         | Starting Counter-Strike 2. Please wait for the game to fully load.                                             | The notification will close automatically when CS2 is detected.                  | Launching... with a spinner, disabled; Close |
| timeout           | CS2 Did Not Start / CS2 не запустился    | Counter-Strike 2 has not reached the main menu.                                                                | Check that Steam is running and the game starts, then try again.                 | Try Again, Close                             |
| the footer offers | Launch CS2? / Запустить CS2?             | The app launches Counter-Strike 2 through Steam and waits for the game's main menu.                            | This only launches the game, without joining anyone.                             | Launch CS2, Close                            |
| CS2 runs          | CS2 Is Already Running / CS2 уже запущен | Steam shows you in Counter-Strike 2, so there is nothing to launch. The app is waiting for the game to report. | Usually CS2 is still loading; once it reports, the footer reads “CS2 connected”. | Close only                                   |

Rules (`cs2-launch-dialog.js:165-353`):

- Launch starts one launch and wait (10.2); another click while it runs does nothing.
- The menu reached: the overlay closes and answers yes.
- The deadline passed: the timeout phase. The overlay stays up and answers nothing until the user acts; Try Again launches again.
- A launch that throws: the overlay closes and answers no.
- Close answers no. A join's overlay always calls the launch off; the footer's offer calls it off only while one is under way, so a Close before Launch changes nothing.
- No overlay on the page: no.
- A language switch draws the phase on show again, in the footer's own texts when no join waits.

Tests, `cs2-launch-dialog.test.js`: "shows the overlay with its first texts and waits"; "Launch starts CS2 once and answers true when the lobby is reached"; "Close answers false and cancels a launch under way"; "a launch that times out keeps the overlay up for another try"; "a launch that throws answers false"; "answers false when the page has no overlay"; "a language switch re-renders the phase it shows". The PR #16 checklist items on this overlay become end-to-end tests of 1.0 ([test plan](../test-plan.md)).

### 10.5 The offer from the footer

"Waiting for CS2" offers the same launch with no join waiting (`cs2-launch-dialog.js:94-151`, `app.js:216-221`):

- It never opens over an overlay that is up, the join's or its own, and then asks nothing.
- First it asks "is the user in CS2" (10.1), because "Waiting for CS2" says only that CS2 has posted nothing for a while, which a CS2 still starting does too. While it asks, the control pressed reads as busy, and another press asks nothing.
- If CS2 posts meanwhile, nothing opens.
- Yes: the "CS2 runs" phase, with Close alone. The hidden Launch does nothing, even clicked from code. The keyboard goes to Close.
- No, cannot tell, or an error: the offer; the keyboard goes to Launch.
- When the overlay goes, the keyboard returns to where it was.
- A join's question takes the overlay over. The offer answers no, its launch under way is called off, and that launch ending late cannot touch the join's overlay.
- Why: since 0.9.2 the offer asks first, so that a CS2 still loading is not launched twice. The notes of 0.9.2 say it asks Steam; since 0.9.7 the code asks Steam's game log first, and the Web API only when the log and GSI cannot tell.

Tests: `cs2-launch-dialog.test.js` "offers the launch alone, in texts that speak of no join"; "says CS2 runs already, with Close alone, when Steam shows it"; "a language switch keeps saying CS2 runs"; "offers the launch as before when Steam %s" (shows no CS2, cannot be asked, fails to answer); "the control pressed reads as busy while Steam answers, and a second press asks nothing"; "a join that asks while Steam answers keeps the overlay"; "CS2 reporting while Steam answers leaves the overlay down"; "Launch takes the join's launch and answers true in the lobby"; "Close before Launch changes nothing"; "Close during the launch calls it off, as in a join"; "never opens over the join's own offer"; "does not cover an offer of its own either"; "a join's question takes the overlay over, a launch under way included"; "a language switch keeps the texts without a join". `gsi-status-indicator.test.js` "a click opens the offer to launch CS2, and nothing launches yet"; "while Steam shows CS2 running, it says so and offers no launch"; "when Steam cannot be asked, the launch is offered as before"; "reads as busy while Steam answers, and a second press sends no second request"; "CS2 reporting while Steam answers opens nothing"; "Launch launches CS2 as a join does, and the offer goes once CS2 is in its menu"; "Close takes the offer down and changes nothing"; "opens no second overlay over the join's own offer".

## 11. steam:// URLs

The app asks the Steam client for four kinds of thing only (`src/main/external-links.js:31-65`, `src/game/steam-protocol.js`):

| URL                                         | For                                                                                                              | Allowed when                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `steam://run/730/`                          | launching CS2                                                                                                    | the rest after `run` is exactly `/730` or `/730/`                                                          |
| `steam://rungame/730/<SteamID64>/<connect>` | joining through a player's connect string                                                                        | app id 730, a 17-digit SteamID64, a connect matching `^\+gcconnect[A-Za-z0-9:_-]{1,64}$`, nothing after it |
| `steam://openurl/<https URL>`               | a page on `steamcommunity.com` or `steampowered.com`, or a subdomain, in Steam's own browser, which is signed in | the page is https, on one of those hosts                                                                   |
| `steam://url/<Name>[/<Name>...]`            | a page of the client itself, such as `SteamIDMyProfile`                                                          | names of letters, digits, `_` and `-`                                                                      |

- Every other `steam:` URL is refused and logged, whoever built it. Steam's protocol does far more: run any game with any launch options, install, uninstall.
- The connect string comes from another player's client and becomes CS2's launch arguments. So only a bare `+gcconnect` token passes, with no spaces, quotes, escapes or further commands (`constants.js:153-155`; validation of rich presence in [06](06-steam-web-api.md)).
- The OS hands the URL to the Steam client. The app waits only until it is handed over, never for Steam's or CS2's reaction (`main.js:67-79, 240-248`). Steam runs the URL in the same second, and its own `logs\console_log.txt` notes each one as `ExecuteSteamURL` (measured 2026-10-25).
- `+gcconnect` reaches CS2 as a command-line request through Steam, not as a console command. In `client.dll`: `+gcconnect%08X%08X%08X` joins a server, `+gcconnectG%08X` a lobby, by account id, and `+gcconnectL…` a local or listen server.
- `steam://rungame` starts CS2 when it does not run, which is why the log is read right before each connect (section 7.6).
- Links in the page pass the same check, and the page never navigates away. Chromium's own permission to open an external protocol is granted for these URLs only ([07](07-ui-shell-security-and-updates.md); `main.js:120-141`, `src/main/permissions.js:13-22`).
- Without the desktop bridge, as in tests, the page opens the URL itself (`steam-protocol.js:29-34`).

## 12. Not read, on purpose

- **CS2's console log.** It would show the game coordinator's answer to each connect, accepted or "Game is full". But CS2 writes it only with the launch option `-con_logfile`. Reading it was built on 2026-10-26 and removed on 2026-10-30, since players are not asked for launch options. The owner's own `-con_logfile` stays a research tool.
- **CS2's net console**: `-netconport` is gone from CS2, with only leftover code in its binaries (2026-10-25).
- **VConsole**: it needs `-tools`, which cannot join official servers.
- **Steam's `logs\console_log.txt`**: it notes every `ExecuteSteamURL`. The app knows what it sent, so nothing reads it.
- **CS2's game coordinator**: reaching it needs a second logged-in account, or tampering with the running CS2, which VAC bans.
- **Steam's coplay file**, `config\coplay_<SteamID64>.vdf`: read in 1.0, see [08](08-coplay-candidates.md).

## 13. Smells and open questions

### Smells

- **S1. The Steam folder is looked up twice per start**, once for the GSI setup and once for the game log, each with up to three `reg.exe` runs of up to 5 s (`gsi-service.js:96` with `cs2-locator.js:255-257`; `steam-game-log.js:100-103`). One owner should find it once; 1.0's coplay reader needs it too.
- **S2. Everything local is found once per run**: Steam's folder, CS2's folder and the log file. CS2 installed or moved while the app runs is missed, and a log that could not be opened at start stays unusable all run, though it may be readable a second later (`gsi-service.js:96`, `steam-game-log.js:171-210, 258`).
- **S3. `gsi.json`'s port is only checked for being an integer.** One that listening refuses for any reason but "in use", a negative one or one above 65535, fails the setup on every start. The store is never repaired, since it is saved only after a successful listen (`gsi-service.js:80-93, 120-130`; `gsi-server.js:112`). A stored 0 silently means the default.
- **S4. An unwritable `gsi.json`** gives a new token on every start, so the cfg is rewritten on every start, and a CS2 opened before the app is asked to restart every time. Only a log line says why (`gsi-service.js:86-93`).
- **S5. The "unknown" process state is spelled out four times** (`steam-game-log.js:109-116`, `preload.cjs:227-234`, `steam-log.js:55-65`, `cs2-process.js:32-39, 138-145`). The page's two log questions also handle failure differently: one catches errors itself, the other leaves that to the bridge (`steam-log.js:14-21, 28-36`).
- **S6. Two trust rules for one file.** Its process lines lose trust for the rest of the run at the first contradiction by GSI (`cs2-process.js:101-118`). Its server-change lines lose trust when a join is missing from them, regain it when a later join is found, and a reset of all attempts restores it (`join-manager.js:76-80, 888-895, 811`). Each rule has its reason, but they live in two modules and know nothing of each other: a log dropped for processes still judges own arrivals, and the other way round. 1.0 should give the file one owner that states both.
- **S7. The CS2-open answer reaches the location's listeners only through the GSI module**, which re-announces each change of it (`gsi-manager.js:90-92`, `user-location.js:102-105`). The location does not listen to the answer's owner, so Maps polling, which depends on "CS2 runs", relies on the GSI module having started.
- **S8. The account is checked by callers.** The observed and listed players are checked for freshness only (`gsi-manager.js:173-198`). The map finder is safe because it first requires the user state, which is empty for another account, to be in casual (`map-finder.js:289`).
- **S9. The join journal reads the GSI module's internals**, its last raw post and that post's arrival time, so it logs other accounts' posts and fields nothing else reads, `round` and `team` (`join-journal.js:119-142`). That suits a research log, but it is a second reader of raw GSI.
- **S10. Data asked for or kept, and never used**: the cfg's `player_state` (`gsi-config.js:30`); the user state's `activity` and `steamId` (`gsi-manager.js:39-51`); the log state's `startedAt` (`steam-game-log.js:302`), which 1.0's coplay timing ([08](08-coplay-candidates.md)) may want.
- **S11. A map block without a mode counts as a protected match**, which would end a join as `protected-match` (`gsi-manager.js:36, 53`). Conservative, never seen, untested.
- **S12. A failed question for the setup outcome reads as "Waiting for CS2"**, not as an error: the bridge answers nothing, and no outcome means waiting (`preload.cjs:97-104`, `gsi-manager.js:220-222`).
- **S13. A start-up flash.** The status is drawn before the setup outcome and the log's first answer: the page's own markup says "GSI" in the waiting look, then "Waiting for CS2", pressable, until the outcome comes (`index.html:276-279`, `app.js:216-232`, `gsi-status-indicator.js:66`).
- **S14. Missing credentials are checked unevenly.** "Is the user in CS2" says no before reading the log when no credential source is wired, but yes from the log when the entered credentials are empty; they matter only for the Web API step (`cs2-manager.js:78-81, 111-117`).
- **S15. The launch wait spends requests while CS2 starts.** Once the log has CS2 open, and until CS2 posts, each 3-s poll asks the Web API for the menu, whether GSI is set up or not (`cs2-manager.js:99-101, 177-192`). A few requests per launch; with GSI working, the menu post ends the wait anyway.
- **S16. Friend rows and Maps rows learn the user's place at different times**: friend rows at each drawing of the friends list, every 3 s, and Maps rows on every change (`friends-renderer.js:53, 96`; `map-finder-view.js:128`). "you're together" may lag "you're here" by one refresh.
- **S17. Words lag the source.** The overlay says "Steam shows you in Counter-Strike 2", and test names say "while Steam shows CS2 running", though since 0.9.7 the answer mostly comes from Steam's game log. CHANGELOG 0.9.2 and the notes say the offer asks Steam first.
- **S18. Constants without a recorded reason**: `DEFAULT_PORT` 47731, `PORT_ATTEMPTS` 10, `MAX_BODY_BYTES` 256 KiB, the cfg's `timeout`, `buffer` and `throttle`, `CS2_LAUNCH_TIMEOUT_MS` 180 s, and the 200 server changes kept. Only `HEARTBEAT_S` with `FRESH_MS`, `LOOK_MS`, `TAIL_BYTES` and `CS2_LOBBY_POLL_MS` carry theirs.
- **S19. Untested**: the registry order and the fixed Steam folders; the older `libraryfolders.vdf` entry, a bare path; two CS2 installs; "No CS2 left" with no PID tracked; a Steam start while CS2 posts.

### Open questions

- **Q1. CS2 on another account, with the log saying open.** Since 0.9.7 "is the user in CS2" answers yes from the log without asking Steam (`cs2-manager.js:85-101`). So a join starts with no launch offer, and its connects go to the local Steam client, which runs the other account. The entered account's presence never shows the join, so the attempt runs on. Before 0.9.7 the Web API answered for the entered account, which would most likely say no, so the launch was offered. Never seen in use. Only GSI's `provider.steamid` knows the account on this PC. What 1.0 should do, for example no join while GSI shows another account, is the owner's call.
- **Q2. Team scores in casual.** Whether casual posts carry `map.team_ct.score` and `map.team_t.score` is unverified in game; the keeper's match-point polling depends on it.
- **Q3. CS2 closed during a waiting join.** Built in 0.9.7, not seen in game. The journal should show `cs2-closed` within about a second of Steam logging the exit, with no connect after it.
- **Q4. The restart call on a real first install**, and its going away when that CS2 closes: only seen in the simulated run of 2026-11-07.
- **Q5. The "CS2 уже запущен" overlay** has not been seen in game since 0.9.2; since 0.9.7 it comes from the log.
- **Q6. Two CS2 processes at once.** If Steam ever tracks a new CS2 PID before it writes "Remove 730 from running list" for an old one, during a self-restart say, the reader clears the new one and says closed. The 146 starts and ends of the owner's log were not checked for overlaps. CS2's next post would then drop the log for the run, which is safe.
- **Q7. Whether and when Steam starts `gameprocess_log.txt` anew**, at its own start or past some size. The reader copes either way; the owner's file held nine months.
- **Q8. Local time.** The stamps are local time to the second and are compared with the system clock. Around a daylight-saving change, or a time-zone change while the app runs, an hour is ambiguous or shifted. Not handled, never seen.
- **Q9. Steam's start line against CS2's first post.** The contradiction check reads the log again, which covers a look that has not run yet, but not a line Steam writes late. A start was heard within 1 s in the simulated run; that Steam always writes it before CS2 can post is not measured.
- **Q10. A CS2 that outlives a Steam restart**: whether the new Steam tracks it again is unknown. If not, its next post drops the log for the run.
- **Q11. Mode names in GSI.** The notes record rich presence's mode names, and the tests assume GSI uses the same (`premier`, `scrimcomp2v2`, `rush`, `custom`). What CS2's GSI sends for Premier and Wingman is not recorded. Either way, everything but casual and deathmatch is protected.
- **Q12. CS2 reading GSI cfgs only at its start** is the premise behind the restart call; it is not recorded as measured in CS2.
- **Q13. CS2's first menu post during its start-up.** The launch wait ends at the first one, and a join may connect right after. During a map load, a second gcconnect was handled at once and refused, not deferred (2026-10-26). What CS2 does with one during its own start-up is not measured.
- **Q14. The own-arrival rule of 0.9.4 in real joins**: as of 2026-11-07 13:00 no real join had met it. The journal's `connect.why`, `skip` and `steam-log` records are to be read after the owner plays.
- **Q15. A CS2 that runs but never posts**, because GSI does not reach it (a second install that got no cfg, say), keeps "Waiting for CS2" up for good, and the offer says CS2 runs and is loading. Nothing tells the user that GSI is broken. How often this happens is unknown.
- **Q16. The cfg after uninstall.** 0.9 leaves it in CS2's folder, where it names a port nobody listens on. Whether 1.0's uninstaller should remove it is the owner's call ([migration](../migration.md)).
