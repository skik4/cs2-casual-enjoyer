# 04. Maps

The Maps tab finds Valve's official casual servers by map and joins them. Valve publishes no such list, so the finder reads the Steam presence of other players: who is on which server, on which map, with what score, and whether a join link is offered. This document covers:

- the finder: its sources, its rounds, how it builds servers;
- Prime signs, "Prime only" and the friend check;
- reading friends lists with an API key;
- the Maps view and the joins started from it;
- pinned maps and the keeper;
- the `map-finder.json` store.

Specified elsewhere:

- the join loop itself (tokens, connects, the user's own arrival, CS2 launch, the failure budget): [03](03-joining.md);
- GSI, Steam's game log and whether CS2 is open: [05](05-cs2-gsi-and-local-steam.md);
- requests, chunks of 100 ids, timeouts and credential rejection: [06](06-steam-web-api.md);
- the account, the token and the friends list: [02](02-account-and-friends.md);
- styles, the shell and the window: [07](07-ui-shell-security-and-updates.md).

Conventions:

- Code references are to 0.9.7 (version commit 4f1b311), as `path:line` from the repository root.
- Test references are to files in `__tests__/`, as `file:line` followed by the test name.
- **Decision (owner, date)** marks a choice the owner made. Don't reopen it without new evidence.
- **Measured (date)** marks an observation with its numbers. Where a dated note and the code differ, the code wins and the text says so.
- A _round_ is one refresh of the finder. A _presence_ is one player's answer from `GetPlayerLinkDetails`, read into the fields of 3.1.

Release history of the tab (CHANGELOG.md):

- 0.9.0: the Maps tab, map and server joins, pins, "Prime only", per-source clears.
- 0.9.2: the friend check ("Prime?"); no polling while minimized.
- 0.9.7: the pool keeps only the user's own matches; fewer requests while nobody can use them.

## Constants at a glance

| Name                                   | Value   | Code                               | Reason given                                                                                                                                                                 |
| -------------------------------------- | ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REFRESH_INTERVAL_MS`                  | 30 s    | `src/shared/constants.js:83`       | The round. No measurement is recorded for the value. The keeper's match-point rule assumes a casual round outlasts it (12.5).                                                |
| `MAX_IDS_PER_REFRESH`                  | 3000    | `src/shared/constants.js:85`       | 30 requests per round at 100 ids per request.                                                                                                                                |
| ids per `GetPlayerLinkDetails` request | 100     | `src/steam/steam-api-client.js:65` | Steam's limit. **Measured (2026-10-30):** 101 to 200 ids return an empty answer, 250 or more get HTTP 400, POST gets 405 ([06](06-steam-web-api.md)).                        |
| `POOL_TTL_MS`                          | 14 days | `src/shared/constants.js:93`       | A pool player not seen on an official casual server this long is dropped. No reason is recorded for the length.                                                              |
| `POOL_MAX`                             | 5000    | `src/shared/constants.js:92`       | Bounds the pool; the most recently seen stay.                                                                                                                                |
| `POOL_FRIENDS_MAX_IDS`                 | 20,000  | `src/shared/constants.js:97`       | The newest lists push out the oldest. One pass over them is 200 requests, spread over the rounds.                                                                            |
| `FOF_MAX_IDS`                          | 5000    | `src/shared/constants.js:90`       | Bounds friends of friends.                                                                                                                                                   |
| `FOF_REFRESH_MS`                       | 24 h    | `src/shared/constants.js:89`       | A pool player's list read this recently is not read again: lists change slowly, and each is a request on the user's key. It is also how long the friend check trusts a list. |
| `FOF_REQUEST_DELAY_MS`                 | 250 ms  | `src/shared/constants.js:91`       | The pause between list reads. No reason is recorded.                                                                                                                         |
| `PRIME_MAX_IDS`                        | 20,000  | `src/shared/constants.js:101`      | Prime is never taken away, so there is no expiry. The cap only bounds the store; those seen longest ago go first.                                                            |
| `SAVE_DEBOUNCE_MS`                     | 2 s     | `src/shared/constants.js:104`      | The store is not written on every change.                                                                                                                                    |
| `MAX_SEEDS`                            | 3000    | `src/game/map-finder.js:18`        | Seeds waiting for their first look.                                                                                                                                          |
| `FRIEND_CHECKS_PER_REFRESH`            | 4       | `src/game/map-finder.js:29`        | About 12 extra requests per round (8.5).                                                                                                                                     |
| `FRIEND_LISTS_MAX_IDS`                 | 50,000  | `src/game/map-finder.js:35`        | About 1 MB in the store, inside its 5 MB with every other list full.                                                                                                         |
| `STORE_MAX_BYTES`                      | 5 MiB   | `src/main/map-finder-store.js:3`   | Larger writes are refused.                                                                                                                                                   |
| `CLEAR_CONFIRM_MS`                     | 3 s     | `src/ui/map-finder-view.js:55`     | The window for a clear's second click, as for a fake friend's remove button.                                                                                                 |
| `CASUAL_ROUNDS_TO_WIN`                 | 8       | `src/shared/constants.js:203`      | Match over; match point is 7. The journal saw matches end at 8:2 and after round 15.                                                                                         |
| `ANON_GAME_SERVER_ACCOUNT_TYPE`        | 4       | `src/shared/constants.js:80`       | Valve's servers log on anonymously; community servers with a login token are type 3.                                                                                         |
| `MISSING_TIMEOUT_MS`                   | 60 s    | `src/shared/constants.js:13`       | A map or server join with nothing to join gives up ([03](03-joining.md)).                                                                                                    |
| `GSI_CONFIG.FRESH_MS`                  | 15 s    | `src/shared/constants.js:62`       | CS2's state stops counting after three missed heartbeats, and pins then stop needing polling ([05](05-cs2-gsi-and-local-steam.md)).                                          |

## 1. Rules that look odd but are measured

Each of these is explained below with its evidence. They must survive the rewrite.

- Servers are found through players, because no list of official servers exists (2).
- "Official" is decided from rich presence and the server account alone, with no address lookup (3.2).
- A server speaks through the player whose status changed last, not the highest score (7.2).
- On the user's own server, CS2's own match state beats Steam's copy (7.4).
- Seeds are asked about at once, from any tab, and only while the user's own match is casual (4.3).
- Only seeds join the pool; nothing else does (4.4).
- Friends lists are read only on the user's click (9.2).
- A sign of Prime is remembered for good. A Prime mark is a likelihood, and the friend check only marks (8).
- Pinned maps rejoin at gameover, not when the next map has loaded (12.3).
- Pins keep the finder polling only in CS2's menu and, in a casual match, from match point on (12.5).
- The window's minimize comes from the shell, because the page cannot see it (6.2).

## 2. Why players, not a server list

Facts (research of 2026-10-24, re-checked 2026-11-04):

- Official servers sit behind Valve's relay network (SDR) and are not in the master server list.
- The GC's live-game lists cover competitive and Premier only.
- `QueryByFakeIP` and `GetServerList` return nothing for Valve's internal addresses, and nothing public maps a server to its datacenter.
- No Web API lists the players on a server.
- `IPlayerService/GetPlayerLinkDetails`, called with the user's web token, returns strangers' rich presence, `connect` included. 1106 of 1107 accounts answered on 2026-10-24. It answers an API key exactly as it answers the token (2026-11-04).
- The GC lets a non-friend join through `+gcconnect`. The owner verified this on 2026-10-25: two strangers on official Dust II casual, added as fake friends, and the app's Join got the owner in.

So the finder polls known players and groups those on official casual servers by server. Its reach depends on its player sources (4).

The owner asked for map selection in casual "via other users, not only friends".

Ruled out. Don't rebuild these without new evidence:

- Server addresses (`GetServerIPsBySteamID`): see 3.2.
- GC queries:
  - they need a second logged-in account, and each probe is a real join that holds a slot;
  - the user's own account would clash with their running game;
  - going through the running CS2 process is tampering, which VAC bans.
- Steam group member pages:
  - about 0.4% yield: 5 official-casual players among about 1150 CS2 players scanned;
  - about 77% of their in-game members show no rich presence (idlers);
  - scraping steamcommunity.com cannot run in the page under its CSP;
  - never built.
- Steam's web "recently played with" page needs a community login, which the app does not have, since the token comes from the store. Its local file is planned for 1.0 instead (4.7).

## 3. What the finder reads from a player

### 3.1 Presence fields

One `GetPlayerLinkDetails` account becomes these fields (`src/steam/steam-api-response-processor.js:181-249`):

- `steamid`, `personaname`.
- `inCS2`: `game_id` is 730 (`src/steam/rich-presence.js:135`).
- `inSupportedMode`: in CS2, `game:mode` is `casual`, and `game:state` is set and is not `lobby` (`src/steam/rich-presence.js:144`).
- `connect`: kept only in a supported mode, and only if it matches `^\+gcconnect[A-Za-z0-9:_-]{1,64}$` (`src/shared/constants.js:155`).
  - The value becomes CS2 launch arguments, so nothing else may ride along.
  - A malformed value is logged once and dropped (`steam-api-response-processor.js:197-209`).
- `serverId`: `game_server_steam_id` from rich presence, else from the account's private data (`steam-api-response-processor.js:211-212`). Rich presence seldom carries it (2026-11-03).
- `mode`, `map`, `score`: `game:mode`, `game:map`, `game:score`, only while in CS2.
- `official`: see 3.2.
- `primeSign`: see 8.1.
- `statusKey`: see 3.4.

Answers versus failures:

- An id in an answered request for which Steam returns no account is answered as "not in CS2".
- An id whose request failed is absent from the answer. Tests: `steam-presence.test.js:262` "an id Steam has no account for is answered as not in CS2", `:287` "a failed request leaves the ids out".
- The finder relies on this difference everywhere: absent means "could not ask", never "gone".

### 3.2 Official server signature

Requirement: a presence is `official` when all of these hold (`src/steam/rich-presence.js:213-239`, `steam-api-response-processor.js:245-246`):

1. a supported mode: casual, with a match running (not the lobby);
2. `game:server` is `kv`;
3. `steam_display` starts with `#display_GameKnownMap`;
4. there is no `Addon` key;
5. the server's SteamID belongs to an anonymous game server: its account type (bits 52 to 55) is 4 (`ANON_GAME_SERVER_ACCOUNT_TYPE`, `src/shared/constants.js:80`).

No network lookup of any kind is made for it.

Community servers seen so far gave themselves away by:

- a workshop display (`#display_GameWkshpMap…`) and a decorated map name;
- an `Addon`;
- `game:server` `community`;
- a server account of type 3, which belongs to servers with a login token.

Local games with bots show `game:server` `offline`.

History:

- **Measured (2026-10-24).**
  - Signature items 2 to 5 found.
  - `GetServerIPsBySteamID` gave Valve's servers an address in the carrier-grade NAT range of RFC 6598, or nothing.
- **Measured (2026-10-25).** Neither `kv` nor type 4 proved a Valve server:

  - a type-3 community Mirage server reported `kv`;
  - a type-4 Arms Race server with `kv` and a known map sat at a public hosting address;
  - type-4 servers with `game:server` `community` also had players.

  The address check held for every server, so commit 42df4d8 required it.

- **Measured (2026-10-30 and 11-04).** Between 2026-10-27 19:10 UTC and 10-29, Steam stopped listing an address for any type-4 server:
  - 0 of 26 had one on 10-30, and 0 of 97 on 11-04;
  - type-3 servers still got public addresses;
  - the address check then rejected every official server, so the Maps tab found nothing and the pool could not grow;
  - the last pool addition was on 10-27, about 19:10 UTC.
- **Decision (owner, 2026-10-30):** no address lookups at all. "Official" is decided from rich presence and the server account.
  - Reason: addresses may never return, or may return in another range and break the check again.
  - Live check of the new rule that day: 3558 ids gave 70 players in CS2 and 4 official servers, using only `GetPlayerLinkDetails`.
- Known gap: a community server run without a login token (type 4), on a stock map, in casual and reporting `kv`, would pass. None has been seen.
- Older notes name `SteamAPIUtils.isOfficialServer`. The function now lives in `src/steam/rich-presence.js`; the code wins.

Tests:

- `steam-presence.test.js:64` `isOfficialServer` table: "an official casual match" true; "a community server", "a community server on Valve's relays", "a workshop add-on on a known map", "a community server listed with a login token" and "the main menu" false;
- `:88` "isAnonymousGameServer reads the account type from the server id";
- `:95` "the server id can come from outside rich presence";
- `:123` "rich presence and the server account decide, with no address lookup".

### 3.3 Score, rounds and match over

- `game:score` looks like `[ 3 : 1 ]`. Rounds played are the sum of both numbers, and null without a score (`src/steam/rich-presence.js:246`).
- A match is over when one side has 8 rounds or more (`CASUAL_ROUNDS_TO_WIN`, `src/shared/constants.js:203`; `rich-presence.js:256`).
- Tests: `steam-presence.test.js:222` "adds both sides of the score", `:229` "isMatchOver sees a side with the rounds a casual match needs" (`[ 7 : 8 ]` over, `[ 7 : 7 ]` not).
- **Measured (journal, 2026-10-30, 10-31, 11-03).**
  - GSI's `gameover` came after round 10 (8:2) and after round 15.
  - Within about 15 s the same server loaded another map under the same server id.
  - Steam kept showing the user on that server id for 20 to 30 s, and then on no server for a while.
- **Decision (owner, 2026-11-03):** a finished match is shown as "match over" and is not joinable, since the server is about to load another map.

### 3.4 Status key

The key changes:

- when any rich presence value changes, whatever order Steam lists the values in;
- when the server id changes, wherever it came from;
- when a connect appears or goes away, or changes kind (server, lobby `G`, local `L`).

A new join token alone is no change (`src/steam/rich-presence.js:84-102`, `steam-api-response-processor.js:222`).

Why:

- CS2 renews a player's token whenever players arrive or leave: on one server both tokens changed within minutes.
- The finder uses the key only to tell which of a server's players moved on last (7.2).

Tests: `steam-presence.test.js:158` "changes with any value and ignores the order Steam lists them in", `:166` "a new join token alone is no change; a connect showing up or going away is", `:202` "a player's key covers the whole rich presence and the server".

### 3.5 What "free slot" means

- A server has a free slot when at least one of its current known players shows a `connect`. This is Steam's documented `connect` key, the one behind Join Game in Steam's friends list.
- It lags and can be stale:
  - **Measured (2026-11-04):** a friend's token stayed the same for at least 68 s, through 4 refusals, while the server was full.
  - **Measured (2026-10-25):** a slot stayed visible 26 s with two refusals on it. The Web API shows a change 1 to 1.5 s after the Steam client.
- The owner's model (2026-11-06), which the join journal mostly backs:

  - the link appears when a place frees;
  - it hangs stale once the place is taken;
  - a new one replaces it.

  A link that appeared where there had been none got the app in 6 times out of 6.

- Requirement: the labels "free slot" and "{count} with a free slot" ("есть место", "{count} со свободным местом") follow this fact alone. They were wrongly called misleading on 2026-11-06 and corrected the same day; keep them.

## 4. Sources of players

### 4.1 At a glance

| Source                              | Fed by                                                     | Joins the pool                                   | Polled                                      | Needs                           | Measured share on official casual at one moment    |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| Friends, fake friends               | friends list ([02](02-account-and-friends.md)), manual ids | no                                               | every round, first                          | credential                      | not measured                                       |
| Seeds                               | GSI, in the user's casual match                            | yes, when Steam shows them on an official server | at once, and in every round before the pool | credential, GSI                 | 19 listed once, at most 3 pooled (2026-10-25)      |
| Pool                                | seeds only                                                 | (is the pool)                                    | every round                                 | credential                      | 2 of 43, about 5% (2026-10-30)                     |
| Friends of pool players             | Read lists, on a click                                     | no                                               | a slice per round                           | key to read, credential to poll | 0.69% (2026-10-25)                                 |
| Friends of friends                  | Read lists, on a click                                     | no                                               | a slice per round                           | key to read, credential to poll | 0.21% (2026-10-25), 0.13% = 3 of 2346 (2026-10-30) |
| Coplay candidates (planned for 1.0) | Steam's own file                                           | yes, when seen official within a day             | for a day                                   | credential                      | 25 of 100 already known (2026-11-06)               |

Census of 2026-11-04, 21:48 to 21:56 Moscow time: 277 players in CS2 among 6000 known ids, on 42 official casual servers.

### 4.2 Friends and fake friends

- The user's Steam friends (the saved friends list) and the fake friends (manually added Steam IDs) come first in every round (`src/core/app.js:239-242`, `src/game/map-finder.js:956`).
- They feed the map list and the joins only. They never join the pool (rule of 2026-11-07, 4.4).
- Tests: `map-finder.test.js:265` "lists maps, and the friends on them do not join the pool", `:423` "only the user's own matches add to the pool: friends, friends of pool players and friends of friends feed the list alone".

### 4.3 Seeds from the user's own casual match

Rules (`src/game/map-finder.js:286-349`, `:478-498`):

- On every GSI change, if CS2's fresh state for the user's own account says a casual match, the finder takes these players as seeds:
  - the player CS2 shows while the user spectates, that is `player.steamid` when it differs from the provider's;
  - every player CS2 lists in `allplayers`, the user left out (`src/game/gsi-manager.js:173-198`).
- A player becomes a seed unless:
  - it already is one;
  - it is in the pool;
  - Steam already answered about it this run;
  - 3000 seeds wait already (`MAX_SEEDS`, `map-finder.js:18`).
- New seeds are asked about at once, from any tab, whether the finder polls or not.
  - The store is loaded first; otherwise a save would replace the pool on disk.
  - Checks never overlap. One asked for while another runs follows right after it.
- An answered seed is settled:
  - on an official server, it joins the pool, with `lastSeen` now and the map seen;
  - with any other answer, it is dropped;
  - either way it is not asked about again this run.
- A seed Steam did not answer about stays, and is asked about again in the next check or round.
- Seeds also ride in every round, before the pool (5.1).
- A seed showing a sign of Prime is remembered (8.2).
- Every check writes a `seeds` record to the join journal: `{asked, answered, pooled, notInGame, other}`. Older notes also list "waiting", from the removed address check; the code has no such field.

Why:

- **Agreed with the owner (2026-10-30):** seeds are taken only while the user's own match is casual, so other modes cost no requests.
- The per-player question to Steam stays for one reason the user's own status cannot answer: whether Steam shows that player at all.
  - GSI lists players whatever their privacy settings.
  - A hidden player let into the pool would be polled in every round for 14 days for nothing.
- Seeds are asked about at once because they share the user's server now, which a later round cannot promise.
  - Before 2026-10-30, seeds were asked only in a Maps round and dropped after one look, even when Steam gave no answer.
  - None reached the pool, although CS2 listed 12 to 16 players in one warmup and 10 in another.

Measured limits of GSI:

- **Measured (2026-10-25).** CS2 listed all players once: 19 players, for about 3 s, while the owner was in the spectator team. At most 3 of the 19 reached the pool; the rest most likely hide their game details.
- Full lists also came in warmup and free spectating (10-26, 10-29, 10-30), but not while spectating teammates after death (10-27). Every other payload lists nobody.
- The usual seed is the spectated player.

Tests:

- `map-finder.test.js:478` "the player the user spectates becomes a seed", `:489` "every player CS2 lists becomes a seed";
- `:518` "are asked about at once, with no refresh, and the official ones join the pool", `:551` "in another mode are not asked about", `:564` "a player answered about once is not asked about again";
- `:312` "a seed Steam answered about is looked at once", `:326` "a seed Steam did not answer about is asked about again", `:336` "a seed is asked about even when friends and the pool fill every slot";
- `:1113` "a seed showing a sign of Prime is remembered".

### 4.4 The pool

**Decision (owner, 2026-11-07):** the pool holds only players of the user's own casual matches: seeds that Steam showed on an official casual server. Nobody else ever joins it.

- In the owner's words: "я думал пул это только те с кем я играл в обычке".
- Before 0.9.7 the app put anyone polled and seen on an official server into the pool. Commit 2491d18 changed that.

Rules (`src/game/map-finder.js:359-382`, `:1334-1356`):

- An entry is `{lastSeen, map}`, keyed by SteamID64.
- Renewal: a pool player seen on an official casual server in any round gets `lastSeen` = now and the map seen, that is another 14 days.
- Expiry: an entry not seen for more than 14 days (`POOL_TTL_MS`) is dropped, at every round and at load.
- Cap: over 5000 entries (`POOL_MAX`), the most recently seen are kept.
- A player leaving the pool takes their friends-list read mark (4.5) along. Their friends found so far stay.
- Polled in every round, most recently seen first, after friends and seeds (5.1).
- Cleared at the user's click (10.3).

Why every round:

- **Measured (2026-10-30, about 15:20 Moscow time, a Friday):** 2 of the 43 pool players, about 5%, sat on an official-looking casual server at once, against 0.13% of friends of friends.
- One proven casual player is worth dozens of random ones.
- At 100 ids per request, polling a pool of 40,000 every 30 s is out of the question.

Migration of old pools:

- The owner declined a one-time cleanup in the app ("в приложении не нужен такой функционал"). The store stays version 1.
- The owner's own file was cleaned by hand on 2026-11-07, with the app closed:
  - pool entries also found among friends of pool players, friends of friends, friends or fake friends were dropped, 607 to 292;
  - read marks went from 439 to 276;
  - friends of pool players and Prime marks were left alone;
  - a backup was kept beside it.

Tests:

- `map-finder.test.js:423` (above);
- `:443` "a pool player seen on an official server again stays another two weeks";
- `:457` "drops pool entries past their time and keeps the newest";
- `:518` (above).

### 4.5 Friends of pool players

Rules (`src/game/map-finder.js:775-780`, `:1045-1120`):

- Read only at the user's click, and only with an API key (9).
- A read takes every pool player whose list was not read in the last 24 h (`FOF_REFRESH_MS`), most recently seen first. For each player:
  - read their friends list;
  - mark the player as read now;
  - add the friends who are not the user, not in the pool and not listed yet.
- Reads are 250 ms apart (`FOF_REQUEST_DELAY_MS`).
- Up to 20,000 ids are kept (`POOL_FRIENDS_MAX_IDS`). The newest lists push out the oldest ids, from the front of the list.
- They feed the map list through the rotating slice (5.1). They never join the pool.

Why:

- **Measured (2026-10-25, about 15:21 Moscow time, a Sunday):** 0.69% of friends of pool players sat on official casual servers, against 0.21% of friends of friends.
- 13 of the 15 pool players had public lists, which added 1164 new ids, about 90 per player.

Tests: `map-finder.test.js:800` "are read on the user's word, the most recently seen pool player first, once a day", `:840` "are not read without a key, nor by the periodic step", `:851` "past the limit the oldest go", `:864` "are polled in turn after the pool, which is polled every round", `:883`, `:919`, `:932`.

### 4.6 Friends of friends

Rules (`src/game/map-finder.js:764-768`, `:980-1036`):

- Read only at the user's click, and only with an API key.
- A read goes through the user's real friends, fake friends excluded, in the saved order. For each friend it reads the list and adds every id that is neither the user nor one of the user's friends, until 5000 (`FOF_MAX_IDS`). Reads are 250 ms apart.
- The result replaces the previous friends of friends, with the read time and the number of friends asked.
- If not one list among the friends could be read, the read ends in the state "error", most likely a wrong key. What was read before stays.
- They feed the map list through the rotating slice. They never join the pool.
- They stay in use after the key is deleted.

Tests: `map-finder.test.js:582` "reads friends' lists, leaving out the user and their friends", `:602` "not one readable list counts as an error, and what was read before stays", `:628` "are read only when the user asks, and only with a key", `:652` "clearing them stops a read under way, which then adds nothing", `:672` "after the key is deleted, friends of friends read before stay in use".

### 4.7 Planned for 1.0: coplay candidates

**Decision (owner, 2026-11-07):** this goes straight into 1.0, not into 0.9. Nothing of it exists in 0.9.7.

Facts (checked 2026-11-06):

- Steam keeps a "recently played with" list in `<Steam folder>\config\coplay_<SteamID64>.vdf`, written with no launch option (see the working rules).
- The format is binary KeyValues: `coplay` → `"0"`…`"99"` → `{SteamID: uint64, gameid: uint64, Playtime: uint32 unix time}`.
- It holds the last 100 players, with only the latest time per player.
- An entry has no mode, map or server. The mode can only come from the user's own CS2 state at that time.
- Times mark leaving a server, in batches:
  - each big batch came at a GSI change from playing to the menu (13, 6 and 7 entries, the last as CS2 closed);
  - two batches of 16 and 15 came 1 to 2 s after connects sent while the user was playing, as CS2 left the old server;
  - single entries during play are probably players leaving.
- 25 of the 100 were already in `map-finder.json`. Most of the rest probably hide game details: in October only 3 of GSI's 19 listed players reached the pool.
- Unknown: whether Steam writes the file during play, on leaving a server, or only after CS2 exits. It was last written 38 s after CS2's exit on 2026-11-06.

The plan:

1. Read the file whenever it changes.
2. Take the entries whose time falls on a casual match of the user's, judged against CS2's own state at that time.
3. Poll them for a day with the Maps rounds.
4. Put into the pool those that Steam shows on an official casual server; drop the rest after the day.

Requirements:

- It must work whether Steam writes the file during play or only after the game.
- It follows the pool rule of 4.4: these are players of the user's own matches.
- The open design points are listed in 14.

A second use was noted but not decided: a Prime estimate of the user's own match from those players' XP trails.

## 5. A round

### 5.1 Who is asked, in what order

Rules (`src/game/map-finder.js:942-973`):

1. friends and fake friends;
2. seeds;
3. the pool, most recently seen first;
4. in the room left, a slice of the friends of pool players followed by the friends of friends (each id once). The slice starts where the previous round's slice ended and wraps around.

Limits:

- At most 3000 ids per round (`MAX_IDS_PER_REFRESH`), which is 30 requests at Steam's 100 ids per request.
- The user is never asked about here. Only valid SteamID64s, each once.
- The slice's offset moves on by the room used, and returns to 0 when the pool, its players' friends or friends of friends are cleared.

Why:

- Seeds go before the pool: a full pool would leave them no room.
- The order is also the order of the requests. When Steam answers 429, 401, 403 or a 5xx, the rest of the batch is not sent ([06](06-steam-web-api.md)), so the least valuable ids drop out first.

Cost:

- Up to 30 requests per round, every 30 s while the finder polls. The friend check (8.5) and seed checks (4.3) come on top.
- **Measured (2026-10-30):** about 25 requests per 30 s.

Tests: `map-finder.test.js:300` "asks about friends, the pool and seeds, never the user", `:336`, `:354` "friends of friends take the room left, a different slice each time", `:864`.

### 5.2 What a round does with the answers

Rules, in order (`src/game/map-finder.js:542-616`):

1. Without a credential, or while Steam has turned the credential down, the round does nothing and everything known stays. It runs again once the credential is answered again or replaced (`src/steam/credential-state.js`).
2. A round asked for while one runs follows right after it.
3. Ask Steam about the ids of 5.1.
4. If not one id was answered, every request failed: Steam is down, the token expired or the daily limit was reached.
   - Servers, pool and status stay as they were, and the status line keeps the old time.
   - Reason: a join under way keeps its candidates, and the list does not go blank until a round gets through.
5. Otherwise, with the answers:
   1. seeds answered on an official server join the pool (4.3);
   2. pool players answered on an official server are renewed (4.4);
   3. players showing a sign of Prime are remembered (8.2);
   4. answered seeds are settled, and a `seeds` record goes to the journal;
   5. prune: the pool's age and size, the Prime marks' size, the read marks of players gone from the pool, and stale friend lists;
   6. note whose status changed (7.2);
   7. rebuild the servers from the answers (7);
   8. keep or drop the friend checks' verdicts (8.5);
   9. note the time and how many were asked;
   10. schedule a save (13.3).
6. Tell the view.
7. After a round with answers, start the friend checks in the background, unless the previous ones still run (8.5).

Partial answers: when some requests of a round fail, the servers are rebuilt from the answered players only. See 14.

Tests: `map-finder.test.js:181` "refreshes nothing and keeps the servers known until it is taken again", `:373` "does nothing without auth", `:381` "a refresh asked for during another one runs right after it", `:396` "a refresh Steam did not answer at all keeps the servers known".

## 6. When the finder polls

### 6.1 Needs

Requirement: the finder polls while at least one need holds (`src/game/map-finder.js:507-537`):

- **view**: the Maps tab is open, the window is not minimized, and either the window has the focus or CS2 is open (`src/ui/map-finder-view.js:166-173`);
- **join**: a map, server or pinned-maps join attempt is running, that is waiting, connecting or missing (`src/core/app.js:204`, `src/game/join-manager.js:121-129`). It is recomputed on every join status change;
- **keep**: maps are pinned and the keeper may start its join soon (12.5; `src/game/map-keeper.js:144-167`).

Starting and stopping:

- When the first need appears, the store is loaded (once per run), a round runs at once, and then one every 30 s (`REFRESH_INTERVAL_MS`).
- When no need is left, polling stops. Running joins go on asking Steam about their own candidates ([03](03-joining.md)).
- Seed checks (4.3) run whatever the needs.

Why:

- A join waiting while another tab is open, or the window is minimized, would otherwise go on with the servers known when the view closed.
- **Decision (owner, 2026-11-07, request cuts):** a Maps tab left open in a minimized window, or in a window left for another program with CS2 closed, would otherwise poll Steam all evening, or all night, for nobody.
- With CS2 open, a window without the focus still polls: the list may be watched on a second screen during play, or the window may sit behind CS2.
- Coming back to the window brings fresh servers at once, because a start runs a round.
- A running join or a pin keeps polling whatever the window does.

Tests:

- `map-finder.test.js:774` "polls while anything needs fresh servers and stops when nothing does";
- `maps-view-minimized.test.js:112` "an open Maps tab stops polling while the window is minimized, and resumes on restore";
- `:129` "%s keeps the finder polling while the window is minimized" (a running map join; a pinned map);
- `:159` "a closed Maps tab stays closed when the window comes back";
- `:172` "a Maps tab opened while the window is minimized waits for the restore";
- `:218` "leaving the window for another program stops polling, and coming back resumes it";
- `:232` "with CS2 open the list goes on behind CS2, or on a second screen";
- `:246` "a minimized window does not poll, CS2 open or not".

### 6.2 What the needs depend on

- **Minimized.** The shell reports minimize and restore. The page also asks once at load, for a reload made while minimized; a report that arrives before the answer wins over it (`src/core/window-state.js:26-47`, `src/main/main.js:168-182`).
  - Why: background throttling is off, which the join loop's pace under CS2 needs ([01](01-overview.md)). With it off, Electron keeps the page's visibility "visible" even when the window is minimized, so the page cannot see a minimize itself (commit bea74c9, 0.9.2).
  - Tests: `maps-view-minimized.test.js:102` "asks the main process once where the window stands, and listens from then on", `:187` "a page reloaded in a minimized window starts out not polling".
- **Focus**: from the window's focus and blur, starting from whether the document has the focus (`src/core/window-state.js:30-35`).
- **CS2 open**: the app's one answer ([05](05-cs2-gsi-and-local-steam.md)): Steam's game log, else a fresh GSI state, else Steam showing the user in CS2 (`src/game/user-location.js:60-65`).
- A change of any of these, or of the open tab, recomputes the view need.
- In 1.0 these facts belong to the core's polling planner ([architecture](../architecture.md)).

## 7. Servers

### 7.1 Grouping

Only official presences that have a server id and a map count. They are grouped by server id (`src/game/map-finder.js:130-147`).

### 7.2 Who speaks for a server

A server keeps its id when its match ends and it loads the next map, so its players can disagree for a while. Rules (`src/game/map-finder.js:148-163`):

- The player whose status changed last speaks for the server.
- On a tie, a running match beats a finished one, then the player with more rounds wins.
- The server's map is the speaker's map. Players still showing another map have not caught up, and are left out of the server.
- Among the players left, the one with the most rounds gives the score and the match-over state, since players can be a round apart.

When a status changed (`src/game/map-finder.js:717-725`):

- In each round, every answered player whose status key (3.4) differs from the last round's gets the time of this round. A player whose key is unchanged keeps the time it had.
- The first sighting counts as a change in that round.
- Players not answered in a round are forgotten (see 14).

Why:

- **Measured (journal, 2026-10-30 to 11-03):** the server kept its id and loaded the next map within about 15 s, while its players' presence still disagreed.
- The old rule took the score with the most rounds, so the final 8:2 outweighed the new map's 0:0, and the server hung on as "Dust II 8:2".
- Fixed on 2026-11-03 with the owner's approval.

Tests: `map-finder.test.js:102` "buildServers groups official players and keeps the latest score", `:127` "buildServers marks a match that has ended", `:137` "after a match a server's next map wins over players still showing the last one", `:158` "without a history a running match wins over a finished one".

### 7.3 Server fields

Fields (`src/game/map-finder.js:164-179`, `src/shared/types.js:67-79`):

- `serverId`, `map`;
- `score`: the score as Steam shows it, null when no rounds are known;
- `rounds`;
- `over`;
- `freeSlot`: a current player shows a connect (3.5);
- `primePlayers`: how many current players count as Prime (8.2);
- `players`: `{steamid, personaname, connect, prime}` for each current player.

### 7.4 The user's own server

Rules (`src/game/map-finder.js:688-707`):

- The user's server is the one Steam shows the user on. It is none while CS2 shows the menu (`src/game/user-location.js:44-52`).
- When CS2 reports the user's match (its map, and over at `gameover`) and Steam's copy of that server disagrees on the map or on over, the server is shown as CS2 has it:
  - CS2's map;
  - no score or rounds;
  - over as CS2 says;
  - no free slot and no players, since its known players still show the old match.
- Why: Steam's copy of the players lags when the match ends and the server moves on, under the same id, to its next map. GSI is pushed the moment it changes.
- The user's own Steam presence comes from the friends refresh, which carries it in the same request ([02](02-account-and-friends.md); `src/core/app-friends-manager.js:167-180`). See 14 for where that falls short.
- Test: `map-finder.test.js:239` "the user's server follows CS2 when it moves on to its next map".

### 7.5 Joinable

Rules (`src/game/map-finder.js:677-679`):

- A server is joinable unless its match is over or it is the user's own server.
- Servers that are not joinable stay listed, with Join disabled and a reason. **Decision (owner, 2026-11-03):** show but block, don't hide.

Tests: `map-finder.test.js:213` "offer nothing to join", `map-finder-view.test.js:95` "a map's servers say what is going on there", `:111` "the user's own server and map are marked and cannot be joined".

### 7.6 Order of servers, maps and candidates

- **Servers**, best to join first (`src/game/map-finder.js:112-116`):
  1. a running match before a finished one;
  2. a free slot first;
  3. fewer rounds played first, so the freshest match, with the most of it left, comes first.
- **Maps**, among those with at least one shown server (`src/game/map-finder.js:623-644`):
  1. more joinable servers with a free slot;
  2. more servers;
  3. by name.
- **Candidates**, the players to join through: the players of the joinable servers, in server order (`src/game/map-finder.js:734-757`).
  - A map takes its shown servers.
  - Several maps take their shown servers together, sorted as one list.
  - A server picked by hand is taken whatever "Prime only" says (8.4).

Tests: `map-finder.test.js:88` "compareServers puts a free slot first, then the freshest match", `:167` "compareServers puts finished matches last", `:968` "candidates come best server first across the maps, running matches only".

## 8. Prime

### 8.1 Signs of Prime

Requirement: a presence shows a sign of Prime, only while in CS2, when (`src/steam/rich-presence.js:66-72`, `steam-api-response-processor.js:247`):

- its XP trail level `game:xptrail` is 1 or more; or
- it is a Premier match: `game:mode` `competitive` with `game:qmmflags` `1`.

No sign proves nothing: a Prime player with no recent XP shows none.

Evidence (checked 2026-11-04):

- Steam shows Prime nowhere the app can read. This was checked in `GetPlayerLinkDetails`' account fields and in every rich presence key of the 32 players in CS2 among 2751 asked, and in every key in the journal.
- Valve's FAQ (help.steampowered.com, FAQ 4D81-BB44-4F5C-9B6B):
  - Prime users are matched with and against Prime users only, in all modes;
  - a lobby with any non-Prime member plays a non-Prime match;
  - Premier, XP and Service Medals need Prime;
  - Prime cannot be removed.
- Steam's public rich presence localization for CS2 has one flagged mode, `#gamemode_competitive_1` = "Premier". So Premier is competitive with `qmmflags` 1; there is never a `premier` mode value.
- The XP trail reading is inferred from names in CS2's files, not from a Valve document: `xp_trail_level` in `CSOPersonaDataPublic`, and the honor icon's `xptrail` classes. In the morning census 12 of 29 players with rich presence had a trail of 1 or more.
- Parties do not show in casual: 0 of 70 players on official casual servers had a party key, against 75 of 99 in competitive (2026-11-04, 21:56 Moscow time). A Prime player's non-Prime party cannot be ruled out in casual.

Tests: `rich-presence.test.js:46` "an XP trail of 1 or more is a sign of Prime", `:55` "Premier, competitive with qmmflags 1, is a sign of Prime", `:63` "no trail, plain competitive or junk is no sign".

### 8.2 Remembered for good

Rules (`src/game/map-finder.js:392-411`, `:1335-1341`):

- Anyone answered in a round, or any seed answered in a seed check, who shows a sign is remembered with the time last seen.
  - Why: Prime is never taken away, while an XP trail fades.
- A player counts as Prime with a sign now, or when remembered.
- Up to 20,000 are kept (`PRIME_MAX_IDS`), with no expiry. Over the cap, those seen longest ago go first. They are stored (13).
- Friends seen only by the friend check are not remembered (a test asserts it; no reason is recorded).

Tests: `map-finder.test.js:1023` "a player once seen with a sign of Prime keeps it after the sign fades", `:1073` "Prime players are saved and loaded with the pool", `:1098` "over the limit the players seen longest ago are forgotten", `:1113`.

### 8.3 Marks in the list

- **Server row**: a gold "Prime" tag when at least one current player counts as Prime.
  - Its tooltip: "Players with a sign of Prime here: N. The sign is CS2 XP or a Premier match; it does not promise that everyone here has Prime." The friend check's finding follows (8.5).
  - It dims to "Prime?", with a dashed border and a dimmer gold, on the friend check's "friend" verdict (`src/ui/map-finder-view.js:725-738`, `css/views.css:132-152`).
- **Map row**, with "Prime only" off: a gold "Prime: N" tag counting the map's servers that have a Prime player, with the tooltip "Servers where a player with a sign of Prime is seen: N of M".
  - With "Prime only" on there is no tag, since every listed server has one.
  - It is a tag rather than more words, so that its number does not run into the free-slot count beside it (owner's screenshot, 2026-11-05).
- The pool's clear can keep the players with a sign of Prime (10.3).

Tests: `map-finder.test.js:1013` "buildServers counts the players with a sign of Prime", `:1034` "with Prime only off every server is listed, and maps count those with Prime", `map-finder-view.test.js:362` "a server where someone shows a sign of Prime is marked, and its map counts them".

### 8.4 Prime only

What the user sees: a check box "Prime only" ("Только Prime"), drawn the way Steam draws check boxes, at the right above the list (`index.html:244-246`, `css/views.css:82-129`).

Rules:

- With it on (`src/game/map-finder.js:461-466`, `:663-668`), these keep to servers where at least one known player counts as Prime:
  - the map list and each map's servers;
  - the map joins;
  - the pinned-maps join.
- A server picked by hand is joined anyway: "a server the user picked is theirs to join".
- A running map or pinned join reads the switch again in every iteration, and judges each server by that iteration's fresh presence. A Prime candidate who moved on takes the server's mark along (`src/game/join-manager.js:259-276`).
- It is saved in the settings as `maps_prime_only: true`, and removed when off. It is restored at start (`src/ui/map-finder-view.js:270-280`, `src/core/app.js:302`). A failed save is logged, and the switch stays as clicked.
- When it hides every known server, the empty list says "No server with a visible Prime player right now. The others are hidden by "Prime only". Still searching."

Why:

- The owner asked for it on 2026-11-04. The base version was committed on 2026-11-05 as 5da74b9.
- **Decision (owner, 2026-11-04):** base version only. A friend check might come later, and then only as a mark, never excluding anyone.
- The mark is a likelihood, not a proof. A Prime player can be in a non-Prime match:

  - by joining a non-Prime friend through Join Game, the same route this app takes;
  - by staying on after a non-Prime party friend left.

  Both look solo from outside.

- The owner raised on 2026-11-04 that how often the filter errs cannot be measured from Steam data.
- The owner confirmed on 2026-11-04 that they have landed in non-Prime casual through the app's join.
- A server where only non-Prime players are visible never passes, since they show no XP trail if the inference of 8.1 holds. The filter's misses are Prime players who themselves joined a non-Prime match.
- **Measured (2026-11-04, evening).** Of 42 official casual servers:
  - 23 had a visible player with an XP trail of 1 or more;
  - 13 had two or more visible players.
- **Measured (in game, 2026-11-05, 0.9.1):** 7 map and pinned joins, all with "Prime only" on, all joined within 4 to 58 s.

Tests:

- `map-finder.test.js:1048` "with Prime only on, the list and map joins keep to servers with a sign of Prime", `:1066` "a server the user picks is joined through whatever Prime only says";
- `map-finder-view.test.js:385`, `:403` "with every server left out by Prime only, the empty list says why", `:413` "the switch turns Prime only on and keeps it in the settings", `:424` "a map join keeps to Prime only, a server picked by hand does not";
- `join-manager-map.test.js:409` "with Prime only, a server counts while a candidate on it shows a sign of Prime", `:437`, `:455`.

### 8.5 The friend check ("Prime?")

Purpose: to spot a Prime player who may have joined a friend's non-Prime match. A friend without a sign of Prime on the same server dims the server's mark.

**Decision (owner; built 2026-11-06 at the owner's request, commit 41975d3, in 0.9.2):** a mark only, never a filter. The list, "Prime only" and the joins ignore it. It is only shown, and written into the journal with each connect.

When it runs (`src/game/map-finder.js:604-610`, `:1148-1182`):

- Only with an API key, to read lists, and the main credential, to ask where the friends are.
- After each round with answers, in the background, never holding up the next round. A run still under way takes the new round's turn.

Which players are due (`src/game/map-finder.js:1193-1233`):

- Players counted Prime on known servers, servers best to join first: joinable before not joinable, then the order of 7.6.
- Only players whose last check was not made on the server they are on now.
- A server is settled once one of its Prime players is "alone" or "prime-friends" there. Its other players then need no check.

Budget: at most 4 checks per run that ask Steam anything (`FRIEND_CHECKS_PER_REFRESH`). A check that only finds a closed list read in the last day costs nothing.

- Why: a big pool can show dozens of Prime players on official servers at once (40 in the census of 2026-11-04). Checking them all would add several times the 30 requests of a round. Four add about 12.
- Since a verdict holds while its player stays, the checks still get through such a crowd within a few minutes, the servers best to join first.

One check (`src/game/map-finder.js:1246-1306`):

1. Take the player's friends list from the cache if it was read in the last 24 h. Otherwise read it with the key and cache it; an empty answer is cached as a closed list.
2. With an empty list, the verdict is unknown, reason "closed". Nothing more is asked.
3. Ask where the friends are, one request per 100 friends, with the main credential.
4. If any friend on the same server does not count as Prime, the verdict is "friend".
5. Otherwise, if every friend was answered: "prime-friends" when some friend is there, else "alone".
6. Otherwise (a friend's request failed), there is no verdict, and the player is checked again in a later round. `GetPlayerLinkDetails` answers every id of an answered request, so an unanswered friend means a failed request.

A verdict holds while its player stays on that server (`src/game/map-finder.js:1130-1138`):

- it is dropped when the player is answered on another server, or is no longer polled;
- it is kept when the player is polled but not answered in a round, since that is no sign they left;
- what was found stays after the key is deleted.

The server's verdict is the best of its Prime players' verdicts, in this order (`src/game/map-finder.js:67-101`):

1. `alone`;
2. `prime-friends`;
3. `pending`, not checked yet;
4. `no-key`;
5. `closed`;
6. `friend`.

A check made on another server counts as pending with a key, and as no-key without one. So "Prime?" shows only when every Prime player on the server has a friend there without a sign of Prime.

Shown text (tooltip after the Prime text, `src/i18n/locales/en.js:278-290`, `ru.js:284-295`):

- alone: "…most likely came through matchmaking. Friends who hide their game details do not show.";
- prime-friends: "…plays with friends who show a sign of Prime too…";
- friend: "…may have joined that friend's match without Prime." The tag reads "Prime?";
- pending: "…not checked yet.";
- no-key: "…no API key.";
- closed: "…the friends list is private or could not be read."

Friends seen by the check neither join the pool nor are remembered as Prime.

Kept: friends lists for a day in `map-finder.json`, up to 50,000 ids (`FRIEND_LISTS_MAX_IDS`), the lists read longest ago going first. A list read again moves to the newest. At about 20 bytes an id that is near 1 MB, which keeps the store inside its 5 MB with every other list full.

Why the check, and why it cannot prove anything:

- **Measured (census 2026-11-04).** Of the 40 XP-trail players on official casual servers:

  - 14 lists were closed (HTTP 401);
  - of the 26 open lists, 15 had a Steam friend on the same server, 7 of them a friend without an XP trail;
  - 11 had no friend there.

  By server, 10 of 25 had an XP-trail player with no friend on it.

- Friends who hide their game details stay invisible, so "alone" is not proof.

Tests:

- `map-finder.test.js:1175` "a player with a sign of Prime and no friend on the server marks it alone";
- `:1199` "friends there who all show a sign of Prime, now or before, mark it prime-friends";
- `:1218` "a friend there without a sign of Prime only dims the mark: the list, Prime only and joins stay";
- `:1252` "a closed list leaves the player unknown and asks nothing about friends";
- `:1266` "without a key no list is read and no friend asked about";
- `:1281` "a player not checked yet is unknown until the check comes";
- `:1294` "an answer missing a friend proves nobody absent: the player is checked again";
- `:1318` "a check holds while the player stays on the server and comes again on another one";
- `:1356` "a friends list is read again only after a day";
- `:1378` "a player alone settles the server: the others there need no check";
- `:1392` "a server takes its best player's answer, whoever was checked first";
- `:1413` "the order: alone, then Prime friends, then unknown, then a friend without Prime";
- `:1434` "a refresh starts a few checks at most, the servers best to join first";
- `:1466` "a closed list read in the last day is not read again and costs none of the budget";
- `:1503`, `:1546`;
- `map-finder-view.test.js:491` "each tag says what the check found, and a friend without Prime dims it to Prime?", `:518` "without a key the tags say the friends could not be checked", `:529` "the tags speak Russian too".

## 9. Friends lists and the API key

### 9.1 Which key reads lists

Rules (`src/ui/map-finder-view.js:195-200`):

- The main credential, if it is an API key (32 letters and digits).
- Else the key saved for this, `fof_api_key` in the settings, encrypted on disk like the main credential (`src/main/settings-store.js:8`).
- Else none.

Why a key at all:

- A web token cannot read other people's friends lists: `GetFriendList` answers HTTP 400 (2026-10-24, 11-04). A key can.
- The token reads only its owner's own list.
- The key is limited to 100,000 calls a day by Steam's terms.
- Presence polling uses the main credential and works without a key. `GetPlayerLinkDetails` answers the key exactly as the token (2026-11-04).
- What the lists gave stays without the key. The owner asked on 2026-11-03 whether the key must stay; it need not.

### 9.2 Lists are read only on a click

**Decision (owner, 2026-11-05, commit 92e0f70):**

- Friends lists are read only from the Read lists buttons: never by themselves, not when a key is saved, and not by the periodic round.
- Each list is one request on the user's key.
- The old automatic retries and due checks are gone.

Rules:

- One read per source at a time (`src/game/map-finder.js:764-780`).
- Progress shows in the source's row (10.3).
- Clearing friends of friends stops a read of them under way. It adds nothing found.
- Clearing the pool or its players' friends stops a read of pool players' friends under way. With a pool clear, the friends found before the stop stay.

### 9.3 The key line

The key line sits below the sources (`index.html:249-270`, `src/ui/map-finder-view.js:834-868`):

- It says "API key not set", "API key saved" or "Your main API key is used", with a link "Set key", "Change key" or "Hide".
- The details hold a password field ("Steam Web API key (32 characters)"), Save, Delete key (only with a saved key) and a hint.
- The details open on request, or after a read of friends of friends failed.
- The whole line hides when the main credential is a key.

Hints:

- with no key: "Reading friends lists… needs a Steam Web API key: a token cannot read other people's lists.";
- with no key but friends of friends kept: "Friends of friends (N) are kept and checked without a key. A key is only needed to read the lists again.";
- with a saved key: "API key saved. Friends lists are read only when you click Read lists…";
- after a failed read: "No friends list could be read with this key. Check the key."

Save and Delete (`src/ui/map-finder-view.js:285-329`):

- Save checks the format only. A value that is not 32 letters and digits gets "That is not an API key: it should be 32 letters and digits.", and the field is marked invalid.
- Saving reads nothing.
- Deleting keeps everything found: the key is only needed to read the lists again, so it can be used once and deleted.
- A failed settings write is logged, and the field keeps its value.

### 9.4 Failures

- A private list answers HTTP 401 to a key. It is read as an empty list (`src/steam/steam-api-client.js:635-649`). A failed request, a 429 or a 5xx is read the same way.
- Friends of friends: if not one list among the user's friends could be read, the row says "no list could be read" and the key details open with "Check the key". The previous friends of friends stay.
- Friends of pool players have no error state. Every player tried is marked as read for a day, even when the read failed (14).
- In the friend check an empty answer is cached as a closed list for a day (14).
- A key Steam rejects for `GetFriendList` is not marked as a rejected credential, since only `GetPlayerLinkDetails` and `GetPlayerSummaries` count (`src/steam/steam-api-client.js:17-20`). Only a rejection of the main credential stops the rounds.

Tests: `steam-presence.test.js:297` "lists someone else's friends with an API key", `:318` "a private list comes back empty".

## 10. The Maps view

### 10.1 Layout

From the top (`index.html:182-185`, `:200`, `:243-271`):

- The "Maps" tab, between Friends and Fake Friends, shows the number of maps listed, and nothing for none (`src/ui/view-tabs.js:63`).
  - The tab was moved before Fake Friends on 2026-11-05.
  - Tabs never wrap.
- Next to the tabs, while the Maps tab is open: the status line (10.2).
- A toolbar with the "Prime only" switch.
- The pinned row while maps are pinned (12.2), then the map rows, each opening into its server rows.
- The empty-list message.
- The sources block, one row per source (10.3).
- The key line and its details (9.3).

Look: Steam's compact, friends-list-like style (**Decision (owner, 2026-11-03)**; see [07](07-ui-shell-security-and-updates.md) and the working rules).

- Rows look like friend rows, tags are gold, and the pin is a square icon button.
- Join buttons have the one long-button size.
- The triangles and the check box are drawn, not typed, and there is no emoji.
- The owner kept this UI on 2026-11-03 after seeing dot and larger-size variants.

### 10.2 Status line and empty list

Status line (`src/ui/map-finder-view.js:810-828`):

- "updated HH:MM:SS · searching N players", from the last round with answers. The time is in 24-hour form in both languages.
- "searching…" while the first round runs, and nothing before any.
- A narrow window cuts the line with an ellipsis.
- Read progress never shows here. It overflowed the window in the owner's screenshot, so on 2026-11-05 it moved into the source rows (test `map-finder-view.test.js:340` "a read under way shows in its row, not next to the tabs").

Empty list, the first that applies (`src/ui/map-finder-view.js:789-804`):

1. no main credential: "Enter your Steam Web API token or key and SteamID64 first.";
2. "Prime only" hides every known server: the message of 8.4;
3. a round runs or none has finished yet: "Looking for players on official servers…";
4. otherwise: "Nobody found on official casual servers right now. The search keeps going."

### 10.3 Sources block

Each of the three rows has a name with a tooltip, a count, a state and buttons (`src/ui/map-finder-view.js:421-601`). Counts are written with thousands set apart as the language writes them: "19 510" in Russian, "19,510" in English.

- **Pool** ("Пул"). Tooltip: "Players from your casual matches in the last two weeks".
  - The state is empty.
  - Button: Clear, off while the pool is empty.
  - The first click asks in place: "Remove from the pool:", with "everyone", "without a sign of Prime (N)" and "cancel". "Without a sign of Prime" is off when N is 0. A choice clears at once and returns to the one button. The question does not expire.
  - A clear removes everyone, or those never seen with a sign of Prime (`src/game/map-finder.js:829-848`). It also:
    - drops the read marks of those removed;
    - forgets which seeds were answered this run, so players met this run may join again;
    - stops a read of pool players' friends under way;
    - keeps the friends of pool players found so far.
  - A note of 2026-11-03 says the pool's clear also cleared its players' friends. Since 2026-11-05 it does not; the code wins.
- **Friends of pool players** ("Друзья игроков пула"). Tooltip: "Friends of pool players, from their public friends lists".
  - State: "reading D of T…" while a read runs.
  - Read lists ("Прочитать списки"):
    - hidden while reading;
    - off without a key, with the tooltip "Needs a Steam Web API key: a token cannot read other people's friends lists";
    - off when no pool player is due, with "Every pool player's list was read in the last day";
    - otherwise its tooltip ends with the number of lists a read takes.
  - Clear takes a second click within 3 s: the first click turns it into "Sure? Click again". It is off while there is nothing to clear. It forgets the ids and the read marks, so the next read takes every pool player again (`src/game/map-finder.js:855-861`).
- **Friends of friends** ("Друзья друзей"). Tooltip: "Your friends' friends, from their public friends lists".
  - State: "reading D of T…", or "no list could be read" after a failed read, or "read DD.MM" after one that worked.
  - Read lists: off without a key, or without friends ("No friends in your list yet"). Otherwise the tooltip gives the number of friends.
  - Clear takes two clicks, as above. Read lists brings them back.

Why:

- The owner asked on 2026-11-05 for one row per source, with its count, its progress and its buttons.
- The clears of friends lists take a second click, as a fake friend's remove button does (`CLEAR_CONFIRM_MS` = 3 s).
- The pool's clear asks whom to forget.

Tests: `map-finder-view.test.js:219` "each source shows how many players it holds", `:241` "the pool's clear asks whom to forget: everyone, or those without a sign of Prime", `:270` "the other clears ask on the first click and clear on the second", `:289` "a clear forgets its first click after a few seconds", `:311` "clears are off with nothing to clear", `:319` "lists are read only on a click, and only with a key"; `map-finder.test.js:883`, `:906` "clearing the pool can keep the players seen with a sign of Prime", `:919`.

### 10.4 Map rows

One row for each map with at least one shown server, in the order of 7.6 (`src/ui/map-finder-view.js:640-685`). Each has:

- a triangle, pointing down when the row is open;
- the map's name;
- "N servers";
- the Prime tag (8.3);
- the status label;
- the pin (12.1);
- Join.

Behaviour:

- A click on the row, not on its buttons, opens or closes its server rows. Open maps are remembered for the run.
- The label while no join runs:
  - "you're on this map" ("вы на этой карте") while the user plays this map: casual and not over, as CS2 says, or as Steam says without CS2 (`src/game/user-location.js:83-95`);
  - else "{count} with a free slot", when more than one server is listed and some joinable one has a free slot;
  - else "free slot" or "no free slot".
- The button: Join; "Wait for a slot" when no joinable server shows a free slot; disabled while the user is on this map.
- Map names: a fixed table of 13 maps (Dust II, Mirage, Inferno and the rest). Any other code is shown without its two-letter prefix, capitalised (`src/shared/map-labels.js:5-32`). Test: `map-labels.test.js:7` "mapLabel names known maps and tidies unknown ones".

### 10.5 Server rows

An open map lists its servers best first (`src/ui/map-finder-view.js:692-715`). Each row has:

- a title:
  - "Final score X : Y" when the match is over;
  - "Round R · X : Y", where R is the rounds played plus one, the round in progress;
  - "No score yet" otherwise;
- the Prime tag and the status label;
- Join.

The label while no join runs:

- "match over" ("матч закончился");
- "you're here" ("вы здесь") on the user's server;
- else "free slot" or "no free slot".

The button: disabled on the user's server and when the match is over; "Wait for a slot" without a free slot; Join otherwise.

### 10.6 Labels and buttons

A running attempt decides first (`src/ui/join-status.js:80-129`):

| Attempt status | Label                                 | Button         |
| -------------- | ------------------------------------- | -------------- |
| connecting     | "connecting…"                         | Cancel         |
| waiting        | "waiting for a slot"                  | Cancel         |
| missing        | "not in casual"                       | Cancel         |
| joined         | "on the server", with the drawn check | Join, disabled |
| none           | as 10.4, 10.5 and 12.2                | as there       |

- Rows keep their slot facts (free, here, over, the idle text) on the label and the button, so a status update needs nothing but the status.
- In 1.0 the UI gets these from the core's snapshot instead.

### 10.7 Rendering

- Everything that comes from other players is escaped, in text and in attributes: names, map codes, server ids and scores.
- A join id escaped into an element id still works as that element's id.
- The list and the sources are rewritten only when their content changed. The finder tells the view after every round, and most rounds change nothing; rewriting only on a change keeps the rows steady under the mouse.
- The view renders again on any change of the finder, of where the user is, of the pins, or of the language. It speaks Russian and English, with plurals.

Tests: `map-finder-view-ids.test.js:82` "the label and the button carry the id escaped", `:103` "StatusManager still finds the label and the button by the raw id".

## 11. Joins from the Maps view

### 11.1 What each button starts

Rules (`src/ui/map-finder-view.js:216-264`, `src/game/join-manager.js:180-195`):

- **Join on a map row** starts a map join.
  - Its id is `map-<map code>` and its label the map's name.
  - Its candidates are the players of the map's joinable shown servers, best server first, read again in every iteration so new arrivals count.
  - "Prime only" applies, read in every iteration.
  - The pins go unless this map is pinned (12.4).
- **Join on a server row** starts a server join.
  - Its id is `srv-<server id>`, and its label the map and the score at the time of the click.
  - Its candidates are the players on that server while it plays that map and is joinable.
  - "Prime only" does not apply.
  - The pins go unless the map is pinned.
- **Join on the pinned row** starts the pinned-maps join (12.2).
- **Cancel on a running row** cancels that attempt. Cancelling the pinned-maps join, here or in the join bar, lets the pins go.

Each is a join attempt of [03](03-joining.md): it checks that CS2 runs and offers to launch it, shows in the join bar, sends connects through the candidates' join links, and ends the other attempts when it joins. Several map and server joins may run at once.

Tests: `map-finder-view.test.js:146` "Join on a map not pinned lets the pins go, and so does cancelling their join", `:424`; `join-manager-map.test.js:827` "an attempt is named after its label before Steam answers", `:842` "a server join is tracked under its own id"; `join-bar.test.js:71` "names a map attempt after the map and explains a full server".

### 11.2 Each iteration of a map or server join

Every iteration makes one presence request for the user and all candidates, in chunks of 100 (`src/game/join-manager.js:233-346`):

1. No answer about the user: "could not ask", which spends [03](03-joining.md)'s failure budget.
2. On target: candidates now on an official casual server, on the join's map or maps, and on the chosen server for a server join.
3. "Prime only", for map and pinned joins: only servers where a candidate counts as Prime in this very poll.
4. Running: not over by the candidate's own score.
5. Joinable: not on the user's server, as this poll shows it. There is no user's server while CS2 shows the menu.
6. The pick: the first joinable candidate showing a join link, in candidate order, that is best server first.
7. Nothing joinable: the attempt is "missing". After 60 s with nothing (`MISSING_TIMEOUT_MS`) it ends with the reason "missing" (`src/game/join-manager.js:586-603`).
8. Joinable but no link: "waiting for a slot".

Tests: `join-manager-map.test.js:81` "joins through the first candidate on the map that offers a connect", `:107`, `:132` "ignores candidates who moved to another map, a match or a community server", `:160` "sticks to the chosen server", `:178`, `:219` "skips a finished match and the user's own server", `:356` "a join of several maps takes a server of any of them", `:813` "waits while every known server of the map is full".

### 11.3 When it counts as joined

Rules (`src/game/join-manager.js:313-343`):

- A **server join**: Steam shows the user on that server.
- A **map or pinned join**:
  - with CS2's fresh state in a match: casual, on one of the join's maps, and not at `gameover`;
  - without it, by Steam: on a server, not on a final score, and either on a server where a candidate was running, or on any official server of the maps.

Why:

- CS2 knows its map and mode at once, while Steam shows the old ones for a while after a match ends.
- A deathmatch on the map is not a casual match there.
- Without CS2's state, Steam's final score means the user is on a server about to move on.

Tests: `join-manager-map.test.js:186` "a map join succeeds on any server of the map", `:252` "a map join goes by the map CS2 shows, not the one Steam still shows", `:288` "a map join does not count a match on the map in another mode", `:316` "without CS2's state, a finished match on the user's own server is not a join", `:388` "a server join succeeds on that server only"; `join-replay.test.js:242` "2026-10-30 20:26: the match ends at 8:2 while another Dust II server has a slot" (`:267`, `:280`).

### 11.4 Two joins through one player

A map join and a server join running at once can meet the same player's token. Only one connect goes out per token, from any attempt ([03](03-joining.md)).

- **Measured (2026-11-03 00:21:24):** a server join and a map join both sent the same connect before this rule existed.
- Test: `join-manager-map.test.js:719` "a server and its map joined at once through one player send one connect".

### 11.5 Journal

Each connect of a map, server or pinned join carries `prime: {only, players, check}`:

- `only`: whether "Prime only" applied;
- `players`: how many Prime candidates were on the server picked;
- `check`: the friend check's verdict for that server, null without a Prime player there.

If the user lands in a match without Prime, this says what the server showed when the connect went out (`src/game/join-manager.js:304-312`, `:701-709`).

Tests: `join-manager-map.test.js:480` "the friend check of the server picked is noted, and changes nothing about the pick", `:603` "the journal notes what the server showed of Prime when the connect went out", `:626`; `map-finder-view.test.js:546` "a join hands the journal what the check says about a server".

## 12. Pinned maps and the keeper

### 12.1 Pins

Rules (`src/ui/map-finder-view.js:760-767`, `src/game/map-keeper.js:40-78`):

- The pin on a map row pins or unpins that map.
  - It is lit while pinned.
  - Tooltips: "Pin this map. A row above the list then joins any pinned map, and when a match ends the app joins one of them by itself" and "Keeping this map. Click to stop".
  - A click on the pin does not open or close the row.
- Several maps can be pinned. They are kept in the order pinned.
- Pins last for the run only; they are not saved.

History: "keep the map" was built on 2026-11-03 at the owner's request. The pins became a set the same night (commit be49018).

Test: `map-finder-view.test.js:131` "the pin keeps a map, and a second click lets it go".

### 12.2 The pinned row and its join

The pinned row stands above the map rows while maps are pinned (`src/ui/map-finder-view.js:610-633`):

- It shows "Any pinned map" ("Любая из закреплённых"), the pinned maps' names joined by " / ", the status label, "Unpin all" and Join.
- The label while no join runs:
  - "you're on a pinned map" ("вы на закреплённой карте") while the user plays one, with Join disabled;
  - else "{count} with a free slot" when there is more than one;
  - else "free slot" or "no free slot".
- The count adds up the free joinable servers of the pinned maps that are listed, with "Prime only" applied.

The pinned-maps join (`src/game/map-keeper.js:101-113`):

- One attempt, with the id `maps-pinned`, for all pinned maps.
- Its candidates are the players of the joinable shown servers of every pinned map, best server first across the maps.
- The maps, the label and "Prime only" are read again in every iteration, so pinning or unpinning while it runs counts, and the join bar's title follows the pins.
- A second pinned-maps join never starts while one runs.

Tests: `map-finder-view.test.js:170` "pinned maps gather in a row whose Join takes any of them"; `map-keeper.test.js:87` "one join takes any pinned map, read again as pins change", `:114` "starts no second join while one runs"; `join-repaint.test.js:185` "the join bar follows the name of a pinned-maps attempt as the pins change".

### 12.3 When the keeper joins by itself

Rules (`src/game/map-keeper.js:199-226`):

- Only on CS2's own state (GSI), while the user's match is casual. The keeper starts the pinned-maps join when CS2 reports either:
  - the match over (`gameover`), on any map; or
  - a casual match on a map that is not pinned.
- It reacts to changes only: each pair of map and over-or-not starts at most one join, so a join that found nothing is not restarted on every state CS2 posts.
- The menu, loading, another mode, or a CS2 that went silent start nothing, and clear the memory of the last state.
- Pinning or unpinning clears that memory too. So a pin set while on another casual map, or at `gameover`, starts the join at once.
- Nothing starts while the pinned-maps join runs.

Why:

- A casual server loads another map when its match ends, and the owner wants to stay on the maps they chose.
- Staying quiet in the menu means leaving a match never pulls the user back in.

**Decision (owner, 2026-11-03):** join at `gameover`, for speed, rather than wait for the next map. Gameover to the next map's warmup took 14 to 24 s in three journal cases. Don't propose waiting again without new evidence.

Unverified in game: whether the next casual map can be the same map. If it can, the gameover trigger may still move the user to another server.

Tests: `map-keeper.test.js:73` "joins a server of a pinned map once the match on one ends", `:101` "stays quiet in the menu, in another mode, on a pinned map and on states it has seen".

### 12.4 When pins go

Rules (`src/game/map-keeper.js:80-94`, `:182-197`):

- The user starts a friend's or a fake friend's join: all pins go (`src/ui/friends-view.js:83`, `src/ui/fake-friends-view.js:94`).
- The user starts a map or server join on a map that is not pinned: all pins go. On a pinned map they stay.
- The user cancels the pinned-maps join, on its row or in the join bar: all pins go (`src/ui/join-bar.js:46`).
- Unpinning the last map, or "Unpin all", cancels a running pinned-maps join with the reason "unpinned".
- A pinned-maps join that ends by itself, missing, joined, or ended by another attempt's join, keeps the pins.

Tests: `map-keeper.test.js:129` "the pins go when the user joins a friend or a map not pinned, or cancels their join", `:147` "unpinning the last map ends its join and lets the map finder rest".

### 12.5 When pins need polling

**Decision (owner, 2026-11-07, request cuts):** pins hold the finder's "keep" need only while a pinned-maps join may start soon (`src/game/map-keeper.js:148-167`):

- CS2's fresh state is required. With CS2 closed, silent or on another account there is no need; Steam showing CS2 open is not enough.
- In CS2's menu: needed. The next state may be a casual match on a map not pinned, which starts the join at once, so the servers must be fresh.
- In a match that is not casual: not needed.
- In a casual match:
  - at `gameover`: needed;
  - without a score from CS2: needed, as before this rule;
  - otherwise only from match point on, when a side has 7 rounds (`CASUAL_ROUNDS_TO_WIN - 1`) and one more round can end the match.

Why:

- The finder looks every 30 s. From match point on it has the time to look again before the match ends. This rests on the code's comment that a round lasts long enough; it was not measured.
- Before match point, in other modes, and without CS2 nothing can start the join, so polling would be for nothing.

The score comes from GSI's `map.team_ct.score` and `map.team_t.score`, names found in CS2's client.dll on 2026-11-07 (`src/game/gsi-manager.js:21-25`). Whether casual payloads carry them is not yet seen in game (14).

Tests: `map-keeper.test.js:168` "pinned with CS2 closed: the finder rests until CS2 posts", `:177` "CS2 falling silent lets the finder rest", `:189` "without CS2's own state no pin can join: Steam showing CS2 open is not enough", `:196` "in a casual match the finder rests until match point, then looks until the match ends", `:209` "a casual match without a score from CS2 keeps the finder looking, as before", `:216` "%s starts no pin's join, and the finder rests", `:226` "back in the menu the finder looks again".

## 13. The store: map-finder.json

### 13.1 Location and shape

The file is `%APPDATA%\cs2-casual-enjoyer\map-finder.json` (`src/main/main.js:17-20`). Version 1 (`src/game/map-finder.js:1444-1459`):

```
{
  "version": 1,
  "pool":        { "<SteamID64>": { "lastSeen": <ms>, "map": "<map code>" } },
  "poolFriends": { "ids": ["<SteamID64>", ...],
                   "crawled": { "<pool player SteamID64>": <ms of the list read> } },
  "fof":         { "ids": ["<SteamID64>", ...], "fetchedAt": <ms>, "friendsCount": <n> },
  "prime":       { "<SteamID64>": <ms last seen with a sign of Prime> },
  "friendLists": { "<SteamID64>": { "at": <ms>, "ids": ["<SteamID64>", ...] } }
}
```

- `poolFriends.ids` are ordered oldest first.
- `friendLists` are ordered oldest read first. A closed list is `ids: []`.
- The pool entry's `map` and `fof.friendsCount` are written but nothing reads them (14).

### 13.2 Load

Rules (`src/game/map-finder.js:1363-1438`):

- The store is read once per run, at the first start of polling or the first seed check. Whoever asks while the read is under way waits for it rather than going on with an empty pool.
- Each part is validated:
  - pool entries need a valid SteamID64 and a finite `lastSeen`;
  - Prime marks need a valid id and a finite time, and the newer of disk and memory wins;
  - `fof.ids` are kept when valid, the first 5000;
  - `poolFriends.ids` are kept when valid, the last 20,000, and read marks need a valid id and a finite time;
  - friend lists need a valid id, a finite `at` and an `ids` array, and a list already read this run wins over its copy on disk.
- Then the pruning of 5.2 runs: expired pool entries, read marks of players no longer in the pool, and stale or excess friend lists go.
- After the load the view is told, so it shows the counts read even when no round follows. Without a working token none does.
- A missing or unreadable file reads as empty (14).

Tests: `map-finder.test.js:685` "loads valid pool entries and friends of friends from disk", `:710` "a load asked for while the first is still reading waits for its data", `:753` "a load tells the view, so it shows the pool read even with no refresh after", `:932`, `:1073`, `:1503`.

### 13.3 Save

Rules:

- A change schedules one save 2 s later (`SAVE_DEBOUNCE_MS`). Changes in the meantime ride along.
- Every round schedules one. So do:
  - a seed check that added to the pool or to the Prime marks;
  - each friends list the friend check reads;
  - a finished read of friends of friends;
  - the end of a read of pool players' friends, even one stopped or failed, so that what it read is kept;
  - every clear.
- A failed write is reported as false and otherwise ignored.

Test: `map-finder.test.js:736` "saves once shortly after changes".

### 13.4 Write

Rules (`src/main/map-finder-store.js:24-40`):

- Anything that is not an object, or whose JSON is over 5 MiB, is refused, and nothing is written.
- The text is written beside the store as `map-finder.json.tmp` and renamed over it. A write that breaks off, from a crash or a full disk, leaves the previous store readable instead of a pool weeks in the making cut short.
- Every list at its limit still fits: pool 5000, friends of pool players 20,000 with 5000 read marks, friends of friends 5000, Prime 20,000, friend lists 50,000 ids.

Tests: `map-finder-store.test.js:29` "round-trips the data and reads a missing file as null", `:38` "a write that breaks off halfway leaves the previous store readable", `:61` "a store with every list at its limit still fits, the friend check's lists included", `:105` "refuses anything that is not an object, or too big".

### 13.5 Kept elsewhere, or not at all

- In `settings.json`:
  - `maps_prime_only: true`, absent when off;
  - `fof_api_key`, encrypted like the main credential ([02](02-account-and-friends.md)).
- Not kept across runs:
  - pins;
  - which maps are open;
  - seeds and which seeds were answered;
  - the status history of 7.2;
  - the friend check's verdicts;
  - the servers.

### 13.6 In 1.0

- 1.0 must import version 1 as above, tolerating junk entries the way the load does ([migration](../migration.md)).
- 0.9.6 and earlier pooled anyone seen on an official server. An imported pool may still hold such players; they age out within 14 days unless seen again. The owner declined an in-app cleanup (4.4).
- Prefer one store owned by the core. Write it only when something changed (14).

## 14. Smells and open questions

Smells in the 0.9.7 code:

1. **Polling decisions are scattered.**
   - The view sets "view", app.js sets "join" from the join status callback, and the keeper sets "keep".
   - Seed checks and friend checks sit outside any need.
   - In 1.0 one polling planner should own all of it ([architecture](../architecture.md)).
2. **`start()` is not safe across its await** (`src/game/map-finder.js:517-528`). A stop and a start that both land while the store load is awaited leave two intervals running, so polling doubles until the next stop. The window is the store read on the first start, and one microtask on every later one. It was found by reading the code, not observed.
3. **No spacing between rounds.** Every start runs a round at once. A need that flaps fires a full round, up to 30 requests, each time. Examples: switching tabs quickly, or moving the focus in and out of the window with CS2 closed.
4. **Partial answers** (`src/game/map-finder.js:566-596`).
   - When some requests of a round fail, for example a 429 that also stops the rest of the batch, the servers are rebuilt from the answered part only. Servers known only through the later chunks, the friends-of-friends slice, vanish for that round.
   - The status history keeps only the answered players. A player missing for one round comes back as "changed now" and can speak for their server with a stale map for one round.
5. **A rematch on the same map** (`src/game/map-finder.js:156-162`). If a server loads the same map again, players still showing the final score count as on the current map. The most-rounds rule then marks the server over until they catch up. Whether casual can repeat a map is unverified (open question 2).
6. **The pool cap is above the round cap.**
   - `POOL_MAX` is 5000, but a round asks about at most 3000 ids, friends and seeds included.
   - With a full pool, its oldest players are never polled, so they can only expire.
   - More than 3000 friends would starve every other source.
7. **Saves.**
   - Every round schedules a save even when nothing changed. While polling, the whole store, about 2.6 MB at its limits, is rewritten every 30 s.
   - The constant's comment says "after the last change". The timer actually starts at the first change and is not restarted, so it throttles rather than debounces.
8. **An unreadable store reads as empty**, and the next save overwrites it. A corrupt file loses the pool silently. Atomic writes make this unlikely now.
9. **Failed reads of pool players' friends.** A player is marked as read for a day even when the read failed. This source has no error state, unlike friends of friends. With a wrong key every pool player is marked read for a day.
10. **The friend check caches a failed list read** as a closed list for a day (`src/game/map-finder.js:1249-1263`), because `getFriendIdsOf` answers `[]` both for a private list and for a failure.
11. **A friends-of-friends read replaces the whole list.** The 5000 cap fills from the first friends in the saved order, so later friends are never read. Nothing rotates through them.
12. **`_checkSeeds` ignores a rejected credential**, which the rounds honour. Each newly spectated player then sends a request bound to fail.
13. **One look per seed per run.** A seed Steam answered as "in CS2 but not official", perhaps because its presence still lags behind the match, is dropped for the run, even if met again in a later match.
14. **Dead data.**
    - The pool entry's `map` and `fof.friendsCount` are stored but never read.
    - The locale key `mapFinder.fofTitle` is unused.
    - The hint "Your main API key is used for friends lists." sits inside the key details, which are hidden whenever the main credential is a key, so it never shows.
15. **The user's own server keeps its old Prime count.** When it is replaced by CS2's view (7.4), its players are cleared but `primePlayers` is kept. A Prime tag, a place under "Prime only" and the map's "Prime: N" then come from players who are no longer there. `getPrimeCheck` reads the raw servers instead.
16. **The user's own server can be stale.**
    - It comes from the user's Steam presence, which only the friends refresh fetches.
    - That refresh stops while the window is minimized, and never runs without any friend or fake friend.
    - The blocking marks, the replacement of 7.4 and the candidate filter then work from old data or none.
    - Joins stay safe, because they ask Steam about the user themselves (11.2).
17. **Pins.**
    - A pinned map with no known server has no row, so it can only be unpinned through "Unpin all".
    - Pins are not saved across restarts. Whether that is intended is not recorded.
18. **Wording for a map join with nothing to join.** The map row says "not in casual" and the join bar "Left casual: waiting a minute for a return". That is a friend's wording; for a map it means no known player is left on its servers.
19. **A map whose servers are all over** says "no free slot" and offers "Wait for a slot". A click ends as "missing" after 60 s.
20. **A server join is bound to the map of the click.** When the server loads its next map, the join finds no candidates and ends as "missing" after 60 s. Its label keeps the score of the click. This is probably intended, since the user picked "Dust II 3 : 1", but it is not recorded.
21. **A rejected credential with no round done yet.** The empty list says "Looking for players…" for good, and nothing in the tab says polling stopped. With earlier rounds, only the old "updated" time hints at it.
22. **The pinned-maps join's cancel reason.** A user's Cancel of it is journaled as "unpinned", not "cancelled". The pins' release cancels the join first, and the journal keeps the first reason.
23. **The read button on an empty pool** has the tooltip "Every pool player's list was read in the last day".
24. **Minor.**
    - `getStatus()` runs several times per render, and sorts the pool each time.
    - "searching N players" has no thousands separator, while the source counts do.
    - The pool on disk is set over the pool in memory without comparing times, while Prime marks and friend lists compare. It is harmless only because every writer waits for the load first.
25. **Prime memory skips the friends seen by the friend check.** A test asserts this, but no reason is recorded. Decide it on purpose in 1.0.

Open questions:

1. Whether casual GSI payloads carry `map.team_ct.score` and `map.team_t.score`. The keeper's match-point rule depends on it; without them it polls as before.
2. Whether the next casual map can be the same one. This bears on smell 5 and on the gameover trigger (12.3).
3. How long other players' presence lags at the end of a match. It was not measured: on 2026-11-03 the saved token had expired, and few players were on in the morning.
4. The request cost of map joins. Candidate lists have no bound: every player on every joinable server of the maps. With more than 99 candidates, each join iteration, about two a second, costs two requests or more. Not measured.
5. The day's budget on a key. If the rounds ran all day on an API key as the main credential, they alone would make 86,400 requests, near Steam's 100,000 a day, before friend checks and joins. No limit is published for the token. Should the 1.0 planner budget requests?
6. The coplay candidates (4.7):
   - when Steam writes the file;
   - how to tie an entry's time to a casual match of the user's, which needs a short history of the user's own CS2 state, kept in 0.9.7 only in the join journal;
   - how many of these players hide their game details;
   - where they go in the round order: next to the seeds, before the pool, seems natural, for the same reason as seeds;
   - whether a day is the right trial period.
7. The signature's known gap (3.2): an anonymous community server on a stock map reporting `kv` would pass as official. It has not been seen; it would need a new signal if it ever is.
8. Neither "Prime only" nor the friend check can be checked against the truth from Steam data. The friend check's "alone" is no proof, since friends who hide game details are invisible.
9. The 30 s round has no recorded measurement, and the match-point rule assumes a casual round outlasts it. Check both in game before changing either.
10. Whether a short-lived slot can be caught by sending the same token again is a question of [03](03-joining.md), but it applies to map joins too.
