# 02 Account and friends

Behaviour specification for CS2 Casual Enjoyer 1.0.0: the Steam account the app runs on (SteamID, web token or API key), how it is checked, kept and refreshed, the friends list with its rows and states, manually added Steam IDs ("fake friends"), the account panel and bar, and the notifications these raise.

Written 2026-11-07 from the 0.9.7 tree (master at `4f1b311`), its Jest tests, `CHANGELOG.md`, the commit messages cited and the project's memory notes of measured facts and user decisions (`casual-map-finder-research.md`, `steam-token-automation.md`, `no-extra-setup.md`, `steam-ui-style.md`, `v1-rewrite-plan.md`, `one-answer-per-fact.md`). Where a note and the code differ, the code is described and the difference is said.

## How to read this

- Rules are requirements, independent of Electron or Tauri. "Now:" names the current mechanism as evidence only.
- Each rule has an ID (`TF-1`, `AR-4`, ...) for tests to cite.
- `path:line` points into the 0.9.7 tree. Tests are cited as `file` "test name".
- **Measured** marks an observation from live use, with its date. **Decision** marks the user's choice, with its date.
- Placeholders stand for real values: `<SteamID64>`, `<token>`, `<key>`. This document holds no real IDs or credentials.
- Out of scope, covered by other spec documents: what a join does once started (the join loop, the "missing" minute, the join bar), the encryption of stored credentials, the Maps tab, the tutorial, GSI and whether CS2 is open.

## Behaviour that must survive

Each of these looks like a workaround but answers a measured problem or a decision:

- A paste replaces the token field's whole value (TF-1): the masked field held the old token, and the paste landed beside it.
- A fresh token for the saved account is saved the moment it is pasted (SV-2): before, a restart brought back a token that had expired days earlier.
- The daily renewal needs no click on Load (ST-3): paste, and the list comes back by itself.
- A credential Steam turned down stops background polling until it is replaced or answered again (section 6): an expired token kept failing every 3 s overnight.
- A reload of the same account keeps running joins (LD-8): a reload once ended two attempts waiting on a full server.
- Minimize and restore come from the window system, not from page visibility (AR-7): the page stays "visible" because background throttling must stay off for joins.
- A friend whose join runs stays listed after leaving casual (FL-3), and a friend on the user's server is shown but blocked (RW-7, decision 2026-11-03).
- A token's 401 on the friends list means the token, a key's 401 means a private list (LD-7).

## Terms

- **SteamID64**: a Steam account id, 17 decimal digits.
- **Token**: the Steam Web API access token (a JWT) that Steam's store shows on its token page. **Key**: a Steam Web API key, 32 letters and digits. **Credential**: either.
- **Account in use**: the SteamID and the credential as the account fields hold them right now (trimmed, the token taken out of pasted JSON).
- **Saved account**: `steam_id` and `auth` in the settings file.
- **Friends list**: `friends_ids`, the confirmed Steam friends at the last successful load.
- **Fake friends**: SteamID64s the user tracks by hand, `fake_friend_ids`.
- **In casual**: rich presence `game:mode` is `casual` and `game:state` is neither empty nor `lobby` (`src/steam/rich-presence.js:144-149`).
- **Free slot / joinable**: in casual and rich presence `connect` matches `GC_CONNECT`, a single `+gcconnect` value with nothing riding along (`src/steam/rich-presence.js:124-128`, `156-160`).
- **Round**: one auto-refresh cycle of Steam requests and a redraw.

## Constants

| Name                                      | Value                                 | Code                                       | Reason given                                                                                             |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `AUTO_REFRESH_INTERVAL_MS`                | 3000 ms                               | `src/shared/constants.js:7`                | None recorded; present since the first commit (2025-05-28).                                              |
| `AUTO_REFRESH_START_MS`                   | 500 ms                                | `src/shared/constants.js:8-10`             | "No reason for the wait is recorded."                                                                    |
| `TUTORIAL_TIMING.AUTO_REFRESH_RESTORE_MS` | 500 ms                                | `src/ui/tutorial/tutorial-timing.js:12-14` | "ensure tutorial cleanup is complete"                                                                    |
| `EXPIRY_WARNING_MS`                       | 60 min                                | `src/ui/account-view.js:7-10`              | When the bar calls a token expiring.                                                                     |
| `CLOCK_MS`                                | 60 s                                  | `src/ui/account-view.js:12-15`             | How often the bar rechecks the time left.                                                                |
| `REMOVE_CONFIRM_MS`                       | 3000 ms                               | `src/ui/fake-friends-view.js:19-22`        | Window for the confirming second click.                                                                  |
| `REQUEST_TIMEOUT_MS`                      | 10 s                                  | `src/shared/constants.js:32-35`            | Steam answers in well under a second; this only ends a stuck request, which counts as failed.            |
| Ids per presence request                  | 100                                   | `src/steam/steam-api-client.js:58-65`      | URL length. **Measured** 2026-10-30: 101-200 ids return an empty answer, 250 or more HTTP 400, POST 405. |
| Batch window                              | 10 ms                                 | `src/steam/steam-api-client.js:52`         | Calls in one tick share a request, so the user's own presence rides with the friends'.                   |
| Presence cache                            | 100 ms                                | `src/steam/steam-api-client.js:53-56`      | Half the join loop's 200 ms pause.                                                                       |
| `STEAM_ID`                                | `/^\d{17}$/`                          | `src/shared/constants.js:150`              |                                                                                                          |
| `API_KEY`                                 | `/^[A-Z0-9]{32}$/i`                   | `src/shared/constants.js:151`              |                                                                                                          |
| `WEB_API_TOKEN`                           | `/^[\w-]+\.[\w-]+\.[\w-]+$/`          | `src/shared/constants.js:152`              | JWT shape only.                                                                                          |
| `GC_CONNECT`                              | `/^\+gcconnect[A-Za-z0-9:_-]{1,64}$/` | `src/shared/constants.js:153-155`          | Nothing else may ride into CS2's launch arguments.                                                       |

## 1. Credentials: token or API key

The user pastes one credential into one field. The panel and the help recommend the token.

- **CR-1 Accepted forms.** The field may hold everything Steam's token page shows (JSON with `data.webapi_token`), a bare token, or a key. Extraction, in order: JSON with `data.webapi_token` gives that token; anything else is taken as it is, trimmed (`src/utils/validators.js:49-85`). Tests: `validators.test.js` "takes the token out of the JSON Steam shows", "passes a bare token or key through".
- **CR-2 Kinds.** A key is 32 letters and digits, case-insensitive. A token is three dot-separated runs of word characters and dashes. The field is valid when it holds a key, a token, or JSON around a token (`src/utils/validators.js:122-133`). Tests: "isApiKey and isWebApiToken tell keys and tokens apart", "validateApiAuth accepts a key, a token or the JSON around a token".
- **CR-3 Token contents.** The middle part is base64url JSON: `sub` is the account's SteamID64, `exp` the expiry in Unix seconds. Signature and audience are not checked. A token-shaped string whose middle part does not decode has no token info (`src/utils/validators.js:94-113`). Tests: "reads the SteamID and expiry", "decodes base64url payloads that plain base64 cannot", "returns null for anything that is not a token".
- **CR-4 Endpoints by kind** (`src/steam/api-config.js:19-56`, `84-89`). A token goes as `access_token`, a key as `key`.
  - Friends list: token `IFriendsListService/GetFriendsList/v1`; key `ISteamUser/GetFriendList/v1` with `relationship=friend`.
  - Names and avatars: token `ISteamUserOAuth/GetUserSummaries/v1`; key `ISteamUser/GetPlayerSummaries/v2`.
  - Presence: `IPlayerService/GetPlayerLinkDetails/v1` for both. Profile links: `ISteamUser/ResolveVanityURL/v1` for both.
- **CR-5 No Steam login.** The app never signs in to Steam and never handles a password or Steam Guard code. The credential arrives only by paste or typing. **Decision** 2026-11-06: the user declined both researched ways to avoid the daily paste ("нет, не надо"): QR login through the Steam mobile app, and automating Ctrl+A/Ctrl+C on Steam's page. Ruled out earlier: login in an embedded browser (its cookie jar sits in plain text), password login, and lifting the local Steam client's credentials. Do not build these unless the user brings the daily paste up (`steam-token-automation.md`).
- **CR-6 The only setup.** The credential (and, for a key, the SteamID) is all a player sets up: no launch options, nothing else. **Decision** 2026-10-26/30 (`no-extra-setup.md`): some players already balk at getting a token or key.
- **CR-7 Never logged.** Request URLs are logged with `key=***` and `access_token=***` (`src/steam/steam-api-utils.js:49-51`, `src/steam/api-logger.js:18-41`). The settings store logs field names, never values (`src/main/settings-store.js:131-139`).

Why, **measured** 2026-11-04 ("Token against key" in `casual-map-finder-research.md`):

- The token is a JWT for the audiences client and web, lives 24.2 h, and carries the user's IP address.
- The token read the user's own friends list while it was private (67 friends); the key got HTTP 401 on the same list. A token user may keep the list private; a key user must make it public for every load.
- `GetPlayerLinkDetails` answered the key exactly as it answered the token.
- The key is limited to 100,000 calls a day by Steam's terms.
- With the token, `GetPlayerSummaries` answered HTTP 400; the app uses `ISteamUserOAuth/GetUserSummaries` with a token instead (CR-4).

Texts: `account.panelIntro` ("Needed about once a day: a Steam token lives for about 24 hours. Your friends load by themselves."), `help.apiKey.*` (section 16).

## 2. The token field and the paste rule

The user sees one masked field in step 2 of the panel: password type, no autocomplete, no spellcheck (`index.html:126-133`). At start it holds the saved credential, which the mask hides.

- **TF-1 A paste replaces.** A paste whose text, trimmed, is not empty replaces the field's whole value with that trimmed text, then runs TF-3. A paste with no text, only whitespace, or no clipboard text is left to the default behaviour (`src/core/app-input-manager.js:158-173`). Tests: `app-input-manager.test.js` "a paste replaces the saved token instead of joining it", "pasting the saved credential again changes nothing", "a paste without text is left to the browser".
  - Why: commit `7654b39` (2026-11-07, shipped in 0.9.6). The field keeps the saved token, expired ones included, and masks it, so the old value cannot be seen. Ctrl+V put the new token at the caret beside the old one, and the user had to delete the old one by hand before every paste. The field only ever holds one credential, pasted whole.
- **TF-2 The keyboard waits in the field.** "Open in Steam" (step 1) moves the keyboard focus to the token field, so Ctrl+V works the moment the user comes back from Steam (`src/ui/account-view.js:62-66`). The Account button opens the panel and does the same (`src/ui/account-view.js:55-61`). Test: `account-view.test.js` "Open in Steam leaves the keyboard in the token field for the paste".
- **TF-3 On every change** of the field, typed or pasted, in this order (`src/core/app-input-manager.js:129-156`):
  1. Extract the credential (CR-1).
  2. Compare it with the previous one: the last value this handler saw or, before the first change of the run, the saved `auth` (extracted). Only a different value ends all running join attempts. Reformatted JSON, the bare token of the same JSON, and surrounding spaces count as the same. Why (code comment): the handler runs on every keystroke, and at startup the field is filled from settings without a change event while running joins use that value. Tests: "first edit that keeps the saved key does not reset joins", "changing the key resets joins once", "typing that leaves the extracted value unchanged does not reset", "typing into an empty field compares against saved settings".
  3. If the credential is a token that names a SteamID, write that SteamID into the SteamID field ("a token carries its SteamID: fill it in rather than ask for it").
  4. Validate the inputs (section 4).
  5. Save the token if it is a fresh token for the saved account (SV-2). Nothing waits for the save.
- **TF-4** A join attempt keeps the account and credential it started with; only step 2 above ends it when the credential changes (`src/game/join-manager.js:401-408`).

Edge cases:

- Pasting the saved credential again changes nothing: no reset, no save.
- Pasting the JSON of an expired token: the field turns yellow, nothing is saved, Load stays disabled (section 5).
- Typing a key character by character: each keystroke is a new value, so each resets joins (harmless after the first) and the background refresh asks Steam with the partial text (see Smells).

Texts: `account.step1`, `account.openInSteam`, `account.step1Hint` ("The page may look black, that is fine."), `account.step2`, `account.step2Hint` ("Ctrl+A, Ctrl+C on the Steam page, then Ctrl+V in the field.").

## 3. The SteamID

Step 3 of the panel. Its title says where the SteamID comes from; the input row is visible only for a key.

- **SI-1** The SteamID in use is the SteamID field's trimmed value (`src/core/app-input-manager.js:53-56`). With a token the field is filled from the token's `sub` (TF-3 step 3) and stays hidden; with a key the user enters it.
- **SI-2** Valid means exactly 17 digits (`src/utils/validators.js:16-19`). Test: `validators.test.js` "validateSteamId accepts 17 digits only".
- **SI-3 Step title** (`src/ui/account-view.js:227-247`): a token with a SteamID gives `account.steamIdFromToken` ("SteamID taken from the token: {steamid}"); otherwise a key gives `account.steamIdForKey`; otherwise `account.steamIdPending`. The input row shows only for a key. The step's number "3" becomes a drawn check once the SteamID is valid. Test: `account-view.test.js` "the SteamID step: read from a token, typed in for an API key".
- **SI-4 Pasting a profile link** into the SteamID field (`src/core/app-input-manager.js:71-124`). Only text containing `steamcommunity.com` is handled; any other paste behaves as usual.
  - `/profiles/<17 digits>` puts those digits in the field and validates.
  - `/id/<name>` needs a credential in the token field, else error `validation.vanityNeedsAuth`. While Steam resolves the name the field shows `validation.vanityResolving` and is disabled. A SteamID found replaces the field and hides the notification. No SteamID restores the previous value and shows `validation.vanityNotResolved`. The field is re-enabled and validated in every case.
  - Any other `steamcommunity.com` link gives `validation.unrecognizedSteamUrl`.
  - Tests: `validators.test.js` "reads a SteamID64 profile link", "reads a vanity profile link", "rejects other links".
- **SI-5** The "SteamID64" link beside the field opens the SteamID help card (section 16) instead of its own target (`src/core/app.js:126-133`).
- **SI-6 Who reads the SteamID in use:** the friends load (LD-1), the user's own presence (UL-1), the account bar's profile (AP-8), a join attempt at its start (`src/core/app.js:192-198`), GSI's "CS2 on another account" check (`src/core/app.js:228-232`), the Maps tab (`src/core/app.js:236-246`) and the fake friends' own-ID check (FF-1). A change of the SteamID field alone does not end running joins; only a credential change (TF-3) or a load for another account (LD-8) does.

## 4. Validating the inputs

Runs at startup once the fields are filled, on every SteamID input, after every token-field change, after a profile link resolves, and after a successful load (`src/core/app.js:105-124`, `346-349`; `src/core/app-input-manager.js:90`, `121`, `154`; `src/core/app-friends-manager.js:328`).

In this order (`src/core/app-input-manager.js:211-303`):

- **VA-1** Compute: the SteamID is valid (SI-2); the credential is valid (CR-2); the saved account is complete (saved settings hold both `steam_id` and `auth`).
- **VA-2** The token whose expiry counts: the token in the field (bare or in JSON); only when the field holds no token, the saved `auth` if that is a token. Expired means `exp * 1000 < now`.
- **VA-3** Load is enabled when ((SteamID valid and credential valid) or saved account complete) and the token of VA-2 has not expired.
- **VA-4** SteamID field: valid is green, non-empty and invalid is red, empty is neutral.
- **VA-5** Token field, only when not empty: invalid is red; valid but expired is yellow; valid is green (`css/forms.css:35-79`).
- **VA-6** Hand the account view its facts: `steamId`, `validSteamId`, `auth`, `validAuth`, `isKey`, `tokenInfo`, `tokenExpired`, `hasFriends` (a friends list is loaded) (`src/shared/types.js:40-50`).
- **VA-7** Offer the startup refresh (ST-2); after it has started once this does nothing.

## 5. Token expiry

The user sees the expiry in the account bar: "Token valid until DD.MM, HH:MM", in the last hour a yellow "Token expires in N min", afterwards a red "Token expired, get a new one". The last two are clickable and open the panel. An expired token found at validation forces the panel open with a yellow field and Load disabled.

- **EX-1** Expiry comes from the token's `exp` alone; nothing asks Steam about it. A key has none: the bar shows `account.apiKey` in the ok state.
- **EX-2 Bar text** by time left (`src/ui/account-view.js:190-221`):
  - a credential Steam turned down overrides everything (RJ-3);
  - no time left (`<= 0`): state expired, `account.tokenExpired`;
  - under 60 minutes: state warn, `account.tokenExpiresIn` with minutes = max(1, round(left / 60,000));
  - otherwise: state ok, `account.tokenValidUntil` with the expiry as "DD.MM, HH:MM", two digits each, local time, the same format in both languages (`src/ui/account-view.js:17-27`).
  - Tests: `account-view.test.js` "a working account shows the bar: name, avatar and the token's expiry", "the token is called out in its last hour and once it has expired".
- **EX-3** The bar re-evaluates every 60 s from the last facts; the clock starts with the first facts that carry a token and runs for the rest of the run (`src/ui/account-view.js:90-92`). It changes the bar only. The forced panel, the Load button and the field colour change at the next validation (section 4).
- **EX-4** An expired token at validation: the panel is open with no Close (AP-1), Load is disabled (VA-3), the field is yellow (VA-5), the startup refresh does not start (ST-2), the profile is not asked for (AP-8), and the token is not saved (SV-2).
- **EX-5** When the token expires while the app runs, the bar says so within a minute. The next background round gets a 401 or 403 from Steam, which marks the token turned down (section 6), so the bar soon reads `account.tokenRejected` instead and polling pauses until a new token is pasted. While the window is minimized no round runs, so the bar keeps saying expired.

Why: the token is the daily event (**measured** lifetime 24.2 h, 2026-11-04); the panel is built around renewing it.

Texts: `account.tokenValidUntil`, `account.tokenExpiresIn` ("Token expires in {minutes} min"), `account.tokenExpired`, `account.apiKey`.

## 6. Credentials Steam turned down

- **RJ-1** A 401 or 403 answer to a call that any valid token or key may make, presence (`GetPlayerLinkDetails`) or names and avatars (`GetPlayerSummaries`/`GetUserSummaries`), marks that exact credential as turned down. An OK answer to such a call made with it clears the mark (`src/steam/steam-api-client.js:13-20`, `382-390`; `src/steam/credential-state.js:22-48`).
- **RJ-2** The friends list call does not mark: there a 401 with a key means a private list, not a bad key (LD-7).
- **RJ-3** While the credential in the field is marked: background rounds skip (AR-4); the bar shows `account.tokenRejected` or `account.keyRejected` in the expired look, clickable (`src/ui/account-view.js:191-198`); the Maps tab skips too (Maps spec). The bar redraws the moment a mark is set or cleared (`src/ui/account-view.js:79`).
- **RJ-4** The mark ends when another credential is entered (a different string is not marked) or when a call made with the marked one is answered: the reload the user asks for (its presence request is always sent), the immediate fetch of any auto-refresh start (AR-1), or a profile request. Tests: `steam-api-batching.test.js` "a 401 marks the credential turned down, and an answer takes it back", "another credential is not held back by one Steam turned down"; `app-friends-refresh.test.js` "pauses while Steam turns the credential down, and goes on with a new one"; `account-view.test.js` "a token or key Steam turned down is called out until Steam takes it again".
- **RJ-5** Marks live in memory for the run; a restart forgets them and costs one failing request.
- **RJ-6** A 401, 403, 429 or 5xx on one chunk of a presence batch leaves the chunks after it unsent; their ids stay unanswered and the next round asks again (`src/steam/steam-api-client.js:22-30`, `343-353`). Test: `steam-api-batching.test.js` "an HTTP %s stops the rest of the batch, its ids left unanswered".

Why: commit `d31a083` (2026-11-03). A token that expired overnight kept the friends refresh sending a failing request every 3 seconds, and the Maps tab 30 every 30 seconds, until a new one was pasted; polling on with it only spends Steam's daily allowance on failures (`src/steam/credential-state.js:4-11`).

Texts: `account.tokenRejected` ("Steam turned the token down, get a new one"), `account.keyRejected`.

## 7. Saving and checking the account

- **SV-1 Checked by use.** The account and credential are saved when Steam has answered the friends list request for that SteamID with that credential (LD-6). The only local checks are the formats (CR-2, SI-2) and the token's expiry.
- **SV-2 A fresh token for the saved account is saved at once**, when all of these hold, in order (`src/core/app-input-manager.js:175-206`): the field holds a token with token info; the saved settings have a `steam_id` and it equals the token's SteamID; the token has not expired (`exp * 1000 > now`); it differs from the saved `auth` (extracted). Then `{auth: <token>}` is written and the merged settings become the saved account. A failed write is logged only.
  - Tests: `app-input-manager.test.js` "a fresh token for the saved account is kept at once", "a token for another account waits for that account's friends list", "neither an expired token nor the one already saved is written".
  - Why: commit `68b063d` (2026-11-03). A new token used to be kept only by the next friends reload, so the settings file held a token that had expired days before (the research note names one that expired on 2026-10-30), and a restart brought it back.
- **SV-3** A token for another account is not saved until that account's friends list loads, so the saved account and its friends list always belong together.
- **SV-4** Never saved: an expired token, a credential that only passed the format check, a key typed without a successful load.

**Stored.** `%APPDATA%\cs2-casual-enjoyer\settings.json` (Electron's userData; `src/main/main.js:15`), one JSON object owned by the main process.

- The UI sends patches. A key set to null is removed, any other value replaces the stored one, keys not in the patch stay. Patches apply one at a time on top of the file. The answer is the merged settings, or null when the write failed. Reading a missing or broken file gives null (`src/main/settings-store.js:50-91`). Tests: `main-settings.test.js` "merges a patch into what is stored", "a null field removes it", "patches sent at the same time all land", "a failed write reports null and does not block later patches", "a broken file reads as no settings and is reported", "reads nothing when there is no file yet, without an error".
- Fields of this part:

| Field             | Shape                                                          | Written by    | Read by                                     |
| ----------------- | -------------------------------------------------------------- | ------------- | ------------------------------------------- |
| `steam_id`        | string, SteamID64                                              | a load (LD-6) | startup, SV-2, FF-1, UL-1                   |
| `auth`            | string: a bare token or a key, never the JSON                  | a load, SV-2  | startup (fills the field), VA-1, VA-2, TF-3 |
| `friends_ids`     | array of SteamID64 strings, confirmed friends in Steam's order | a load        | startup, AR, AP-1                           |
| `fake_friend_ids` | array of SteamID64 strings in the order added                  | FF-1, FF-8    | AR, FF-5, FF-6, the Maps tab                |

- `auth` is encrypted at rest, as is the Maps key `fof_api_key`. A value that cannot be decrypted reads as absent, and the app asks for the credential again (`src/main/settings-store.js:4-33`); the settings spec owns the details. Test: "are the only fields touched".
- The same file holds other features' fields: `language`, `fof_api_key`, `maps_prime_only`.
- Not stored: friends' statuses, names and avatars, the account's profile, the turned-down marks, join states. Both lists are drawn from Steam's answers in every run.
- 1.0 is to import settings, key, friends and pool from 0.9 (`v1-rewrite-plan.md`, 2026-11-07): take `steam_id`, `auth`, `friends_ids` and `fake_friend_ids` as they are.

## 8. Loading the friends list

The user clicks "Load friends" in the panel or the refresh icon in the bar; both run the same load (`src/core/app.js:75-79`, `src/ui/account-view.js:74-77`).

In this order (`src/core/app-friends-manager.js:232-351`):

- **LD-1** Account to load: the fields' SteamID and credential; a field that is empty falls back to the saved value. The credential is extracted (CR-1).
- **LD-2** Either still missing: error `errors.pleaseEnterSteamIdAndApiKey`; stop.
- **LD-3** Either invalid: one error that joins `validation.validSteamIdRequired` and `validation.validAuthRequired` with ". "; stop. Tests: `validators.test.js` "passes with a SteamID and a credential", "lists every missing field".
- **LD-4** Same account means the saved `steam_id` and `auth` equal the ones to load. When settings exist and it is not the same account, the saved friends list is marked not in use, so background rounds pause until a load succeeds (AR-4).
- **LD-5** While loading, Load is disabled and reads `index.updateFriendsButtonUpdating`, and the bar's refresh icon spins (`css/unified-buttons.css:165-167`).
- **LD-6** Ask Steam for the friends list (CR-4) and keep confirmed friends only: token entries with `efriendrelationship` 3, key entries with `relationship` "friend" (`src/steam/steam-api-utils.js:59-92`). Pending and blocked friends have not been listed since 0.3.1.
  - On success: hide the notification; enable Load again; the result becomes the friends list in use; ask Steam for the presence of friends and fake friends; save `{steam_id, auth, friends_ids}` and take the merged settings as the saved account; if it is not the same account, end all running joins; build the list keeping friends whose join runs (FL-3); draw both tabs; close the panel (AP-2); validate; start the auto-refresh unless the tutorial runs (AR-1).
  - On failure of the list request: show the error (LD-7, section 16), enable Load, stop. The friends list, the running auto-refresh and running joins stay as they were.
- **LD-7 Errors of the list request** (`src/steam/steam-api-utils.js:16-37`, `src/steam/http-client.js:31-47`). Tests: `steam-friends-list-errors.test.js` "with %s, Steam's %i reads as %s", "a friends list Steam cannot be reached for is a network error".

| Steam's answer                      | With a key                                         | With a token                             |
| ----------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| 401                                 | `PRIVATE_FRIENDS_LIST`: the privacy warning (NT-6) | `TOKEN_REJECTED`: `errors.tokenRejected` |
| 403                                 | `KEY_REJECTED`: `errors.keyRejected`               | `TOKEN_REJECTED`                         |
| 429                                 | `RATE_LIMITED`: `errors.rateLimited`               | same                                     |
| 5xx                                 | `STEAM_UNAVAILABLE`: `errors.steamUnavailable`     | same                                     |
| any other HTTP error                | `STEAM_ERROR`: `errors.steamError` with `{status}` | same                                     |
| no connection, or no answer in 10 s | `NETWORK_ERROR`: `errors.noConnection`             | same                                     |
| answered, no confirmed friend       | `EMPTY_FRIENDS_LIST`: `errors.noFriendsFound`      | same                                     |
| anything else                       | `errors.unexpected` with the error's own message   | same                                     |

- Why 401 differs: a key meets a private list with 401, while a token reads its owner's own list, so a 401 there is Steam turning the token down; Steam answers a made-up token the same way (**measured** 2026-11-03, `src/steam/steam-api-utils.js:10-15`).
- **LD-8 Running joins across a reload.** A reload of the same account keeps running join attempts and their rows; another account or another credential ends them, since each attempt goes on with the ones it started with. Tests: `friends-reload-joins.test.js` "a reload of the same account keeps the running join and its row", "a reload for another account ends the running joins", "a reload with another credential ends the running joins".
  - Why: commit `dbf1c6b` (2026-11-04). **Measured** that night: a reload ended two attempts that were waiting for a slot on a friend's full server, and each new attempt resent the refused token at once.
- **LD-9** The friends list changes only by a load: new Steam friends appear after the user reloads. With a key and a private list a reload fails with the privacy warning and the old list stays; the help tells key users to make the list public for a load and private again afterwards (`help.apiKey.option2Bullet2`, `help.apiKey.option2Bullet3`, `notifications.privacy.note`).

## 9. Startup

Sequence (`src/core/app.js:146-375`):

1. Read the settings, apply the saved `language`.
2. Disable Load.
3. Wire the fields, buttons and both lists.
4. Point joins, GSI and the Maps tab at the account in use.
5. Read the settings again; they become the saved account.
6. No settings at all: first run, the tutorial starts by itself (tutorial spec).
7. Fill the SteamID and token fields from the saved account, without a change event (so TF-3 does not run), and take `friends_ids` as the friends list in use.
8. Validate (section 4), which updates the account view and offers the startup refresh.

- **ST-1** Neither list is drawn from storage. Both tabs stay empty until the first round answers.
- **ST-2 Startup refresh**, at most once per run, decided at each validation until it has started (`src/core/app-friends-manager.js:58-99`), in this order: not while the tutorial runs; not once it has started; only with a complete saved account, a token (VA-2) that has not expired, and a friends list that is not empty. Then, 500 ms later (`AUTO_REFRESH_START_MS`, no reason recorded), it counts as started and the auto-refresh starts (AR-1). Tests: `startup-auto-refresh.test.js` "starts once per run, however often the inputs are validated", "does not start with an expired token", "starts with a token that is still good", "does not start while the tutorial is active", "does not start without saved friends", "does not start on a first run, with nothing saved".
- **ST-3 The daily flow** these rules produce, which must survive:
  1. The app opens with yesterday's token expired: the panel is forced open, the field is yellow, Load is disabled, nothing polls.
  2. "Open in Steam" opens the token page in the Steam client and leaves the keyboard in the field (TF-2).
  3. Ctrl+A and Ctrl+C on Steam's page; back in the app, Ctrl+V.
  4. The paste replaces the old token (TF-1), running joins end, the SteamID is filled in, and validation passes.
  5. The panel closes by itself, the list starts 500 ms later with the new token, and the token is saved (SV-2). No click on Load is needed.

## 10. Auto-refresh of the friends

States: stopped (no timer) and running (a 3 s timer), plus a flag for a round still out.

- **AR-1 Start** (`src/core/app-friends-manager.js:356-410`). Refused while the tutorial runs. The ids to ask about are the friends list plus the fake friends; none means no start. A start fetches once at once with the current credential, outside the checks of AR-4, then replaces any running timer with a new 3 s one and clears the round-out flag ("a round of the old one that never ends must not hold up the new one"). Starts come from: the startup (ST-2), a successful load (LD-6), adding a fake friend (FF-1), and the end of the tutorial, 500 ms later, when a friends list and settings exist (`src/core/app-friends-manager.js:493-508`).
- **AR-2 Stop**: only when the tutorial starts (`src/core/app.js:55-59`). Otherwise it runs while the app is open.
- **AR-3** A round comes every 3 s, and once at once when the window returns from a minimize (AR-7).
- **AR-4 Checks before a round**, in order (`src/core/app-friends-manager.js:417-453`): the tutorial runs, skip; the window is minimized, skip; the previous round is still out, skip; the credential in the field is turned down (section 6), skip; the friends list is in use (LD-4) and there are ids, ask; otherwise nothing.
- **AR-5 What a round asks** (`src/core/app-friends-manager.js:108-158`): the presence of every friend and fake friend and the user's own presence, in one batch (10 ms window, chunks of 100 ids; `src/steam/steam-api-client.js:174-357`); then names and avatars for players in casual whose avatar this run has not fetched yet, as avatars are kept for the run (`src/steam/steam-api-response-processor.js:414-459`). A failed avatar fetch keeps the statuses. Then both tabs are drawn (sections 12 to 15).
  - The credential is the field's at the moment of the round (`src/core/app-friends-manager.js:455-463`). Why: a token pasted later must replace the old one, which expires after a day. Test: `app-friends-refresh.test.js` "asks with the credential entered at the time of each round".
- **AR-6** A failed round is logged and shows no notification (`src/core/app-friends-manager.js:446-448`). Ids Steam did not answer are left out of the answer, and the round draws as if those players were not in CS2 (see Smells).
- **AR-7 Paused while minimized.** No round goes out while the window is minimized. The moment it is restored, one round goes out at once if the auto-refresh runs, then every 3 s as before; a restore while it is stopped asks nothing. A window that is only covered, by CS2 for one, or only unfocused keeps refreshing: it may be watched on a second screen. Tests: `app-friends-refresh.test.js` "no round goes out, and the list catches up the moment the window is back", "a restore while the auto-refresh is stopped asks nothing".
  - The app must learn of minimize and restore from the window system. Now: the main process sends each minimize and restore to the page and answers a question about the current state, asked once when the page starts following, for a page reloaded while minimized; a report heard first wins over that older answer (`src/main/main.js:168-182`, `src/main/preload.cjs:11-35`, `src/core/window-state.js:20-47`). Following begins with the first auto-refresh start (`src/core/app-friends-manager.js:465-480`). Tests: `window-minimized-bridge.test.js`.
  - Why: commit `c455162` (2026-11-07, 0.9.7 "Fewer requests to Steam"): nobody sees the list in a minimized window, and a running join asks Steam about its target itself.
  - Why the window system: the page cannot see a minimize. With background throttling off, Electron keeps the page's visibility "visible" when minimized (`src/core/window-state.js:4-11`; commit `bea74c9`, 2026-11-06). Throttling must stay off for the join loop: **measured** 2026-11-03, a covered window counts as hidden and its 200 ms pauses took 1000 ms, and after 5 minutes hidden it woke about once a minute (`src/main/main.js:106-109`). The join spec owns that; this rule must not rely on page visibility.
- **AR-8 No pile-up.** A round still out makes the next ticks skip until it ends (test: "a slow round is not overlapped by the next ones"). A stuck request ends after 10 s and counts as failed (`src/steam/http-client.js:10-17`).
- **AR-9 Tutorial.** Rounds skip and starts are refused while it runs; the refresh stops when it starts and restarts 500 ms after it ends, if a friends list exists. Tests: `startup-auto-refresh.test.js` "the refresh stops with the tutorial and resumes after its wait", "nothing resumes without saved friends".

Request budget, derived from the rules rather than measured: a round costs ceil((friends + fake friends + 1) / 100) presence requests, plus name and avatar requests for players newly seen in casual. A day of uptime has 28,800 rounds, so from 301 ids (four requests a round) the friends refresh alone passes the key's 100,000 calls a day. The Maps tab adds its own. The 3 s interval has no recorded reason; on 2026-10-30 the user postponed cutting API usage, and on 2026-11-07 decided the pause while minimized.

## 11. The user's own location

Feeds "вы вместе" (RW-7).

- **UL-1** Each round also asks for the user's own presence, in the same request; a failed answer makes the user's Steam presence unknown (`src/core/app-friends-manager.js:160-180`). Test: `app-friends-refresh.test.js` "asks where the user is in the same round, to spot friends beside them".
- **UL-2** The user's server: none while CS2 reports, through fresh GSI, that the user is not in a match, whatever Steam still shows; otherwise the server Steam shows while it shows the user in CS2 (`src/game/user-location.js:44-52`). Why: Steam's copy lags; it keeps showing a server after the user leaves it (`src/game/user-location.js:14-20`).
- **UL-3** A player's server comes from rich presence `game_server_steam_id`, else from the account's private `game_server_steam_id`. **Measured** 2026-11-03: rich presence seldom carries it (`src/steam/steam-api-response-processor.js:507-509`).
- **UL-4** This is the only feed of the user's Steam presence, and other features read it (see Smells).

## 12. The Friends tab

The user sees the "Friends" tab with a count, a nickname filter beside the tabs, the rows, or an empty message.

- **FL-1 Who is listed:** friends in casual, plus friends whose join attempt runs (FL-3), without fake friends, which have a tab of their own (FF-6). While the tutorial runs, its made-up friend leads the list (`src/ui/friends-renderer.js:64-78`).
  - Not listed: friends in CS2 in another mode, in the menu or in a lobby, and friends outside CS2.
  - History: 0.4.0 listed deathmatch too; casual only since commit `8d028f6` (2026-10-25: "Casual only from here on - deathmatch is no longer supported"). The CHANGELOG entry is outdated; the code wins.
- **FL-2 Order:** by name, ignoring case and accents (`src/ui/friends-renderer.js:24-27`).
- **FL-3 Kept while a join runs.** A friend whose attempt is running (waiting, connecting or missing, and not cancelled) stays listed after leaving casual, so the row and its Cancel stay while the loop can still join. Map and server attempts are not friends and are left out. The entry is Steam's fresh presence when Steam still shows the friend in CS2; otherwise the last listed entry, or a placeholder named after the attempt or by the SteamID, always marked not in casual and not joinable. The previous list is read before it is replaced (`src/core/app-friends-manager.js:193-227`, `src/ui/fake-friends-manager.js:41-78`). Tests: `fake-friends-manager.test.js` "keeps an entry that left casual, marked not in casual", "fresh status wins over the kept entry", "does not duplicate supported friends or fake IDs", "applies the keep list when there are no fake IDs", "without a keep list returns only friends in casual", "leaves out map and server attempts", "returns previous entries or placeholders for active joins only", "placeholder keeps the Steam ID as name when none is known", "refresh keeps a friend who left casual while the join is running".
- **FL-4 Filter:** a trimmed, case-insensitive substring of the name. It narrows the rows, not the count. Typing redraws from the last list with the current join states (`src/ui/friends-view.js:21-34`, `src/ui/friends-renderer.js:80-89`).
- **FL-5 Count:** listed entries before the filter; blank for none (`src/ui/view-tabs.js:63-65`).
- **FL-6 Empty message** `views.friendsEmpty` ("None of your friends is in casual right now. Try the Maps tab.") shows only when nothing is listed and a friends list is loaded; before a load an empty list says nothing (`src/ui/friends-renderer.js:98-105`). Test: `friend-rows.test.js` "tabs count their rows; with no friend in casual the empty message shows".
- **FL-7** A language switch redraws both lists in the new language (`src/core/app.js:255-264`).

## 13. Friend rows

A row holds the avatar, the name, a game line (where the friend plays, then a status label) and the join button; fake friends' rows add a remove button (`src/ui/friend-row-template.js:25-50`).

Content:

- **RW-1 Avatar:** Steam's full-size avatar, else the small or medium one; a placeholder shows a drawn silhouette (`src/ui/friends-renderer.js:198-199`, `src/ui/fake-friends-manager.js:7-11`). Pictures load only from the app itself, `data:` and Steam's avatar hosts (`*.steamstatic.com`, `steamcdn-a.akamaihd.net`) (`index.html:6-16`).
- **RW-2 Name:** the Steam persona name; a placeholder shows its SteamID64.
- **RW-3 Where:** in casual with a map, the map's display name ("de_dust2" reads "Dust II"; an unknown code loses its prefix and gains a capital) and the score without brackets ("[ 3 : 1 ]" reads "3 : 1"); otherwise Steam's rich presence status text as Steam gives it, or `join.notInCS2` when there is none (`src/ui/friends-renderer.js:183-194`, `src/ui/join-status.js:22-25`, `src/shared/map-labels.js:26-32`). Tests: `friend-rows.test.js` "a row shows the map, the score, whether a slot is free and the fitting button", "someone out of casual shows where they are, with no slot label".
- **RW-4 Text only.** Every value from Steam (names, statuses, maps, scores, avatar URLs, ids) is shown as text, never parsed as markup: names, statuses and scores come from other Steam users (`src/utils/dom-utils.js:40-59`). Tests: `html-escaping.test.js` "renders a hostile name, label and avatar as text", "keeps the id inside the attributes that name the row", "adds the remove button only for manually added IDs", "escapes where a friend plays, whatever Steam says".

Slot facts of a friend row (`src/ui/friends-renderer.js:170-181`):

- free: the friend is joinable (Terms);
- casual: the friend is in casual;
- here: in casual, the user's server is known (UL-2) and equals the friend's server;
- over: never set for friends (map rows use it);
- note: `join.together` when here, nothing otherwise.

Label and button (`src/ui/join-status.js:80-129`). A running or just-finished join decides first:

| Join status / slot               | Label                                         | Button                                |
| -------------------------------- | --------------------------------------------- | ------------------------------------- |
| connecting                       | `join.connecting`                             | Cancel (`common.cancel`)              |
| waiting                          | `join.waitingForSlot`                         | Cancel                                |
| missing                          | `join.missing`                                | Cancel                                |
| joined                           | `join.joined` with a drawn check              | the idle button below, disabled       |
| none or cancelled, not in casual | hidden                                        | Join (`common.join`)                  |
| none, here                       | `join.together` ("вы вместе")                 | Join, disabled                        |
| none, free                       | `join.freeSlot` (hidden in friend rows, RW-6) | Join                                  |
| none, in casual, not free        | `join.noSlot` (hidden in friend rows)         | `join.waitButton` ("Wait for a slot") |

- **RW-5 Status between refreshes.** A row keeps its slot facts on its label and button, so a join status change, and the end of an attempt, redraws the row from them without waiting for a round; after an attempt the row shows its slot again (`src/ui/status-manager.js:17-40`, `src/ui/join-status.js:40-71`). Tests: `friend-rows.test.js` "a status update shows the join, then falls back to the row's slot", "after an attempt the row goes back to showing the user beside the friend".
- **RW-6 Look.** Friend rows do not show the words for a free or a full slot: the avatar frame and the game line in Steam's in-game green say a slot is free, and the Wait button says the server is full; a note of its own, such as "вы вместе", stays (`css/status.css:54-58`). The avatar frame is green when free or joined, Steam's online blue while joining or when here, purple when missing (`css/friends.css:43-57`). Since commit `4d45e9c` (2026-11-03, the Steam look).
- **RW-7 "вы вместе": show but block.** A friend on the user's own server is listed, labelled `join.together`, and cannot be joined; once the user leaves that server the friend is joinable again. The row follows the user's location at its next redraw (a round, the filter, a language switch). **Decision** 2026-11-03: show but block, not hide (`casual-map-finder-research.md`; commit `0d1bdd3`). Tests: `friend-rows.test.js` "is shown together with the user and cannot be joined", "can be joined again once the user leaves the server".
- **RW-8 Updated in place.** Rows are matched by SteamID: rows of entries no longer listed go, new ones are created, the order follows the list, and only changed parts are touched. A refresh never touches the remove button, so a removal waiting for its second click survives it (`src/ui/friends-renderer.js:117-160`, `220-265`). Test: `friend-rows.test.js` "a refresh updates a row in place, keeping a remove waiting for its second click".
- **RW-9 What "free" means.** Free is Steam showing the friend's `connect` link, the signal behind Steam's own Join Game. It lags the server: **measured** 2026-11-04, a link stayed at least 68 s on a full server through four refusals; on 2026-11-06 the labels were found right apart from that lag. The join spec owns how links are followed.

## 14. Join and Cancel on a row

- **JC-1** One click handler per list (Friends, Fake Friends) serves every row, whatever drew it; redraws add no handlers (`src/ui/friends-view.js:43-87`). Test: `friends-view-clicks.test.js` "one listener serves the rows however many refreshes render them".
- **JC-2** The button of a row whose attempt runs (Cancel) cancels that attempt and starts nothing. Otherwise (Join, Wait for a slot) it first lets go of any kept map, then starts a join for that SteamID (`src/ui/friends-view.js:79-85`, `src/ui/fake-friends-view.js:87-96`). Tests: "Join on a row lets go of the kept map, then starts the join", "Cancel on a row cancels its attempt and starts nothing", "the Fake Friends tab joins and cancels the same way".
- **JC-3 Tutorial.** On the tutorial's join step a click in the Friends tab moves the tutorial on and joins nothing; on its friends-list, connection and done steps a click does nothing (`src/ui/friends-view.js:54-77`). Tests: "on the tutorial's join step a click moves it on and joins nothing", "on tutorial step index %i a click does nothing".
- What a started join does belongs to the join spec.

## 15. Fake friends

Purpose: follow and join a SteamID that is not on the user's Steam friends list, a stranger seen on an official casual server for one. **Measured** 2026-10-25: the user added two strangers on official Dust II casual by SteamID, and Join got them into that match; the game coordinator lets a non-friend join through `+gcconnect` (`casual-map-finder-research.md`).

History: commit `9125852` (2026-09-07) tracked manual IDs beside the friends as "virtual friends" (`virtual_friend_ids`); commit `8d028f6` (2026-10-25) renamed them, gave them their own tab and the two-click remove, without moving stored IDs. No release before 0.9.x had either; 0.9.0 lists "Fake friends" as added.

The user sees the "Fake Friends" tab (after Maps) with a count, an add box (input, Add button, an inline error), rows like friend rows with a remove button, or `views.fakeFriendsEmpty` (`index.html:211-242`).

- **FF-1 Add** (`src/ui/fake-friends-view.js:178-217`), in order: the tutorial runs, nothing; trim; not 17 digits, inline error `friends.invalidSteamId`; equal to the user's own SteamID (the field's, else the saved one), `friends.alreadyInList`; already tracked, as stored on disk, `friends.alreadyInList`; the save fails, an error notification; success clears the error and the input, shows the info notification `friends.fakeFriendAdded`, and starts the auto-refresh at once (AR-1), so the new ID's status shows.
- **FF-2** The inline error sits under the input and turns it red; the next input clears it (`src/ui/fake-friends-view.js:55-57`, `168-172`).
- **FF-3 Stored** as `fake_friend_ids`. Each change starts from the list stored on disk and writes that field alone; a failed write is an error, never a silent success (`src/ui/fake-friends-manager.js:116-161`). Stored entries that are not 17 digits are ignored when read (`src/ui/fake-friends-manager.js:24-28`). Tests: `fake-friends-manager.test.js` "sends only the changed list and keeps the merged settings", "reports an ID that was not tracked", "a failed save is an error, not a silent success", "appends the ID to what is stored", "does not add an ID twice".
- **FF-4 Polled with the friends.** Every round asks about the friends list plus the fake friends, without duplicates (`src/ui/fake-friends-manager.js:30-39`). The Maps tab gets them too (`src/core/app.js:239-242`).
- **FF-5 Always listed, joinable out of casual.** A fake friend Steam shows no CS2 presence for appears as a placeholder: its SteamID as name, the silhouette, "Not in CS2", not in casual, not joinable (`src/ui/fake-friends-manager.js:96-114`). Rows use the slot facts, labels and buttons of section 13, so Join stays enabled while the fake friend is outside casual; the join loop then waits (join spec).
- **FF-6 Own tab only.** A tracked ID shows in the Fake Friends tab alone, even when it is also a Steam friend (`src/ui/fake-friends-manager.js:80-94`). Test: `fake-friends-manager.test.js` "puts manually tracked IDs in their own list".
- **FF-7** Rows are ordered by name; the tab counts its rows; `views.fakeFriendsEmpty` shows when there are none (`src/ui/friends-renderer.js:44-57`). This tab has no filter.
- **FF-8 Remove takes two clicks** (`src/ui/fake-friends-view.js:63-161`). The first click on the cross turns the button into `friends.confirmRemove` ("Remove?") for 3 s; a second click within that time removes; after 3 s the cross returns and a later click asks again. A removal: the tutorial runs, nothing; remove from storage (from the list on disk); not tracked, nothing; a failure, an error notification; then cancel the ID's running join, since an attempt for an ID no longer listed would be invisible, and drop its row and its entry at once, before the next round. Tests: `fake-friend-remove.test.js` "the first click only asks for confirmation", "a second click removes the ID and cancels its join", "the confirmation lapses, and a later click asks again".
  - Why: the cross looks like a close button, and a removal cannot be undone (`src/ui/fake-friends-view.js:74-75`); built with the tab on 2026-10-25 (`8d028f6`).

Texts: `views.fakeFriends`, `views.fakeFriendsEmpty`, `friends.addFakeFriend`, `friends.fakeFriendSteamIdPlaceholder`, `friends.addButton`, `friends.invalidSteamId`, `friends.alreadyInList`, `friends.fakeFriendAdded`, `friends.removeFakeFriend` (the remove button's tooltip), `friends.confirmRemove`.

## 16. The account panel and the account bar

One of the two shows above the join bar and the tabs (`index.html:77-165`). Since commit `15ef378` (2026-10-25), which replaced a credentials block that took a third of the window on every tab.

States, recomputed at each validation:

- setup: the panel, with no Close, whenever the app cannot work yet;
- working: the bar, its status ok, warn, expired (section 5) or turned down (section 6);
- editing: the panel with Close, entered from working.

Rules:

- **AP-1 When the panel is forced.** No facts yet, no valid credential, no valid SteamID, an expired token at validation, or no friends list loaded (`src/ui/account-view.js:95-108`). Otherwise the bar shows, and the panel opens only for editing: the Account button, a click on a warn, expired or turned-down status, or the tutorial's start (`src/ui/tutorial/tutorial-manager.js:54-56`). Close, the tutorial's end, or a successful load leave editing (`src/ui/account-view.js:110-138`). Tests: `account-view.test.js` "%s keeps the panel open with no way to close it" (no valid token or key, no SteamID, an expired token, no friends loaded yet), "editing a working account opens the panel; closing brings the bar back".
- **AP-2** A successful load closes the panel (`src/core/app-friends-manager.js:326-327`).
- **AP-3 Panel content:** title `account.panelTitle` and `account.panelIntro`; step 1 `account.step1` with the Open in Steam button and `account.step1Hint`; step 2, the token field (section 2); step 3, the SteamID (section 3); at the foot the `account.help` link, which opens the token and key help, and Load (`index.updateFriendsButton`, tooltip `index.updateFriendsButtonTitle`). Open in Steam is `steam://openurl/https://store.steampowered.com/pointssummary/ajaxgetasyncconfig`: Steam's client shows the token as JSON, already signed in.
- **AP-4 Bar content:** avatar, name, status line, the refresh icon (`account.refreshTitle`) and the Account button (`account.edit`).
- **AP-5 Name:** the Steam persona name once known, the SteamID64 until then.
- **AP-6 Avatar:** Steam's medium avatar, sharp enough at that size; until it is known, or when it fails to load, the first letter of the name in capitals, "?" without a name (`src/ui/account-view.js:156-182`). Test: "the avatar shows the first letter until Steam names a picture, and if it fails to load".
- **AP-7 Status line:** the texts of sections 5 and 6 after a drawn dot, green for ok, yellow for warn, red for expired and turned down, no dot without text. A click opens the panel only when the state is not ok (`src/ui/account-view.js:67-69`, `css/account.css:57-93`).
- **AP-8 Profile:** asked once per SteamID per run, only with a valid SteamID, a valid credential and an unexpired token, never while a request for it is out; a failed or empty answer is asked again at the next validation (`src/ui/account-view.js:249-281`). Test: "the Steam profile is asked for once per account, and not without one".
- **AP-9 Style.** Modelled on Steam's own dialogs, colours from Steam's CSS, one fixed size for long buttons and one for square ones, Steam's font stack, no emoji (**Decision** 2026-11-03 to 11-06, `steam-ui-style.md`). Signs the app's fonts lack are drawn: the status dot is a drawn circle and the done step a check icon (font audit of 2026-11-07, commit `d421caf`, 0.9.6). Help cards are flat cards like the panel.

## 17. Notifications: errors, privacy warning, help

One notification area sits above the account panel; a new notification replaces the one shown (`src/ui/notification-manager.js:26-45`).

- **NT-1** Each notification has the app's square close button (`notifications.closeButtonTitle`), which hides it. Test: `notification-help.test.js` "the close button is the app's square button and hides the help".
- **NT-2** Errors are told by their code in the current language. An error without a known code shows `errors.unexpected` with its own message, for a bug report. Text already written for the user shows as it is (`src/utils/error-handler.js:10-53`). Tests: `notification-error-text.test.js` "a turned-down token reads in Russian, not as Steam's technical answer", "a text written for the user is shown as it is".
- **NT-3** A language switch redraws the error, privacy warning or help card shown, in the new language (`src/ui/notification-manager.js:124-194`). Tests: "a language switch tells the shown error again", `notification-help.test.js` "a language switch re-renders the help that is open".
- **NT-4** The notification is hidden when a friends list request succeeds and when a profile link resolves (`src/core/app-friends-manager.js:279`, `src/core/app-input-manager.js:109`); otherwise it stays until closed or replaced.
- **NT-5** Background rounds never notify (AR-6). There, the bar's status line is the only sign of a turned-down credential.
- **NT-6 Privacy warning** (`src/ui/notification-manager.js:66-87`, `src/ui/notification-templates.js:59-72`). Shown when the friends list call reports a private list (key and 401), and today also for any error whose message mentions "private" (see Smells). Content: `notifications.privacy.warningMain`; a link `notifications.privacy.linkText` (tooltip `notifications.privacy.linkTitle`) to `steam://openurl/https://steamcommunity.com/profiles/<SteamID64>/edit/settings/`; then `notifications.privacy.note`. The SteamID is the one the load used, else the field's; the link appears only for a valid SteamID64. Tests: `notification-privacy-link.test.js` "links to the privacy settings of a SteamID64", "reads the id from the input when none is given", "makes no link out of anything but a SteamID64"; `notification-error-text.test.js` "a private friends list still shows the privacy warning".
- **NT-7 Help cards** (`src/ui/notification-templates.js:132-181`). The SteamID help (`help.steamId.*`) opens from the SteamID64 link and links `steam://url/SteamIDMyProfile`. The token and key help (`help.apiKey.*`) opens from `account.help`: first the token, recommended, with the token page link; then the key, with `steam://openurl/https://steamcommunity.com/dev/apikey`. Both are headed by a title in words with no picture; every link has the app's one link look; no template sets an inline style. Tests: `notification-help.test.js` "the SteamID help opens in the same call, headed by its title alone", "the token help shows the token link, styled as the app's links", "every link in the help texts carries the app's one link look", "no notification sets its own look inline: notifications.css alone does".
- **NT-8 Only the app's own Steam commands open.** `steam://openurl/` only for https pages on `steamcommunity.com` or `steampowered.com`, `steam://url/` only for client pages such as SteamIDMyProfile (`src/main/external-links.js:39-83`). Tests: `main-settings.test.js` "isAllowedExternalUrl" and "isAllowedExternalUrl: steam:// commands".

Texts of this part: `errors.pleaseEnterSteamIdAndApiKey`, `errors.noFriendsFound`, `errors.tokenRejected`, `errors.keyRejected`, `errors.rateLimited`, `errors.steamUnavailable`, `errors.steamError`, `errors.noConnection`, `errors.unexpected`, `validation.validSteamIdRequired`, `validation.validAuthRequired`, `validation.unrecognizedSteamUrl`, `validation.vanityNeedsAuth`, `validation.vanityResolving`, `validation.vanityNotResolved`, `validation.vanityError`, `notifications.closeButtonTitle`, `notifications.privacy.*`, `help.steamId.*`, `help.apiKey.*`.

## Smells and open questions

Behaviour that looks accidental:

1. **Background rounds use the field's credential, valid or not.** While the user types or edits, each round sends the partial or empty text to Steam; the failure empties the list, and a 401/403 marks that partial value turned down (`src/core/app-friends-manager.js:430`, `440-444`, `455-463`). AR-5 meant a freshly pasted token. 1.0 should poll with the last credential that passed the format check, or that Steam answered.
2. **"Steam did not answer" reads as "nobody in casual".** The presence call leaves unanswered ids out, and the friends code builds the list from what is left (`src/steam/steam-api-client.js:668-676`). A failed round empties the Friends tab, shows `views.friendsEmpty`, turns fake friends into placeholders and forgets the user's server. The join loop and the Maps tab tell "could not ask" from "no account"; the friends list does not.
3. **Fake friends lose their name and avatar outside CS2.** Only CS2 players are kept from Steam's answer (`src/steam/steam-api-response-processor.js:125-128`), so a fake friend outside CS2 shows its SteamID and a silhouette, though the answer carried the persona name. Avatars are fetched only for players in casual, and when nobody in the answer is in casual the run's avatar cache is not applied at all (`src/steam/steam-api-response-processor.js:419-420`, `456-458`), so a row in CS2 but out of casual may have an empty picture. This contradicts the module's own promise ("their name, avatar and status come from Steam like everyone else", `src/ui/fake-friends-manager.js:13-18`).
4. **An expired saved token blocks a key.** With no token in the field, VA-2 takes the saved token's expiry (`src/core/app-input-manager.js:228-238`). A user who types a valid key after the saved token expired gets Load disabled, the key drawn yellow as an expired token, and the bar and step 3 describing the old token. Only a fresh token gets them out.
5. **A token for another account closes the panel on the old friends.** `hasFriends` and ST-2 do not compare the token's SteamID with the saved account, so the panel closes (unless editing) and rounds poll the previous account's friends with the new token until the user reloads. SV-3 deliberately does not save that token.
6. **The once-only start is marked late.** ST-2 marks the start when its 500 ms timer fires, not when it is set (`src/core/app-friends-manager.js:85-90`); validations within those 500 ms set more timers and each starts the refresh (two immediate fetches; the timer stays single, as each start replaces it).
7. **A failed first fetch of a start leaves no timer.** `startAutoRefresh` throws before creating the timer (`src/core/app-friends-manager.js:379-409`). Steam failures do not throw (item 2), so only an unexpected exception gets here; then the startup refresh is lost for the run.
8. **A failed load for another account stops the rounds.** LD-4 marks the friends list not in use before asking Steam, and only a successful list request marks it in use again (`src/core/app-friends-manager.js:263-266`, `291-294`). A failed load with a new credential freezes the list until a load succeeds.
9. **A kept friend who left CS2 shows a stale game line.** The kept snapshot keeps its old `status` text and only loses casual and joinable (`src/ui/fake-friends-manager.js:64-75`), so the row shows the last casual status instead of "Not in CS2".
10. **The panel does not open when the token expires mid-session.** EX-3 changes the bar only; the forced panel waits for the next validation. Is that wanted, or should expiry force the panel as at startup?
11. **A loose token check.** Any three dot-separated word runs pass CR-2. One that does not decode has no SteamID, so step 3 says the SteamID is read from the token while its input row stays hidden; with an empty SteamID field the user is stuck in the panel.
12. **No guard against concurrent loads.** The bar's refresh icon stays clickable during a load, and Load is enabled again as soon as the list request returns, before the presence request and the save (`src/core/app-friends-manager.js:283-288`). A load and a round may also overlap; the last to draw wins.
13. **A failed save on load is silent.** A null answer to the settings write is ignored (`src/core/app-friends-manager.js:302-310`), while the fake friends treat the same failure as an error (FF-3).
14. **Privacy by message text.** `isPrivacyError` also matches any error whose message contains "private" (`src/utils/error-handler.js:71-79`); an exception about `private_data` would show the privacy warning.
15. **Stale notification memory.** `hideNotification` keeps the last notification's kind and `showNotification` (the fake-friend-added info) does not set it (`src/ui/notification-manager.js:26-45`, `101-106`). A language switch while that info shows brings back the previous error or help. Errors passed as already-translated strings (LD-2, LD-3, SI-4) keep their old language after a switch.
16. **Fake friend changes are read-modify-write in the UI.** The store applies patches one at a time, but the list is computed before the patch (`src/ui/fake-friends-manager.js:121-161`), so two changes in flight can lose one.
17. **Lists only from rounds.** At startup with an expired token, or before the first answer, the Fake Friends tab says `views.fakeFriendsEmpty` although IDs are stored (ST-1).
18. **The user's own presence pauses with the friends.** UL-1 is its only feed, and the Maps tab reads it ("вы здесь", and a map join skipping the user's server: `src/game/map-finder.js:678`, `689`). While the window is minimized it is frozen, softened only by GSI's menu override (UL-2). The Maps spec should settle who asks for the user's presence.
19. **Small ones.** The expired boundary is `<` in VA-2 and `<=` in EX-2 and SV-2. `validateSteamUrl` takes the first 17 digits after `/profiles/` even if more follow, and keeps any query string in a vanity name (`src/utils/validators.js:150-166`). `restoreAutoRefresh` ignores expiry and turned-down marks and costs one failing request (`src/core/app-friends-manager.js:493-508`). The bar's date format is the same in both languages.

Duplication and dead code:

20. A load re-implements a round (presence, the keep list, the list in state, the draw) without the user's own presence, then AR-1 fetches the same presence again at once, perhaps partly from the 100 ms cache (`src/core/app-friends-manager.js:296-338` against `108-158`).
21. The settings are read twice at startup (`src/core/app.js:156`, `285`).
22. `localStorage.removeItem("hide_privacy_warning")`: nothing has set that key since the first commit (`src/core/app-friends-manager.js:264`).
23. `fetchAndRenderFriendsByIds` with `keepStates` false (draw without join states, notify on error) has no caller (`src/core/app-friends-manager.js:136`, `155`). `hasValidCurrentInputs` is only logged (`src/core/app-friends-manager.js:75`). `validation.vanityError` is unreachable, as `resolveVanityUrl` never throws (`src/steam/steam-api-client.js:707-722`); `validation.urlMustBeString` and `validation.notSteamCommunityUrl` are unreachable from the paste.
24. Unused texts: `friends.temporarilyNotSupported`, `index.apiTokenKeyLabel`, `index.apiTokenKeyTitle`. The `AppSettings` type lacks `fake_friend_ids` (`src/shared/types.js:137-142`).
25. "Does the account work" is decided in several places: VA-2's expiry, the account view's own clock and `needsSetup`, the turned-down marks, ST-2 and `restoreAutoRefresh`. Under the one-answer-per-fact rule (**Decision** 2026-11-07), 1.0 should have one module answer which account is in use and whether it works.
26. `AUTO_REFRESH_START_MS` and `AUTO_REFRESH_RESTORE_MS` are waits without a recorded reason. Under the event-signals rule, 1.0 should start on the event itself (settings loaded and validated; the tutorial ended).

Inconsistent texts:

27. `notifications.privacy.note` tells the user to click "Update Friend List"; no control has that label in English (the panel button reads "Load friends", the icon's tooltip "Update the friends list").
28. `help.apiKey.option2Body2` says clicking the SteamID64 label opens the profile; the click opens the SteamID help instead (SI-5).
29. Adding one's own SteamID says `friends.alreadyInList` ("already in your friends list"), while adding a real Steam friend is accepted and moves the row to the Fake Friends tab (FF-6).
30. The tutorial's connection step names the labels "free slot" and "no free slot", which friend rows hide (RW-6).

Open questions:

31. **A friendless account cannot finish setup.** No confirmed friend is an error (LD-7), and the panel needs a friends list to close (AP-1), although fake friends and the Maps tab would work. Fake friends are also polled only while a friends list is in use (AR-4), apart from the fetch right after an add.
32. **Request rate.** Keep 3 s for 1.0? No reason is recorded, and with a key a large list passes Steam's daily limit from the friends refresh alone (section 10).
33. **Finished matches.** Friend rows never mark a match as over, though map rows block finished matches since 2026-11-03 (`CASUAL_ROUNDS_TO_WIN`). Should a friend at gameover be joinable?
34. **The tutorial and the Fake Friends tab.** Only the Friends tab guards Join clicks during the tutorial; on steps other than the four of JC-3 a click on the made-up friend's Join falls through to a real join. Whether the tutorial's overlay blocks such clicks was not checked.
35. **Old manual IDs.** The note on the 2026-11-07 cleanup of the user's own data names a `virtual_friend_ids` list; no code reads it since `8d028f6`. Should the 1.0 import merge it into the fake friends? Not checked: this document's rules forbid opening the user's data.
36. **The token's names and avatars.** With a token they come from `ISteamUserOAuth/GetUserSummaries`, an old interface; `GetPlayerSummaries` answered the token with HTTP 400 (2026-11-04). Its future was not checked.
37. **First run detection.** A first run is "no settings file". A language switch on a first run writes a file holding only `language`, so the next start skips the tutorial; a broken file reads as none and starts it again (`src/core/app.js:305-314`). The tutorial spec should settle this.
