# 06 Steam Web API

How the app talks to the Steam Web API: the methods it calls and the credential each takes, request size and the sharing of requests between callers, timeouts and failures, the pause after Steam turns a credential down, avatars, and how answers become the app's player model. The last parts count the requests each feature makes and list what looks accidental or is still unknown.

Written from version 0.9.7 (commit 4f1b311, 2026-11-07) for the 1.0.0 rewrite. Nothing here assumes the rewrite's platform.

**How to read it**

- `path:line` points into the 0.9.7 tree. `__tests__/<file>:N "name"` points at a test whose name states the intended behaviour.
- **Measured (date)**: seen live, as recorded in the project notes (casual-map-finder-research, pending-game-check, no-extra-setup, v1-rewrite-plan) or in a commit message. Numbers are given as recorded.
- **User decision (date)**: the user's call. Do not reopen it without new evidence.
- **Inferred**: reasoning, not observation.
- The notes are dated. Where the code has changed since, this file describes the code and says what changed.

## 1. Credentials

### 1.1 The two kinds

- **Web token**: the user's own token, a JWT. The user copies it from `store.steampowered.com/pointssummary/ajaxgetasyncconfig`, which the app opens through `steam://openurl/...`. The page shows JSON with `data.webapi_token`. The app accepts that whole JSON or the bare token (`src/utils/validators.js:49-85`; `__tests__/validators.test.js:48` "takes the token out of the JSON Steam shows").
  - The payload's `sub` is the owner's SteamID64 and `exp` the expiry in Unix seconds. The app reads them without checking the signature (`validators.js:94-113`). Decoding is base64url (`validators.test.js:81` "decodes base64url payloads that plain base64 cannot").
  - The SteamID field is filled in from `sub` (`src/core/app-input-manager.js:148-153`).
  - **Measured 2026-11-04:** the token is issued for the audiences client and web, lives 24.2 h, and carries the user's IP address. So it must never be logged or shown, and must go nowhere except into the request.
- **API key**: optional, 32 letters and digits, from `steamcommunity.com/dev/apikey` (`VALIDATION_PATTERNS.API_KEY`, `src/shared/constants.js:151`). It is used in one of two ways:
  - as the main credential, in place of a token;
  - as a second key, saved only to read other people's friends lists (`fof_api_key`, `src/ui/map-finder-view.js:190-200`).
- **User decision (2026-10-30, note no-extra-setup):** players must need nothing beyond the token or the key: no launch options, no other setup. Some players already balk at getting a token or a key.

### 1.2 Telling them apart

- A **token** is anything shaped like a JWT: `^[\w-]+\.[\w-]+\.[\w-]+$` (`constants.js:152`, `validators.js:36-39`). The URL builder sends a token as `access_token=` and **anything else** as `key=` (`src/steam/api-config.js:77-89`).
- A **key** is `^[A-Z0-9]{32}$`, case-insensitive (`validators.js:26-29`). This check picks the friends-list key (`map-finder-view.js:195-200`) and the account bar's wording (`app-input-manager.js:287`).
- The credential is read from the input field for every round: trimmed, with the token taken out of pasted JSON (`app-input-manager.js:61-65`, `src/core/app-friends-manager.js:455-463`). A token pasted later is used by the next request (`__tests__/app-friends-refresh.test.js:109` "asks with the credential entered at the time of each round").
- A join keeps the credential it started with (`src/game/join-manager.js:401-404`). Changing the credential ends the running joins (`app-input-manager.js:137-146`).

### 1.3 Which credential each request carries

| Request                                | Credential                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GetPlayerLinkDetails (where anyone is) | main (token or key)                                                                              |
| The user's own friends list            | main; the endpoint depends on the kind                                                           |
| Player summaries (names, avatars)      | main; the endpoint depends on the kind                                                           |
| ResolveVanityURL                       | main                                                                                             |
| Someone else's friends list            | a key only: the main credential if it is a key, else the saved friends-list key, else no request |

A friend check reads the list with the key and asks where those friends are with the main credential (`src/game/map-finder.js:1235-1268`).

### 1.4 What each credential can read

From the note casual-map-finder-research:

- **GetPlayerLinkDetails:**
  - The token gets strangers' `rich_presence_kv`, `connect` included: 1106 of 1107 accounts answered (**Measured 2026-10-24**).
  - The key gets exactly the same answer as the token, for 100 pool players and for the friends (**Measured 2026-11-04**).
- **The user's own friends list:** the token reads it even when it is not public. The key gets HTTP 401 for a list that is not public (**Measured 2026-11-04**).
- **Other people's friends lists:** only the key can read them. The token gets HTTP 400 (**Measured 2026-10-25, again 2026-11-04**).
- **Other key-only methods:** `ISteamUser/GetPlayerSummaries` and `GetPlayerBans` give the token HTTP 400 (**Measured 2026-11-04**). For a token the app calls `ISteamUserOAuth/GetUserSummaries` instead (3.4).
- **Fake credentials:** Steam answers a made-up token with 401 and a made-up key with 403 on the friends list (**Measured 2026-11-03**, commit 65912da).
- **GetSupportedAPIList:**
  - The key sees 54 interfaces and 169 methods; without auth, or with the token, it is 27 and 63 (**Measured 2026-11-04**).
  - None of them names Prime or lists a server's players.
  - A note of 2026-10-30 said the token listed no interfaces at all. The later count stands.

### 1.5 Limits

- **Key:** Steam's terms allow 100,000 calls a day (note, 2026-11-04). The app keeps no count.
- **Token:** no limit is recorded, and the notes record no HTTP 429 from Steam.
- **Per request:** at most 100 ids (section 4).

## 2. Transport

- **Requests:**
  - The base URL is `https://api.steampowered.com` (`constants.js:6`).
  - Every call is a GET. **Measured 2026-10-30:** a POST to GetPlayerLinkDetails gets HTTP 405.
- **URL:** `<base><endpoint>?<auth>&<the endpoint's fixed params>&<the call's params>` (`api-config.js:77-110`).
  - A parameter whose value is null or undefined is left out.
  - Values are form-encoded, so `steamids[0]` goes out as `steamids%5B0%5D`.
- **One HTTP function** carries every call (`src/steam/http-client.js:31-48`). It is the only `fetch` in the code base. Today the page's Content-Security-Policy lets requests go only to the app itself and `https://api.steampowered.com` (`index.html:16`).
- **Timeout:** section 6.
- **No answer:** when Steam cannot be reached (DNS, TLS, offline, timeout), the request fails with code `NETWORK_ERROR`, and the original error is kept as its `cause` (`http-client.js:38-47`; `__tests__/http-client.test.js:35` "a request that cannot reach Steam is a network error"). A caller's own abort stays an `AbortError` (`:49` "the caller's own cancellation still surfaces as an abort").
- **Body:** parsed as JSON after the status check (`src/steam/steam-api-client.js:392-413`). A body that is not JSON raises an error without a code. Callers that catch it treat it as a failed request.
- **Logging** (`src/steam/api-logger.js`):
  - One line per request, at debug rather than info. The code comment: one of these per request, "five a second during a join: at info each would also reach the main process over IPC" (`api-logger.js:18-29`).
  - The URL is logged at trace, with the values of `key=` and `access_token=` masked as `***` (`src/steam/steam-api-utils.js:44-51`; `__tests__/steam-api-utils.test.js:78` "maskAuthInUrl hides keys and tokens").
  - Raw responses go to trace. HTTP errors go to warn, 5xx to error (`api-logger.js:59-78`).
- **Rule for the rewrite:** a credential never reaches a log, an error message or anything shown to the user.

## 3. Methods

### 3.1 GetPlayerLinkDetails: where players are

- **Request:** `GET /IPlayerService/GetPlayerLinkDetails/v1/?<auth>&steamids[0]=<id>&steamids[1]=<id>...` (`api-config.js:38-42`, `steam-api-client.js:502-533`).
  - The endpoint is the same for a token and a key.
  - At most 100 ids (section 4).
  - Features never call it directly: every call goes through the shared path of section 5.
- **Answer:** `{response: {accounts: [{public_data: {...}, private_data: {...}}]}}`. Section 10.1 lists the fields the app reads.
  - Within an answered response, an id with no account is "no account", which is a real answer.
  - An id whose request failed is "unanswered" (5.1).
- It is a credential-checked method (section 8).
- **What it does not give:**
  - No server address or port for any server (**Measured 2026-11-04**).
  - No sign of Prime: none was found among the account fields or rich presence keys of the 32 players in CS2 out of 2751 asked (**Measured 2026-11-04**).
- **Timing (Measured 2026-10-25):**
  - For 22 ids it answers in about 0.3 s.
  - It shows a change 1 to 1.5 s after the Steam client shows it.
- **Hidden players:** a player who hides their game details shows no game, so they read as not in CS2. **Inferred** from a test on 2026-10-25: of 19 players CS2 listed in the user's match, at most 3 reached the pool.
- **Used for:** friends' statuses, the user's own presence, join snapshots, the CS2 check, the map finder, seeds and friend checks (11.1).

### 3.2 The user's own friends list

- **Token:** `GET /IFriendsListService/GetFriendsList/v1/?access_token=...&steamid=<user>` (`api-config.js:25-28`, `steam-api-utils.js:62-76`).
  - The answer is `response.friendslist.friends[]` of `{ulfriendid, efriendrelationship}`.
  - Kept: entries with `efriendrelationship === 3`, a confirmed friend.
- **Key:** `GET /ISteamUser/GetFriendList/v1/?key=...&relationship=friend&steamid=<user>` (`api-config.js:20-24`, `steam-api-utils.js:77-89`).
  - The answer is `friendslist.friends[]` of `{steamid, relationship}`.
  - Kept: entries with `relationship === "friend"`.
  - Tests: `steam-api-utils.test.js:9` "keeps confirmed friends from a token response" and `:27` "keeps confirmed friends from an API key response".
- **Dropped:** pending and blocked entries (CHANGELOG 0.3.1). An unexpected shape gives no ids (`steam-api-utils.test.js:43` "an unexpected shape gives no friends").
- **No confirmed friend** raises `EMPTY_FRIENDS_LIST` (`src/steam/steam-api-response-processor.js:42-50`).
- **When:** only when the user reloads (`app-friends-manager.js:275-288`).
  - The call does not allow failure, so every failure is a coded error that the user reads (section 7).
  - It is not credential-checked, because with a key a 401 means a private list.
- **After a reload:** the ids are saved (`friends_ids`) and polled by the friends refresh from then on. The list itself is never read again automatically.

### 3.3 Someone else's friends list

- **Request:** `GET /ISteamUser/GetFriendList/v1/?key=...&relationship=friend&steamid=<whose>` (`api-config.js:48-55`, `steam-api-client.js:629-649`). The answer has the same shape as the key's own list (`__tests__/steam-presence.test.js:297` "lists someone else's friends with an API key").
- **Key only** (1.4). Callers pass only what `getFofKey()` gives (`map-finder-view.js:195-200`), and without a key nothing is read (`__tests__/map-finder.test.js:628` "are read only when the user asks, and only with a key", `:840`, `:1266`).
- **Every failure gives an empty list:** a private list (401), any other HTTP error, a network error (`steam-presence.test.js:318` "a private list comes back empty"). **Measured 2026-11-04:** 14 of 40 lists were closed with 401. These were the lists of players with an XP trail on official casual servers.
- It is not credential-checked.
- **Callers:** three. The two reads on the user's click wait 250 ms between lists (`FOF_REQUEST_DELAY_MS`, `constants.js:91`; `map-finder.js:1010`, `:1087`); the friend check does not.
  - friends of friends: one list per friend of the user, on the user's click;
  - friends of pool players: one list per pool player whose list was not read in the last 24 h, on the user's click;
  - friend checks: at most 4 per refresh, each list kept for a day.
- **User decision (2026-11-05, commit 92e0f70):** lists are read only when the user clicks "Read lists", never by themselves and never just because a key was saved. A list read within `FOF_REFRESH_MS` (24 h) is not read again. The reason: every list is a request on the user's key (`constants.js:86-89`).

### 3.4 Player summaries: names and avatars

- **Key:** `GET /ISteamUser/GetPlayerSummaries/v2/?key=...&steamids=<id>,<id>,...`. The answer is `response.players[]`.
- **Token:** `GET /ISteamUserOAuth/GetUserSummaries/v1/?access_token=...&steamids=...`. The code reads `players[]` at the top level (`api-config.js:30-37`, `steam-api-utils.js:94-110`; `steam-api-utils.test.js:48` "player summaries come in two shapes").
- **Chunks:** 100 ids per request, comma-separated, sent one after the other (`steam-api-client.js:441-500`).
- **Failures:** a chunk that fails with an HTTP error is skipped and the next one still goes. A network error ends the call with an error (7.2).
- It is credential-checked (section 8).
- **Fields read:** `steamid`, `personaname`, `avatar`, `avatarmedium`, `avatarfull`.
- **Callers:**
  - avatars of friends in a casual match (section 9);
  - the account bar's name and picture, once per account per run (`src/ui/account-view.js:249-281`; `__tests__/account-view.test.js:209` "the Steam profile is asked for once per account, and not without one").
- **Not measured:** whether `ISteamUserOAuth/GetUserSummaries` answers today's JWT token (section 12).

### 3.5 ResolveVanityURL

- **Request:** `GET /ISteamUser/ResolveVanityURL/v1/?<auth>&vanityurl=<name>` (`api-config.js:43-47`, `steam-api-client.js:701-722`).
- **Answer:** `{response: {success: 1, steamid}}` gives the id. Any other `success` gives null (`steam-api-response-processor.js:251-273`).
- **When:** the user pastes a `steamcommunity.com/id/<name>` link into the SteamID field (`app-input-manager.js:71-124`).
  - A `/profiles/<id>` link needs no request (`validators.js:135-170`).
  - Without a credential the app first asks for one (`app-input-manager.js:92-96`).
- **Failures:** the call allows failure and also catches every error, so any failure reads as "not resolved".
- It is not credential-checked. Whether Steam accepts a token here is not recorded.

### 3.6 Methods the app does not use, and why

- **`ISteamApps/GetServerIPsBySteamID`:**
  - From 2026-10-25 to 2026-10-30 the app used it to keep `official` only for servers with a Valve-internal address, in the RFC 6598 shared address space (commit 42df4d8: batched, answered the token, cached 30 min, 1 min when Steam listed none).
  - **Measured:** from some time between 2026-10-27 19:10 UTC and 10-29, Steam lists no address for any anonymous (type 4) server. On 2026-10-30, 0 of 26 had one, while 8 of 8 type-3 servers still got public addresses. On 2026-11-04 it was 0 of 97.
  - The check then rejected every official server: the Maps tab found nothing and the pool stopped growing.
  - **User decision (2026-10-30, commit b29c027):** never ask for server addresses. The reason: they may never come back, or may come back in another range and break the check again.
- **`ISteamUser/GetPlayerSummaries` for servers:** it gives nobody a `gameserverip` or `gameserversteamid`, only `gameid` and sometimes `lobbysteamid` (**Measured 2026-11-04**).
- **No list of official casual servers or of a server's players exists** (**Measured 2026-10-24 and 2026-11-04**):
  - Official servers sit behind Valve's relay network (SDR) and are not in the master server list.
  - The game coordinator's lists of live games cover competitive and Premier only.
  - `QueryByFakeIP` and `GetServerList` return nothing for Valve's addresses.
  - No Web API method lists the SteamIDs on a server.
- **Prime:** no method tells Prime status (**Measured 2026-11-04**):
  - `IEconItems_730/GetPlayerItems` answers HTTP 410.
  - `GetOwnedGames` (key) does not tell Prime players apart.
- **`ICommunityService/GetAppRichPresenceLocalization/v1/?appid=730&language=english`:**
  - It is public and needs no auth.
  - It was read by hand on 2026-11-04 to learn that Premier is the only flagged mode (`#gamemode_competitive_1`).
  - The app does not call it.
- **`ICSGOServers_730/GetGameServersStatus` and `GetSDRConfig`:**
  - The first (key) gives the load of 31 datacenters; the second (public) lists 53 relay points.
  - Nothing maps a server to either, so neither is used.

## 4. Request size and chunking

- **Size:** a GetPlayerLinkDetails or summaries request carries at most 100 ids (`_MAX_IDS_PER_REQUEST = 100`, `steam-api-client.js:58-65`; `chunk`, `:32-44`).
- **Measured 2026-10-30, GetPlayerLinkDetails:**
  - 100 ids per GET is the most it takes.
  - 101 to 200 ids return an empty response.
  - 250 or more return HTTP 400.
- **Earlier (commit 5a283f9, 2025-09-07):**
  - Before that commit, the whole friends list went out in one request.
  - At about 35 bytes per encoded `steamids[N]`, the URL passed the 8 KB request-line limit at about 225 ids. The failure, described as HTTP 414, was swallowed, and the user saw an empty friends list with no error.
  - A stub run sent 250 ids as 100, 100 and 50; the longest query string was 3607 bytes.
  - The 414 was not seen live. The live check of 2026-10-30 saw 400.
- **Why exactly 100:** an empty answer to 101 to 200 ids would read as "no account" for every one of them (5.1). Never send more than 100.
- **Order of sending:** the chunks of one call go one after the other, never in parallel (`steam-api-client.js:287-357`, `:462-491`). Different calls may each have a request out at the same time.
- **Order of ids:** ids keep the batch's order: the first caller's ids first, each caller's in its own order. The map finder puts friends, seeds and the pool first (`map-finder.js:933-973`). So when a batch stops early (7.3), the most valuable ids have already been asked.

## 5. Sharing requests between callers

### 5.1 What a presence call returns

Every id ends up in one of three states (`steam-api-client.js:164-173`, `:272-286`):

- **Answered, with an account:** the account.
- **Answered, no account (null):** treated as not in CS2 (`__tests__/steam-api-join-snapshot.test.js:196` "reports a side Steam has no account for as not in CS2, not as unknown"; `steam-presence.test.js:262`).
- **Unanswered (absent):** the request failed. This means "could not ask", never "not in CS2" and never "no account" (`steam-presence.test.js:287` "a failed request leaves the ids out"). Each call treats it its own way:
  - `isPlayerInCS2` returns null (`steam-api-client.js:551-553`);
  - in a join snapshot, that side is null (`:581-587`);
  - a presence map leaves the id out (`:617-620`);
  - friends' statuses do not list the friend (`:668-675`).

Two more rules:

- Every id of an answered chunk gets an entry. So "not everyone answered" can only mean a failed request, and the friend check relies on that (`map-finder.js:1275`).
- The batched call itself never fails because a request failed (`steam-api-client.js:278-281`).

**Rule:** an unknown answer is never a reason to cancel, launch or forget anything (`join-manager.js:367-370`, `:509-515`; `map-finder.js:562-567`, `:468-498`).

### 5.2 Micro-batching

- **What:** calls made within `_BATCH_WINDOW_MS = 10` ms of the first one, with the same credential, are merged. Their ids form one set, duplicates removed, and go out as one batch (`steam-api-client.js:52`, `:226-270`).
- **One batcher per credential:** "ids authenticated with different credentials must never be merged into a single request" (`:67-72`). The old batcher sent everyone's ids with the first caller's credential; commit 5a283f9 fixed that.
- Each caller gets back only its own ids (`:260-267`).
- **Who relies on it:** today, one pair of calls. A friends round asks for the friends and for the user in two calls in the same tick, and they share a request (`app-friends-manager.js:127-134`; `app-friends-refresh.test.js:143` "asks where the user is in the same round, to spot friends beside them").
- A join snapshot passes both its ids in one call anyway (`steam-api-client.js:565-580`; `steam-api-join-snapshot.test.js:150` "asks for both ids in one request and parses both sides").
- **Cost:** every call waits at least 10 ms.

### 5.3 Waiting for a request already out, chunk by chunk

- **Bookkeeping:** each chunk, when it goes out, is registered with its ids. When it settles it removes only its own entry (`steam-api-client.js:74-82`, `:292-333`).
- **A caller's steps:** it takes what the cache holds, then waits for any chunk in flight that holds some of its other ids, and sends the rest in a batch of its own (`:174-207`). When an id comes back in several answers, a non-null one wins (`:209-222`).
- **Why per chunk (commit 097c736, 2026-11-03):**
  - The map finder's batch of up to 3000 ids goes out as 30 requests, one after the other.
  - A caller that waited for the whole batch held up the join loop and the friends refresh for seconds, up to 10 s per stuck request.
  - Now it waits for the one request that holds its ids (`__tests__/steam-api-batching.test.js:49` "a few ids wait for the request that holds them, not for every chunk of a big batch").
- **Chunks not yet sent are not shared:** a caller asking about one of their ids sends its own request, so that id is asked twice. This is accepted, for speed.
- This sharing does not look at the credential (section 12).

### 5.4 Short cache

- **What:** per id, `{raw, ts}`, kept for `_SHORT_TTL_MS = max(1, floor(JOIN_LOOP_INTERVAL_MS / 2))` = 100 ms (`steam-api-client.js:53-56`, `:84-89`, `:112-135`).
  - The reason given in commit c7ab6b4 (2025-08-14) was to avoid duplicate work within a tick.
  - It shares answers between callers that ask at about the same moment.
  - It never serves the join loop's next iteration, which comes at least 200 ms later.
- **Negative answers are cached:** a null raw value is "a real answer, and worth caching" (`:84-87`, `:181-193`; `steam-api-join-snapshot.test.js:136` "caches a no-account answer and reports false").
- **Failed ids are never cached**, so the next call asks Steam again (`steam-api-client.js:335-341`; `steam-api-join-snapshot.test.js:122` "does not cache a failed request").
- **Pruning:** expired entries are dropped after every chunk, not only when the same id is asked again, because the map finder asks about thousands of ids that may never come back (`steam-api-client.js:137-147`; `steam-presence.test.js:275` "expired cache entries are dropped, not only ones asked about again").
- The cache does not look at the credential.
- **One client:** the batchers, the requests in flight, the cache and the avatars are state shared by the whole process. All features must go through one Steam client, or none of this sharing works.

## 6. Timeouts

- **Value:** `REQUEST_TIMEOUT_MS = 10000` for every request (`constants.js:32-35`, `http-client.js:4-17`, `:31-37`). It is joined with the caller's own abort signal when there is one; no caller passes one today.
- **Why (commit 4d53e73, 2026-11-03, and the code comment):**
  - Before it, a request that hung held up the join loop or the map refresh until the connection broke.
  - Steam answers in well under a second, so the timeout only ends a stuck request.
- **A timeout is a failed request like any other:** code `NETWORK_ERROR`, the chunk unanswered (`http-client.test.js:29` "a request that hangs fails after the timeout").
- A timeout does not stop the rest of a batch (7.3).
- **No retries:** nothing retries within a call. The next round, iteration or refresh asks again.

## 7. HTTP errors

### 7.1 Classification

| Steam's answer                             | Error code, when one is raised                                                                                          | Credential state (checked methods) | Stops the rest of a presence batch |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------- |
| 2xx                                        | none                                                                                                                    | taken again                        | no                                 |
| 401                                        | `TOKEN_REJECTED` for a token, `KEY_REJECTED` for a key; `PRIVATE_FRIENDS_LIST` for the own friends list read with a key | turned down                        | yes                                |
| 403                                        | `TOKEN_REJECTED` or `KEY_REJECTED`                                                                                      | turned down                        | yes                                |
| 429                                        | `RATE_LIMITED`                                                                                                          | unchanged                          | yes                                |
| 5xx                                        | `STEAM_UNAVAILABLE`                                                                                                     | unchanged                          | yes                                |
| any other status (400, 404, 405, 410, 414) | `STEAM_ERROR`, carrying the status                                                                                      | unchanged                          | no                                 |
| no answer (DNS, TLS, offline, timeout)     | `NETWORK_ERROR`                                                                                                         | unchanged                          | no                                 |
| the caller's own abort                     | `AbortError`                                                                                                            | unchanged                          | no                                 |

- **Code:** `steam-api-utils.js:10-37`, `:161-189`, `:191-199`; `steam-api-client.js:13-30`, `:382-410`.
- **Tests:**
  - `steam-api-utils.test.js:128` "status %i (token: %s) is %s"
  - `:96` "a private friends list has an error of its own"
  - `:113` "a token's 401 on the friends list is the token turned down, not a private list"
  - `:160` "without allowFailure an error carries the status, and the log its method"
  - `__tests__/steam-friends-list-errors.test.js:38` "with %s, Steam's %i reads as %s"
  - `:55` "a friends list Steam cannot be reached for is a network error"
- **Why the private-list rule depends on the credential:**
  - A key meets a private list with 401.
  - A token reads its owner's own list whatever its privacy, so a 401 to a token can only mean Steam turned the token down, "as it answers a made-up token (checked 2026-11-03)" (`steam-api-utils.js:10-15`).
  - Before commit 65912da (2026-11-04), loading the friends with an expired token showed the privacy warning.

### 7.2 Raise an error, or leave the ids unanswered

| Method               | On an HTTP error                                                                | On a network error or bad JSON                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Own friends list     | raises the coded error, which the user reads (`app-friends-manager.js:277-282`) | raises `NETWORK_ERROR`                                                                                                                                               |
| GetPlayerLinkDetails | the chunk's ids stay unanswered (`steam-api-client.js:316-322`)                 | caught per chunk; the ids stay unanswered (`:323-328`)                                                                                                               |
| Summaries            | the chunk is skipped (`:478-480`)                                               | raises. The friends round catches it and goes on without new avatars (`steam-api-response-processor.js:432-443`); the account bar ignores it (`account-view.js:277`) |
| Someone else's list  | empty list                                                                      | empty list                                                                                                                                                           |
| ResolveVanityURL     | null                                                                            | null                                                                                                                                                                 |

### 7.3 What stops a batch

- **Rule:** when a GetPlayerLinkDetails chunk fails with 429, 401, 403 or a 5xx, the call's remaining chunks are not sent (`steam-api-client.js:22-30`, `:343-353`).
  - Their ids stay unanswered, and the next refresh asks again.
  - The reason, from the code comment and commit d31a083 (2026-11-03): "the chunks after it would meet the same answer and only add to the load". Before that commit, a 429 on one chunk of the map finder's batch did not stop the chunks after it.
- **Test:** `steam-api-batching.test.js:99` "an HTTP %s stops the rest of the batch, its ids left unanswered", run for 429 and 503. Of 350 ids, the first chunk is answered, the second fails, and the third and fourth are never sent.
- **What does not stop a batch:** other 4xx answers, network errors and timeouts.
- Summaries chunks never stop each other on a status.

### 7.4 Private friends lists

- **The user's own list, read with a key:** `PRIVATE_FRIENDS_LIST`. The notice links to the profile's privacy settings through `steam://openurl/` (`src/ui/notification-manager.js:75`).
- **Someone else's list:** an empty list (3.3). What happens next depends on who asked:
  - the friend check marks the player "closed" (`map-finder.js:1256-1264`);
  - for friends of friends, the list counts as not read. When no list of the whole pass could be read, the pass ends in "error" and what was read before stays (`map-finder.js:1013-1018`; `map-finder.test.js:602` "not one readable list counts as an error, and what was read before stays"). The key hint then says no friends list could be read with this key (`map-finder-view.js:855-866`).
- **Hidden game details are no error:** the account answers, without a game.

### 7.5 What the user reads

- **Texts:** each code has a text in the user's language (`src/utils/error-handler.js:7-19`, `:39-53`):
  - privacy warning, no friends found, token turned down, key turned down, too many requests, Steam unavailable, Steam error (with the status), no connection;
  - an error without a code shows "Something went wrong" with its own message.
  - Commit 65912da (2026-11-04) added this, because Russian users had read Steam's raw English refusals.
- **When it is shown:**
  - on a reload (`app-friends-manager.js:280-282`, `:339-344`);
  - when resolving a vanity link (`app-input-manager.js:107-118`).
- **Background failures** are only logged, the startup round's included: `fetchAndRenderFriendsByIds` shows an error only when called with `keepStates` false, and both callers pass true (`app-friends-manager.js:151-156`, `:379-384`, `:440-444`). The account bar shows a credential Steam turned down (section 8).

## 8. Credential state after a rejection

- **What:** a process-wide set of the credentials Steam turned down (`src/steam/credential-state.js:4-86`).
- **What turns a credential down:** a 401 or 403 from GetPlayerLinkDetails or GetPlayerSummaries, the `CREDENTIAL_CHECKED_METHODS` (`steam-api-client.js:13-20`, `:382-390`).
  - Why only these two: "Methods any valid token or key may call: a 401 or 403 on one means Steam turned the credential itself down, not that a profile is private" (`:13-16`).
  - The friends-list methods and ResolveVanityURL are left out, because there a 401 can mean a private list.
- **What takes it back:** any 2xx answer to those two methods made with that credential (`credential-state.js:32-40`; `steam-api-batching.test.js:123` "a 401 marks the credential turned down, and an answer takes it back").
- **A new credential is not on the list**, so polling goes on at the next round (`steam-api-batching.test.js:141` "another credential is not held back by one Steam turned down").
- **Who pauses:**
  - the friends refresh skips its rounds (`app-friends-manager.js:428-430`; `app-friends-refresh.test.js:88` "pauses while Steam turns the credential down, and goes on with a new one");
  - the map finder skips its refreshes and keeps the servers it knows (`map-finder.js:550-552`; `map-finder.test.js:181` "refreshes nothing and keeps the servers known until it is taken again").
- **Who does not pause:**
  - the user's reload, which always goes out: that is how a credential gets taken again;
  - the account bar's profile request;
  - the join loop, which has its own failure budget (commit d31a083; 11.4);
  - the seed check (`map-finder.js:322-323`);
  - the CS2 launch wait;
  - list reads with the friends-list key.
- **UI:** until Steam takes the credential again, the account bar says Steam turned the token or the key down (`account-view.js:184-198`; `account-view.test.js:155` "a token or key Steam turned down is called out until Steam takes it again").
- **No timers, no persistence:** nothing waits, and nothing is saved. After a restart the list is empty, and the first round meets the 401 again.
- **Why (`credential-state.js:4-11`, commit d31a083, 2026-11-03):**
  - A token that expired overnight kept the friends refresh sending a failing request every 3 s, and the map finder 30 every 30 s, until a new token was pasted.
  - Polling on with it "only spends Steam's daily allowance on failures".
- **Expiry is known locally but does not stop polling.** The app reads a token's expiry from `exp`: the account bar shows it, and the startup refresh does not start with an expired token (`__tests__/startup-auto-refresh.test.js:131` "does not start with an expired token"). Polling that is already running stops only on Steam's answer.

## 9. Avatars

- **Source:** player summaries (3.4).
- **Who gets one:** only friends and fake friends in a casual match. The code fetches avatars "only for supported players" (`steam-api-response-processor.js:134-147`).
- **Cache:** avatars are kept by SteamID for the whole run, so summaries are asked only for players whose avatar is not known yet (`steam-api-client.js:91-96`, `:678-686`; `steam-api-utils.test.js:72` "filterMissingAvatars leaves out cached ones").
  - Before commit 5a283f9 (2025-09-07) avatars were fetched again every 3 s.
  - The cache never expires and is never refreshed during a run.
- **A failed fetch** keeps the statuses already retrieved: avatars are cosmetic (`steam-api-response-processor.js:432-443`). That player is asked about again on the next round.
- **Which size is picked:**
  - Friend rows take `avatarfull`, then `avatar`, then `avatarmedium` (`steam-api-utils.js:112-124`; `steam-api-utils.test.js:60` "extractBestAvatar prefers the full size").
  - The account bar takes `avatarmedium`, then `avatarfull`, then `avatar`, because "the bar's avatar is small; the medium picture is sharp enough" (`account-view.js:271-273`).
- **Until a picture comes:**
  - A fake friend shows a built-in placeholder image (a data URI) until Steam answers (`src/ui/fake-friends-manager.js:101-114`).
  - The account bar shows the first letter of the name until a picture loads, and when one fails to load (`account-view.test.js:81`).
- **Allowed image hosts:** today's policy allows `'self'`, `data:`, `https://*.steamstatic.com` and `https://steamcdn-a.akamaihd.net`. The reason, from `index.html:6-15`:
  - summaries hand out URLs on Valve's static domain or its akamai, fastly and cloudflare variants, which Valve moves between;
  - the older akamaihd host is named in full, because akamaihd.net is shared by every Akamai customer.
- **Map rows show no avatars:** server players are listed by name only (`map-finder.js:164-169`).

## 10. From the answer to the player model

### 10.1 Account fields read

| Field                               | Meaning in the app                                                                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public_data.steamid`               | the player's SteamID64, kept as a string                                                                                                                                                                                                                        |
| `public_data.persona_name`          | display name, "" when missing                                                                                                                                                                                                                                   |
| `private_data.game_id`              | the string `"730"` means in CS2                                                                                                                                                                                                                                 |
| `private_data.rich_presence_kv`     | the rich presence string; Steam leaves it out for players not in a game (`src/steam/rich-presence.js:27-29`)                                                                                                                                                    |
| `private_data.game_server_steam_id` | the server, used when rich presence lacks it: "rich presence seldom carries the server; the account does" (`steam-api-response-processor.js:507-509`; `steam-presence.test.js:338` "a friend's server comes from the account when rich presence leaves it out") |

SteamIDs are 64-bit numbers and arrive as strings. Keep them as strings or as unsigned 64-bit integers; a floating-point conversion loses digits. The account type is read with big-integer arithmetic (`rich-presence.js:231-239`).

### 10.2 Parsing rich presence

- **Format:** `rich_presence_kv` is a string of `"key" "value"` pairs, for example `"game:mode" "casual" "game:state" "game"`.
- **Reading the keys:** `parseRichPresence` reads 12 named keys, each by its own regular expression over the whole string (`rich-presence.js:21-51`; `__tests__/rich-presence.test.js:18` "reads the keys the app uses", `:39` "treats a missing string as empty rich presence").
  - The expression is `"<key>"\s+"([^"]+)"`.
  - The first match wins, a missing key gives null, and input that is not a string counts as empty.
- **The status key** reads every pair a different way (10.8).
- **Values are untrusted:** other players' clients write them.
  - The UI escapes them (`src/ui/friends-renderer.js:183-194`).
  - `connect` is checked before it can reach the game (10.4).

### 10.3 Keys and their meaning

| Key                    | Field                  | Values recorded                                                                                                                                                                            | Used for                                                                                |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `status`               | `status`               | Steam's text for the player, e.g. "Casual Dust II [ 3 : 1 ]"                                                                                                                               | friend rows show it when there is no casual map to show (`friends-renderer.js:191-193`) |
| `game:state`           | `game_state`           | `game` in a match, `lobby` in the menu; no other value recorded                                                                                                                            | supported mode, protected match, the menu check                                         |
| `game:mode`            | `game_mode`            | casual, competitive (Premier included), scrimcomp2v2 (Wingman), rush, custom (workshop maps), seen 2026-11-03 (commit 85e19dd); deathmatch assumed but never seen (`constants.js:190-196`) | supported mode, protected match, Prime sign                                             |
| `game:map`             | `game_map`             | a map code such as `de_dust2`; community servers may add a tag to the name                                                                                                                 | map finder, offline game, friend rows                                                   |
| `game:score`           | `game_score`           | `[ a : b ]`                                                                                                                                                                                | rounds played, match over                                                               |
| `connect`              | `connect`              | a join string (formats below)                                                                                                                                                              | joins                                                                                   |
| `game_server_steam_id` | `game_server_steam_id` | the server's SteamID64; seldom present                                                                                                                                                     | server id                                                                               |
| `game:server`          | `game_server`          | `kv` (official servers, and some community ones), `community`, `offline` (bots, training, offline workshop)                                                                                | official signature, offline game                                                        |
| `steam_display`        | `steam_display`        | `#display_GameKnownMap`, `#display_GameKnownMapScore`, `#display_GameKnownMapScoreFlags` (competitive only, with `game:qmmflags`), `#display_GameWkshpMap`, `#display_GameWkshpMapScore`   | official signature                                                                      |
| `Addon` (capital A)    | `addon`                | a workshop add-on id, on community servers                                                                                                                                                 | official signature (must be absent)                                                     |
| `game:xptrail`         | `xptrail`              | the XP trail level: 0 to 8 in a morning census, where 12 of 29 players with rich presence had 1 or more (2026-11-04); higher values appear in recorded joins                               | Prime sign                                                                              |
| `game:qmmflags`        | `qmmflags`             | `1` in Premier (game mode competitive)                                                                                                                                                     | Prime sign                                                                              |

- **Map names:** community servers can decorate the map name with a server tag. The tests use one with a "RETAKE" tag (`steam-presence.test.js:33`).
- **`connect` formats**, read from CS2's client.dll (note, 2026-10-25):
  - a server: `+gcconnect` and three groups of 8 hex digits (a token, the player's own account id, a token);
  - a lobby: `+gcconnectG` and 8 hex digits (the account id);
  - a local or listen server: `+gcconnectL...`.
  - **Measured 2026-11-06:** in all 181 sightings, the middle 8 digits were the player's own account id, and in all 67 changes the other two groups changed together.
  - It is Steam's documented `connect` key, the one behind Join Game in Steam's friends list.
- **Keys not parsed:** a few keys are never read by name, but they enter the status key (10.8):
  - `steam_player_group_size`, Steam's party key. **Measured 2026-11-04, 21:56 Moscow time:** 0 of 70 players on official casual servers had a party key, against 75 of 99 in competitive. So a party cannot be ruled out in casual.
  - `version`, the CS2 build, seen in recorded joins;
  - `game:act`, which is `community` in the test data for a community server (`steam-presence.test.js:32`).

### 10.4 Derived facts

- **In CS2:** `game_id === "730"` (`rich-presence.js:130-137`; `rich-presence.test.js:119` "isInCS2 checks the app id").
- **Supported mode**, a casual match there is something to join in:
  - Rule: `game:mode` is `casual`, and `game:state` is present and not `lobby` (`rich-presence.js:139-149`; `rich-presence.test.js:80` "only a running casual match is a supported mode").
  - In the lobby, the mode may only be what is picked in the play menu (`rich-presence.js:182-183`).
  - Since commit 8d028f6 (2026-10-25) this means casual only; deathmatch is no longer supported.
- **Join available** (friend rows): a supported mode and a valid connect (`rich-presence.js:151-160`; `rich-presence.test.js:95`, `steam-api-join-snapshot.test.js:261` "isJoinAvailable requires a valid connect").
- **Protected match**, which a join must not pull the user out of:
  - Rule: `game:state` is present and not `lobby`; the mode is neither casual nor deathmatch (an unknown mode counts as protected); and `game:server` is not `offline` (`rich-presence.js:171-198`, `INTERRUPTIBLE_MODES` at `constants.js:190-196`).
  - Tests: `steam-api-join-snapshot.test.js:313` "mode %s with state %s -> %s", `:333` "an offline %s game is training, which a join may interrupt", `rich-presence.test.js:108`.
  - Why (commit 85e19dd, 2026-11-03): a join used to stop only in competitive and Premier, so a slot that opened during Wingman sent a connect.
  - Deathmatch was never seen in Steam's mode names. If CS2 names it otherwise, a deathmatch counts as protected, which is the safe side: it never pulls the user out of anything.
- **Offline game:**
  - Rule: in CS2 with `game:server` `offline`. The result is `{map, mode}` (`steam-api-response-processor.js:189-194`; `steam-api-join-snapshot.test.js:344`).
  - Why: "CS2 reports training in the mode picked for it; only Steam knows the game is offline".
  - The join loop counts it only while CS2's own state shows the same map and mode (`join-manager.js:941-959`).
- **Connect:**
  - Kept only in a supported mode, and only when it matches `^\+gcconnect[A-Za-z0-9:_-]{1,64}$` (`constants.js:153-155`, `rich-presence.js:116-128`, `steam-api-response-processor.js:197-209`).
  - Why: another player's client writes the value, and it becomes CS2 launch arguments through `steam://rungame/730/<steamid>/<connect>` (`src/game/steam-protocol.js:13-21`). So spaces, quotes, percent escapes or extra `+` commands must never reach the game (`steam-api-join-snapshot.test.js:240`, `:244` "rejects %s").
  - A malformed value is dropped and logged once per distinct value, not on every poll (`steam-api-response-processor.js:161-174`; `steam-api-join-snapshot.test.js:275` "the snapshot drops a malformed connect and warns once per value").
  - **Join token:** a connect matching `^\+gcconnect[0-9A-F]+$` (case-insensitive) carries a server's join token. Lobby (`G`) and local (`L`) connects carry none (`rich-presence.js:104-114`; `steam-presence.test.js:193` "isJoinToken tells a server's join token from lobby and local connects").
  - **Connect kind:** a connect without its token, one of `+gcconnect`, `+gcconnectG`, `+gcconnectL` (`rich-presence.js:93-102`; `steam-presence.test.js:182`).
- **Server id:** rich presence `game_server_steam_id`, else `private_data.game_server_steam_id`, else null (`steam-api-response-processor.js:211-212`).
- **Score:**
  - Rounds played is a + b. A match is over when one side has `CASUAL_ROUNDS_TO_WIN` = 8 rounds (`rich-presence.js:241-262`, `constants.js:198-203`; `steam-presence.test.js:222` "adds both sides of the score", `:229` "isMatchOver sees a side with the rounds a casual match needs").
  - Why 8: the join journal saw casual matches end at 8:2 and after round 15, after which the server loads its next map under the same id. The fix was approved by the user on 2026-11-03.

### 10.5 The official-server signature

- **Rule:** `official` is true when all of these hold (`rich-presence.js:200-239`, `steam-api-response-processor.js:245-246`):
  - the player is in a supported mode, a running casual match;
  - `game:server` is `kv`;
  - `steam_display` starts with `#display_GameKnownMap`;
  - there is no `Addon`;
  - the server SteamID's account type, bits 52 to 55, is 4, an anonymous game server (`ANON_GAME_SERVER_ACCOUNT_TYPE`, `constants.js:75-80`). Community servers that use a login token are type 3.
- The server id may come from private data (`steam-presence.test.js:95` "the server id can come from outside rich presence").
- **No address lookup:** one request, GetPlayerLinkDetails only (`steam-presence.test.js:123` "rich presence and the server account decide, with no address lookup").
- **Cases in `steam-presence.test.js:65-84`:**
  - true: an official casual match;
  - false: a community server (`community`, an add-on, type 3);
  - false: a community server on Valve's relays (`kv`, but a workshop display and a decorated map);
  - false: a workshop add-on on a known map;
  - false: `kv`, a known map and no add-on, but a type-3 server;
  - false: the main menu.
- **Evidence:**
  - **2026-10-24:** official servers showed `kv`, `#display_GameKnownMap`, no `Addon` and a type-4 server. CYBERSHOKE-style community servers also say `kv`, but with `#display_GameWkshpMap`.
  - **2026-10-25 (commits b50d2bc, 42df4d8):**
    - A community Mirage server reported `kv` with a known map and no add-on, but was type 3. So the account type joined the rule.
    - A type-4 Arms Race server reported `kv` and a known map at a public hosting address, and type-4 servers with `community` had players. So the address check was added.
    - The hosting guides' claim that servers without a login token are LAN-only proved wrong in practice.
  - **2026-10-27 to 10-29:** Steam stopped listing addresses for type-4 servers (3.6). **User decision 2026-10-30:** rich presence and the account type alone.
  - **2026-10-30 sample:**
    - Every community server showed `#display_GameWkshpMap...`.
    - Type-3 community servers also publish `+gcconnect<token>`, so the connect format tells nothing.
    - Local games with bots show `game:server` `offline`.
    - A live run of the app's own code: 3558 ids gave 70 players in CS2 and 4 official servers, using GetPlayerLinkDetails only.
- **Known gap, accepted:** a community server run without a login token (type 4), on a stock map, in casual, would pass. None has been seen. **Inferred:** the type-4 Arms Race server fails today on its mode, which is not casual, rather than on the signature.

### 10.6 The Prime sign

- **Rule:** `primeSign` is true in CS2 when `game:xptrail` is 1 or more, or when `game:mode` is `competitive` with `game:qmmflags` `1` (`rich-presence.js:53-72`, `steam-api-response-processor.js:247`; `rich-presence.test.js:46`, `:55` "Premier, competitive with qmmflags 1, is a sign of Prime", `:63` "no trail, plain competitive or junk is no sign").
- **Why:**
  - Valve's FAQ, read 2026-11-04: Prime users are matched only with Prime users in every mode; Premier, XP and Service Medals need Prime; Prime is never taken away.
  - CS2's client.dll names `xp_trail_level` among a player's public data, so `game:xptrail` of 1 or more is read as XP. As the code says, "that reading of the name is ours, not Valve's" (`rich-presence.js:56-58`).
  - Premier is `competitive` with `game:qmmflags` 1, the only flagged mode in Steam's rich presence localization for CS2 (2026-11-04).
- **No sign proves nothing:** a Prime player with no recent XP shows none, and nobody can be proven non-Prime.
- The map finder remembers a player with a sign for good (`prime`, capped by `PRIME_MAX_IDS` 20000, `constants.js:98-101`).
- **A sign on a server is a likelihood, not proof:** a Prime player can join a non-Prime match through Join Game, which is the route the app takes. The user confirmed on 2026-11-04 that they had landed in non-Prime casual matches that way.
- **User decision (2026-11-04/05):** a mark and an optional "Prime only" filter. The later friend check only marks a server; it never leaves anyone out.

### 10.7 What the rest of the app receives

**PlayerJoinInfo**, used by the join loop (`steam-api-response-processor.js:176-224`, `src/shared/types.js:27-38`):

| Field              | Rule                                                     |
| ------------------ | -------------------------------------------------------- |
| `personaname`      | `persona_name`, else ""                                  |
| `inCS2`            | 10.4                                                     |
| `inProtectedMatch` | in CS2 and protected                                     |
| `offlineGame`      | `{map, mode}` for an offline game in CS2, else null      |
| `inSupportedMode`  | in CS2 and a supported mode                              |
| `connect`          | the checked connect while in a supported mode, else null |
| `serverId`         | 10.4                                                     |
| `statusKey`        | 10.8                                                     |

An account Steam does not know gives everything false or null and `personaname` "" (`steam-api-join-snapshot.test.js:196`).

**PlayerPresence**, used by the map finder, map joins and the user's own location (`steam-api-response-processor.js:226-249`, `types.js:52-65`), adds these fields:

| Field                  | Rule                                                                              |
| ---------------------- | --------------------------------------------------------------------------------- |
| `steamid`              | `public_data.steamid`, else the id that was asked (`steam-api-client.js:617-620`) |
| `mode`, `map`, `score` | `game:mode`, `game:map`, `game:score` while in CS2, else null                     |
| `official`             | 10.5                                                                              |
| `primeSign`            | 10.6                                                                              |

**Friend**, for the friends list rows (`steam-api-response-processor.js:476-517`, `types.js:6-18`):

- Only accounts in CS2 are mapped (`:125-128`). The list then shows the friends in a casual match, plus fake friends, plus friends with a running join (`fake-friends-manager.js:41-78`).
- The fields:
  - `steamid`, `personaname`, `avatar`;
  - `status` ("" when missing), `game_mode`, `game_state`, `game_map` and `game_score` ("" when missing);
  - `game_server_id`, from rich presence, else private data, else "";
  - `in_casual_mode`, the supported mode;
  - `join_available`, a supported mode with a checked connect;
  - `connect`, the raw value, not checked.

**`isPlayerInCS2`** gives true, false, or null when unanswered. With `requireLobby` it also needs `game:state` `lobby` (`steam-api-response-processor.js:275-386`; `steam-api-join-snapshot.test.js:98` "returns null when the request fails at the network level", `:106`, `:114`).

### 10.8 The status key

- **Rule:** `statusKey` is `<serverId, or "">` + newline + `richPresenceKey(rich_presence_kv)` (`steam-api-response-processor.js:222`).
  - `richPresenceKey` takes every `"key" "value"` pair, empty values allowed, and writes it as `key=value`.
  - The `connect` value is replaced by its connect kind.
  - The pairs are sorted and joined with newlines (`rich-presence.js:74-91`).
- **When it changes:** whenever any value changes, or the server does, whatever order Steam lists the pairs in. A renewed join token alone does not change it. A connect that appears, vanishes or changes kind does (`steam-presence.test.js:158` "changes with any value and ignores the order Steam lists them in", `:166` "a new join token alone is no change; a connect showing up or going away is", `:202` "a player's key covers the whole rich presence and the server").
- **Map joins:** the target's key is `<steamid of the player joined through>` + newline + that player's `statusKey` (`join-manager.js:301-303`).
- **Who uses it:**
  - The map finder, to tell which of a server's players moved on last (`map-finder.js:709-725`, `buildServers` at `:118-182`). When a match ends, the server keeps its id and loads another map, while Steam still shows some players with the old score.
  - The join journal, which records the key in its snapshots (`join-manager.js:961-989`).
- **It no longer decides connects.** The history:
  - Commit f92e01b, **User decision 2026-10-25:** a connect went out only on a new target status, the server plus the whole rich presence.
  - Commit 957ae73, 2026-10-30: the token was left out of the key. In the journal, all three connects that followed a token-only change were wasted (two were the user's own arrival, one a refusal). The joins that worked came after a score change or a slot appearing.
  - Commit 34c9062, v0.9.4, **User decision 2026-11-06:** connect on every join token not yet sent, and never send one twice. A status change alone triggers nothing; the loop follows the tokens themselves (`rich-presence.js:74-80`, `join-manager.js:630-650`).
  - Notes that describe "one connect per new status" therefore no longer match the code.

## 11. Who asks, and how often

### 11.1 Callers

| Call (`src/steam/steam-api.js`) | Steam method                                     | Callers                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getFriendsList`                | own friends list (3.2)                           | reload, `app-friends-manager.js:278`                                                                                                                         |
| `getFriendsStatuses`            | GetPlayerLinkDetails, then summaries for avatars | friends round, `app-friends-manager.js:129`; reload, `:297`                                                                                                  |
| `getPresence`                   | GetPlayerLinkDetails                             | the user's location, `app-friends-manager.js:173`; map joins, `join-manager.js:238`; seeds, `map-finder.js:332`; Maps refresh, `:560`; friend check, `:1268` |
| `getJoinSnapshot`               | GetPlayerLinkDetails                             | friend joins, `join-manager.js:205`                                                                                                                          |
| `isPlayerInCS2`                 | GetPlayerLinkDetails                             | the CS2 check and the launch wait, `src/game/cs2-manager.js:119`                                                                                             |
| `getPlayerSummaries`            | summaries (3.4)                                  | account bar, `account-view.js:265` (avatars go through `getFriendsStatuses`)                                                                                 |
| `getFriendIdsOf`                | someone else's friends list (3.3)                | friends of friends, `map-finder.js:996`; friends of pool players, `:1078`; friend check, `:1252`                                                             |
| `resolveVanityUrl`              | ResolveVanityURL                                 | SteamID paste, `app-input-manager.js:103`                                                                                                                    |

### 11.2 Friends refresh

- **Start:**
  - It starts once per run when the saved settings check out: a saved SteamID and credential, a token that has not expired, and saved friends. The first round comes 500 ms later (`AUTO_REFRESH_START_MS`; "No reason for the wait is recorded", `constants.js:8-10`; `app-friends-manager.js:58-99`).
  - It starts again after a reload, after a fake friend is added, and after the tutorial (`:330-338`, `src/core/app.js:182-187`, `app-friends-manager.js:490-508`).
  - Each start runs one round at once, then one every `AUTO_REFRESH_INTERVAL_MS` = 3000 ms (`constants.js:7`, `src/core/app-state-manager.js:19`, `app-friends-manager.js:379-402`).
- **A round is skipped while:**
  - the tutorial runs;
  - the window is minimized. Since commit c455162 (2026-11-07): "nobody sees the list in a minimized window, and a running join asks Steam about its friend itself". One round goes out at once on restore (`:423-425`, `:465-480`; `app-friends-refresh.test.js:181` "no round goes out, and the list catches up the moment the window is back", `:200`);
  - the last round is still out (`:426-427`; `:126` "a slow round is not overlapped by the next ones");
  - Steam turned the credential down (`:428-430`).
- **One round:**
  - GetPlayerLinkDetails for the saved friends, the fake friends and the user, in one batch: ceil((F + 1) / 100) requests, where F counts friends and fake friends.
  - Summaries for casual friends whose avatar is not known yet, usually none.
- **Rate (derived):** 1,200 rounds an hour while the window is open. That is 1,200 requests an hour with up to 99 friends, and 2,400 with up to 199.
- **Before the cuts:** friends were refreshed every 3 s whenever the app was open (note, about 2026-10-30). **User decision:** cutting requests was postponed on 2026-10-25 and built on 2026-11-07 (commit c455162). The cuts have not yet been seen in use.
- **Reload**, on the user's click: one own friends list, ceil(F / 100) presence requests and avatars. It saves the ids (`app-friends-manager.js:229-351`).

### 11.3 Maps

- **Polling runs while some need holds** (`map-finder.js:500-528`; `map-finder.test.js:774` "polls while anything needs fresh servers and stops when nothing does"):
  - **view:** the Maps tab is shown, the window is not minimized, and either the window has focus or CS2 is open (`map-finder-view.js:156-173`; `__tests__/maps-view-minimized.test.js:112`, `:218` "leaving the window for another program stops polling, and coming back resumes it", `:232`, `:246`);
  - **join:** a map, server or pinned-maps join is running (`app.js:199-207`);
  - **keep:** maps are pinned, and CS2's own state says a pin may start its join soon (`src/game/map-keeper.js:137-167`; `__tests__/map-keeper.test.js:167` "pins poll Steam only while one may start its join soon"). That is: in the menu; or in a casual match at match point (one side at 7), at gameover, or when CS2 gives no score. Never without CS2's state.
  - Before commit c455162 (2026-11-07), an open Maps tab sent up to 30 requests every 30 s even with CS2 closed, and a pin kept polling whenever CS2 ran.
- **Refresh:**
  - One refresh as soon as polling starts, then every `REFRESH_INTERVAL_MS` = 30 s (`constants.js:83`, `map-finder.js:514-528`).
  - Skipped without a credential, or with one Steam turned down (`:548-552`).
  - One runs at a time. A refresh asked for meanwhile runs right after (`:542-546`, `:612-615`; `map-finder.test.js:381`).
- **Ids per refresh:** at most `MAX_IDS_PER_REFRESH` = 3000. The code comment: "At 100 ids per request this caps one refresh at 30 requests" (`constants.js:84-85`). That means at most 30 GetPlayerLinkDetails requests, one after the other.
  - The ids, in order: friends and fake friends; seeds; the pool, most recently seen first; then, in the room left, a different slice each refresh of friends of pool players and friends of friends.
  - The user is never asked about here (`map-finder.js:933-973`; `map-finder.test.js:300` "asks about friends, the pool and seeds, never the user", `:354` "friends of friends take the room left, a different slice each time", `:864`).
- **Why this order and cap (Measured):**
  - 2026-10-30, about 15:20 Moscow time: 2 of 43 pool players (about 5%) were on an official casual server, against 3 of 2346 friends of friends (0.13%).
  - 2026-10-25: 0.69% of friends of pool players, 0.21% of friends of friends.
  - The note's conclusion: "one proven casual player is worth dozens of random ones, and polling cost (100 ids per request) rules out polling a 40k pool every 30 s".
  - One pass over 20,000 friends of pool players takes 200 requests, spread over the refreshes (`constants.js:94-97`).
- **No answer at all:** a refresh that got no answer keeps the servers known (`map-finder.js:562-567`; `map-finder.test.js:396` "a refresh Steam did not answer at all keeps the servers known").
- **Friend checks**, with a key only:
  - They run after a refresh that got answers, beside the polling, and never hold it up.
  - At most `FRIEND_CHECKS_PER_REFRESH` = 4 checks that ask Steam anything. Each reads one list, unless it was read within 24 h, then asks presence for ceil(friends / 100) requests (`map-finder.js:20-29`, `:1140-1284`; `map-finder.test.js:1434` "a refresh starts a few checks at most, the servers best to join first", `:1466`, `:1356` "a friends list is read again only after a day").
  - The code comment estimates about 3 requests per check and about 12 per refresh. Checking all such players at once "would add several times the 30 requests a refresh takes at most": the census of 2026-11-04 found 40 players with a sign of Prime on official servers.
- **Seeds:**
  - Whenever CS2's state changes while the user's own match is casual, new seeds are asked about at once, from any tab. Seeds are the player the user watches and everyone CS2 lists. That costs ceil(seeds / 100) requests (`map-finder.js:279-349`).
  - A seed Steam answered about is never asked again in this run; an unanswered one stays (`:468-498`; `map-finder.test.js:518` "are asked about at once, with no refresh, and the official ones join the pool", `:551` "in another mode are not asked about", `:564`, `:326`).
  - The reason in the code: right now these players share a server with the user, which a later refresh cannot promise.
  - **User decision (2026-10-30):**
    - Seeds are taken only while CS2 says the match is casual, so other modes cost no requests.
    - The question per player stays, because CS2 lists players whatever their privacy. A hidden player would otherwise sit in the pool for 14 days and be polled for nothing.
- **Lists, on the user's click and with a key only** (`map-finder.js:975-1101`):
  - friends of friends: one list per friend of the user, 250 ms apart, until 5,000 ids are found;
  - friends of pool players: one list per pool player not read in 24 h, most recently seen first, 250 ms apart.
- **Measured:** Maps refreshes took about 25 requests per 30 s (note, before 2026-11-07).

### 11.4 Joins

- **Start:** the app checks whether the user is in CS2 (`cs2-manager.js:68-134`; `__tests__/cs2-manager.test.js:247` "CS2 closed by the log is not in CS2, and Steam is not asked", `:255`, `:301` "checkUserInCS2 answers from a fresh state without asking Steam").
  - The order: Steam's game log, then CS2's own state (GSI), and a Steam request only when neither can tell. So 0 or 1 GetPlayerLinkDetails.
  - An unknown answer goes ahead without offering a launch (`join-manager.js:361-399`; `__tests__/join-manager-loop.test.js:792` "Steam not answering the CS2 check goes ahead without offering a launch").
- **Launch wait:** while CS2 is not reporting, one check every `CS2_LOBBY_POLL_MS` = 3 s, until the menu or until `CS2_LAUNCH_TIMEOUT_MS` = 180 s: at most 60 requests (`cs2-manager.js:154-304`, `constants.js:15-19`).
- **The loop** makes exactly one presence call per iteration (`join-manager-loop.test.js:933` "each iteration asks Steam exactly once, through getJoinSnapshot only"):
  - a friend join asks about the user and the friend in one request (`join-manager.js:197-222`);
  - a map, server or pinned-maps join asks about the user and every candidate in one batch: ceil((1 + candidates) / 100) requests (`:224-241`).
- **Pace:** the loop waits `JOIN_LOOP_INTERVAL_MS` = 200 ms after each answer, and `JOIN_RETRY_INTERVAL_MS` = 400 ms after a connect (`constants.js:11-12`, `join-manager.js:503-724`).
  - **User decision 2025-06-15** (commit c56a7c9, v0.4.7): 200 ms, down from 500.
  - **Measured 2026-10-25:** an iteration takes about 0.5 s, the 0.3 s request for 22 ids plus the 0.2 s pause. That is about 2 requests a second, about 7,200 an hour for each running attempt (derived).
  - The "five a second" in the logger's comment is the ceiling with an instant answer.
  - **Measured 2026-10-30:** for the 9 slots in the journal, faster polling would not have changed any outcome. Dropping the pause would gain about 0.1 s on average.
- **Failures:**
  - When Steam does not answer for either side, the loop cancels nothing and sends nothing.
  - More than `MISSING_TIMEOUT_MS` = 60 s of failures in a row cancels the attempt with "no-answer", and any answer starts the budget over (`join-manager.js:486-516`; `join-manager-loop.test.js:638` "for %s does not cancel and sends nothing to the game", `:662` "for longer than MISSING_TIMEOUT_MS in a row cancels the attempt", `:682` "a real answer in between starts the failure budget over").
  - At the 200 ms pace that can be up to about 300 failing requests (derived), fewer when each failure takes long.
- **Timers must keep full pace while CS2 covers the window**, or the request pace drops. **Measured 2026-11-03:** with default background throttling, a covered window's 200 ms pauses took 1000 ms, and after 5 minutes it woke about once a minute.

### 11.5 One-off requests

- **Account bar:** one summaries request per account per run.
- **Vanity link:** one ResolveVanityURL per pasted link.
- **Reload:** 11.2.

### 11.6 Against the limits

These figures are derived from the constants. Nobody has measured the total.

| Feature                              | Requests            | Per hour while running |
| ------------------------------------ | ------------------- | ---------------------- |
| Friends refresh, up to 99 friends    | 1 every 3 s         | 1,200                  |
| Friends refresh, 100 to 199 friends  | 2 every 3 s         | 2,400                  |
| Maps refresh at the cap              | 30 every 30 s       | 3,600                  |
| Friend checks at the code's estimate | about 12 every 30 s | about 1,440            |
| One running join                     | about 2 a second    | about 7,200            |
| Launch wait                          | 1 every 3 s         | at most 60 per launch  |

- **With a key as the main credential**, all of this counts against 100,000 a day, about 4,170 an hour on average. For example:
  - the friends refresh alone, left open for 24 hours: 28,800;
  - the Maps tab watched for 8 hours: about another 40,000;
  - one hour of waiting joins: about 7,200.
- **With a token as the main credential**, the key carries only the friends lists, one request per list.
- The app keeps no count and has no budget.

## 12. Smells and open questions

### Smells

- **Two ways to tell a token from a key.** The URL builder sends any string not shaped like a JWT as `key=` (`api-config.js:77-89`). The UI requires a 32-character key (`validators.js:26-29`). Background rounds use the raw field value (`app-input-manager.js:61-65`); only the reload validates it.
- **Sharing is inconsistent about credentials.** Batchers are kept per credential, but the cache and the waiting on requests in flight are not (`steam-api-client.js:67-89`, `:174-207`).
  - A caller can be served an answer that was fetched with another credential, and then its own credential state is never updated.
  - This is harmless today, because GetPlayerLinkDetails answers a token and a key alike (2026-11-04), but it looks accidental.
- **A "cache" of 100 ms.** It only merges callers that ask at the same moment. Its lifetime is derived from the join loop's pause, with a hard-coded fallback of 200 (`steam-api-client.js:53-56`), which ties the transport to the join pace.
- **The 10 ms batch window serves one pair of calls**, the friends round and the user's location (`app-friends-manager.js:127-134`). One explicit combined call would make that sharing certain instead of depending on timing.
- **Only HTTP statuses stop a batch.** Network errors and timeouts do not (`steam-api-client.js:323-353`).
  - A hanging Steam can cost a 30-chunk refresh up to 30 × 10 s.
  - Summaries chunks never stop on a status, yet a network error ends them (`:461-497`).
- **An empty answer is taken as "no such account".** A chunk answered without `accounts` counts as "no account" for every id and is cached that way (`:316-322`). Steam's empty answer to 101 to 200 ids (2026-10-30) shows that an empty answer proves nothing.
- **Failures look like private lists.** For someone else's list, every failure gives the same empty list (`:629-649`). So a passing 429, 5xx or timeout costs a day:
  - the friend check keeps the empty list for a day as "closed" (`map-finder.js:1249-1264`);
  - the read of pool players' friends marks the player as read for a day (`:1080`);
  - a pass of friends of friends that only failed is reported as a wrong key (`:1013-1018`).
- **Credential checks cover the wrong methods.**
  - They include GetPlayerSummaries, whose token endpoint has never been checked (see the open questions).
  - They leave out reads of other people's lists, so a wrong friends-list key is never marked, and every read pays one request per list.
- **Some pollers ignore the credential state:** the join loop, the seed check and the launch wait (`join-manager.js:486-516`, `map-finder.js:317-349`, `cs2-manager.js:77-134`).
  - A running join with a turned-down credential spends up to 60 s of failing polls, up to about 300 requests, before "no-answer".
  - Commit d31a083 left the join loop with its own budget on purpose; the rewrite should decide this explicitly.
- **A failed friends round empties the list.** A round that gets no answers draws an empty friends list, because friends Steam was not asked about are "simply not listed" (`steam-api-client.js:668-675`, then `app-friends-manager.js:136-143`). Only friends with a running join stay. The map finder, by contrast, keeps what it knew (`map-finder.js:562-567`). It is open whether the friends list should do the same.
- **Vanity failures all look alike.** `resolveVanityUrl` never raises (`steam-api-client.js:707-722`), so the input manager's error branch can never run (`app-input-manager.js:114-118`). "No match", a turned-down credential and Steam being down all read as "not resolved". The vanity pattern also keeps a query string or a fragment (`validators.js:159-167`).
- **Friend objects carry the raw `connect`, unchecked** (`steam-api-response-processor.js:514`). Nothing joins from it, because joins read their own snapshot, but the model should hold only checked values.
- **Two parsers of one format.**
  - `parseRichPresence` runs one regular expression per key over the whole string, wants non-empty values and takes the first match (`rich-presence.js:26-51`). `richPresenceKey` scans pairs and allows empty values (`:84-91`).
  - A value that equals a key name would be misread by the first.
  - `isInSupportedMode` and `isInProtectedMatch` test for `""`, which `parseRichPresence` never returns.
- **Repeated work.**
  - Each account's rich presence is parsed three or four times per round (`steam-api-response-processor.js:185`, `:234`, `:395-404`, `:483-517`; `steam-api-utils.js:141-159`).
  - The server-id fallback is written twice (`steam-api-response-processor.js:211-212`, `:508-509`).
- **Avatars are inconsistent.**
  - Rows and the bar choose sizes differently, and rows prefer the 32-pixel `avatar` over the 64-pixel `avatarmedium` (`steam-api-utils.js:117-124`, `account-view.js:272-273`, `friends-renderer.js:198-199`).
  - The avatar cache never expires or shrinks.
  - A player whose summary keeps failing is asked about again every 3 s.
- **Logging volume does not match its own rule.**
  - Request lines were moved to debug because of the IPC cost (`api-logger.js:21-27`), yet every friends round logs five or six lines at info (`steam-api-response-processor.js:120-141`, `:428-454`, `:528-531`; `app-friends-manager.js:145-148`).
  - The CS2 check logs at info on every call, and logs the whole raw answer at debug (`steam-api-response-processor.js:287-306`, `:339-382`).
  - The warning about a malformed connect logs its value, and the set of values already reported never shrinks (`:167`).
- **The status key's documentation is wrong.**
  - `PlayerJoinInfo` says `statusKey` covers "everything Steam shows" (`types.js:36-37`), but it leaves out the join token.
  - It does include `version` and party keys, so a CS2 update changes every player's key at once, and the map finder's "changed since" restarts for everybody.
- **Dead or redundant code:**
  - `parseJsonResponse` checks `ok` again (`http-client.js:56-58`);
  - the `signal` option is never passed by any caller (`steam-api-client.js:371`);
  - `withTimeout` drops the timeout when `AbortSignal.any` is missing and a caller signal is given (`http-client.js:13-16`);
  - `fetchAndRenderFriendsByIds` has an error notice for `keepStates` false, which no caller passes (`app-friends-manager.js:108-156`).
- **Records disagree with the code.**
  - CHANGELOG 0.4.0 says friends in deathmatch can be joined. Since commit 8d028f6 (2026-10-25) only casual can, and no CHANGELOG entry says so. `GAME_MODES.DEATHMATCH` survives only in the list of modes a join may interrupt.
  - The tests treat `premier` as a mode Steam showed (`steam-api-join-snapshot.test.js:312-321`, `rich-presence.test.js:108-112`). The mode census of 2026-11-03 and the localization read of 2026-11-04 say Premier is `competitive` with `game:qmmflags` 1. The test is harmless, since unknown running modes are protected anyway.
- **The friend-check budget counts checks, not requests** (`map-finder.js:1153-1165`). One player with a 2,000-friend list costs about 21 requests in a single check, far beyond the comment's "about 12 a refresh".
- **The token's own-list request also sends `steamid`** (`steam-api-client.js:431-435`). Whether Steam reads it is not known.

### Open questions

- Does `ISteamUserOAuth/GetUserSummaries/v1` answer today's JWT token, and if not, with what status?
  - It is a credential-checked method, so a 401 or 403 there would pause all background polling for a token that works.
  - Nothing dated is recorded about it. The token cannot read `ISteamUser/GetPlayerSummaries`, which answers it with 400 (2026-11-04).
- Does ResolveVanityURL accept a token?
- What status does Steam give an expired token, as opposed to a made-up one, on GetPlayerLinkDetails? The code assumes 401 or 403. The only dated check is a made-up token on the friends list (401, 2026-11-03).
- Does the token have a daily limit, or a 429 at some rate? Neither is recorded.
- Is the "empty response" to 101 to 200 ids an HTTP 200 without accounts? If so, the code would read it as "no account" for every id.
- Does GetPlayerLinkDetails' public data carry an avatar hash? Unverified: Steam's protobuf definitions name a `sha_digest_avatar` field there. If it is filled, avatars would need no summaries request at all.
- Does `game:state` take values other than `game` and `lobby`, for instance while loading? None is recorded. The code takes any other value that is present as a running match.
- What string does Steam give for deathmatch's `game:mode`? It was never seen.
- Will Steam list anonymous servers' addresses again? On 2026-11-04 it gave 0 of 97. The app does not need them, by the user's decision of 2026-10-30.
- The known gap in the official signature: a community server run without a login token, on a stock map, in casual. None has been seen; a sighting would need a new check.
- How do the request cuts of 2026-11-07 behave in real use? The in-game checks wait for the user's app to update to 0.9.7.
