# Refactoring plan

Written against `master` at `d31a083` (2026-11-03): 38 suites, 514 tests
passing, `npm run lint` clean. Three bug-fix reviews are running in parallel;
carry this plan out after their fixes land, and re-read the steps that touch
`join-manager.js`, `steam-api-client.js`, `map-finder.js` and
`notification-manager.js` against what they changed - those are the files
that change most (git history, last 60 commits).

Ground rules every step keeps:

- The join logic stays event driven. No step adds a wait; two steps remove or
  name waits that are not events.
- No step adds setup for the player. A token or an API key stays all that is
  needed.
- Statements below about how CS2 or Steam behave are taken from the code's own
  comments and the join journal replays. None of them are verified here, and
  no step relies on one being right.
- Comment density and style of the surrounding code are kept: terse
  explanations of why, not what.
- Each step is one commit, `npm test` and `npm run lint` green after it.
  A step that fails a live check is reverted on its own; none of them depends
  on a later one.

The second half of this document is the ordered list. The first half is what
it is based on.

---

## Part 1. How the code is laid out

### 1.1 Processes and folders

`src/main/` is the Electron main process and `src/main/preload.cjs` the
bridge. Everything else under `src/` is the renderer, with `src/shared/`
imported by both. The tree does not show this boundary (`core`, `game`,
`steam`, `ui`, `utils`, `i18n` sit beside `main`), but the imports respect
it: no renderer module imports `main/`, and `main/` imports only `shared/`.

Renderer dependencies, by folder:

```
core  -> game, steam, ui, utils, i18n, shared        (wiring; the friends feature)
ui    -> game, steam, core/app-state-manager, utils  (views)
       ui/tutorial -> core/app-friends-manager        (a cycle, see 1.3)
game  -> steam, utils, shared                        (no ui, no core - except one DOM read)
steam -> utils, shared                               (utils/validators pulls in i18n)
utils -> shared, i18n
```

`game/` and `steam/` never import `core/` or `ui/`. That is the rule worth
writing down and keeping; the two violations of its spirit are
`join-manager.js` reading the `#steam-id` and `#auth` inputs through
`DOMUtils`, and `cs2-manager.js` holding `appInputManager`.

### 1.2 Module map: what each module does, and where it mixes

Sizes are lines; coverage is statement coverage from `jest --coverage`.

**`src/main/` (1,274 lines, 90% covered).** Clean. `gsi-service.js`,
`settings-store.js` take their dependencies in the constructor;
`gsi-server.js`, `gsi-config.js`, `cs2-locator.js`, `external-links.js`,
`permissions.js`, `join-journal-file.js`, `map-finder-store.js` are function
modules with tests. `main.js` groups its code in three classes of static
methods (`WindowManager`, `IPCManager`, `AppManager`) and a fourth logger
format (`MainLogger`). Nothing here needs restructuring.

**`src/core/` (1,493 lines, 25% covered)** - the renderer's startup and the
friends feature, mixed:

| Module | Does | Mixes in |
|---|---|---|
| `app.js` (275) | Composition root: wires singletons, runs an 11-step `initialize()` | Restoring the input fields, deciding the first run, showing the version, loading `settings.json` twice (step 1 for the language, step 8 for everything) |
| `app-state-manager.js` (69) | String-keyed state bag: `friendsData`, `savedSettings`, `savedFriendsIds`, `usingSavedFriends`, `initialLoadAttempted` | A timer id (`friendsRefreshInterval`), a copied constant (`autoRefreshIntervalMs`), and `showTutorialMockFriend` set ad hoc by the tutorial |
| `app-input-manager.js` (281) | The credential fields: read, validate, fill the SteamID from a token, save a fresh token | Painting `valid-input`/`invalid-input`/`expired-token-input` classes, computing `AccountFacts` for `AccountView`, starting auto-refresh through the validation manager |
| `app-friends-manager.js` (402) | Load the friends list, poll statuses, keep the user's presence, render, auto-refresh | Painting the load button, persisting settings, re-attaching the row click listener on every refresh |
| `app-event-manager.js` (373) | DOM listeners for the window bar, inputs, help links, the filter | The whole add/remove flow for manually added IDs (150 lines), tutorial step gating of row clicks with literal step numbers |
| `app-validation-manager.js` (93) | Decides once, 500 ms after startup, whether auto-refresh starts | Validates nothing; the name is wrong |

**`src/game/` (2,841 lines, 93% covered)** - the domain:

| Module | Does | Mixes in |
|---|---|---|
| `join-manager.js` (801) | The join loop and attempt states; target resolution for a friend, a map, a server, the pinned maps | Reads the credential inputs from the DOM; a 1 s `setInterval` that repaints the row; opens `steam://` URLs with a `window.open` fallback; 13 `console.log` calls beside `ErrorHandler.logError` and the journal |
| `cs2-manager.js` (349) | Is the user in CS2, in the lobby (CS2's state first, Steam second); launch CS2 and wait for the lobby | Two near-identical 45-line check methods; holds `appInputManager` and an `isInitialized` flag; a literal 3 s poll |
| `map-finder.js` (929) | Pure server helpers (`buildServers`, `compareServers`); the player sources (pool, seeds, friends of friends, friends of pool players) and their store; the polling scheduler; two crawlers; queries for views and joins; seeding from CS2; status counters | `MAP_LABELS`/`mapLabel`, a UI concern imported by three views; a literal 2 s save debounce |
| `gsi-manager.js` (261), `join-journal.js` (148), `map-keeper.js` (214), `user-location.js` (139) | As named | Nothing to note |

**`src/steam/` (2,091 lines, 73% covered)** - the Web API:

| Module | Does | Mixes in |
|---|---|---|
| `steam-api.js` (94) | Pass-through facade over `SteamAPIClient` | - |
| `steam-api-client.js` (692) | Requests; micro-batching, in-flight sharing and a short cache for `GetPlayerLinkDetails`; credential acceptance | Module state in static fields (1.5); a second chunking loop in `getPlayerSummaries`; an `avatarsCache` parameter no caller passes |
| `steam-api-response-processor.js` (558) | Raw account to facts | Three parsers of one account (`processJoinInfoResponse`, `_mapAccountsToFriends`, `processPlayerCS2StatusResponse`) plus `createPlayerDebugInfo`; about 40% of the file is logging breakdowns |
| `steam-api-utils.js` (392) | Rich presence parsing and the join rules (`isInSupportedMode`, `isInProtectedMatch`, `isOfficialServer`, `isMatchOver`, `richPresenceKey`...) | HTTP error policy (`handleHttpResponse`, `METHOD_ERROR_HANDLERS`), friends-list extraction, avatar helpers, URL masking, debug info |
| `api-config.js` (113), `api-logger.js` (94), `credential-state.js` (86), `http-client.js` (62) | As named | `api-config` imports `Validators`, which imports i18n; `api-logger` logs every request at `info` |

**`src/ui/` (2,751 lines outside the tutorial, 60% covered; `ui/tutorial/` 1,534 lines, 0%)**:

| Module | Does | Mixes in |
|---|---|---|
| `ui-manager.js` (121) | Pass-through facade over `StatusManager`, `FriendsRenderer`, `NotificationManager` | - |
| `html-templates.js` (485) | Templates for notifications, help, the friend row, the tutorial | Four owners in one file; an async emoji-to-SVG pipeline that makes the help and tutorial templates async |
| `notification-manager.js` (448) | Notifications, help, the privacy error | The CS2 launch overlay (160 lines of promise and listener choreography that resets its texts twice), language re-rendering through `_lastMain` |
| `map-finder-view.js` (544) | The Maps view | The friends-of-friends key form and the clear buttons; its own copies of `formatScore` and a second double-click confirmation |
| `friends-renderer.js` (290), `join-status.js` (127), `status-manager.js` (43), `join-bar.js` (106), `account-view.js` (293), `fake-friends-manager.js` (164), `gsi-status-indicator.js` (54), `view-tabs.js` (76) | As named | `join-status.js` has its own `escapeAttribute`; `fake-friends-manager.js` holds the data side of a feature whose flows live in `core/app-event-manager.js` |
| `tutorial/*` (6 singletons) | The tutorial | Dead helpers (1.6), dynamic imports that avoid no cycle, literal step numbers in three files, English strings outside i18n |

**`src/utils/` (683 lines)**: `logger.js` is the renderer logger (console plus
IPC to main); `error-handler.js` holds coded errors, English messages, a
second logger and a string-sniffing privacy check; `validators.js` is pure
except two methods that return translated strings; `dom-utils.js` is four
helpers including `escapeHtml`; `emoji-svg.js` fetches and inlines SVGs at
runtime.

**`src/shared/`**: `constants.js` (parts of `LOGGING_CONFIG` dead),
`types.js` (JSDoc; `JoinState.interval` is documented as the loop's interval
but is the repaint timer; `AppSettings` lacks `fake_friend_ids`,
`fof_api_key`, `language`), `icon-paths.js` (one of seven entries used).

**`src/i18n/` (214 lines plus 658 of locale text)**: fine. `dom-i18n.js`
applies the `data-i18n` attributes; `i18n-manager.js` keeps the language and
its listeners as module state. The Russian locale carries plural forms
English does not need.

### 1.3 Startup and wiring (`src/core/`)

Three wiring mechanisms coexist:

1. Direct singleton imports. `app-friends-manager.js` imports `joinManager`,
   `userLocation`, `UIManager`, `AccountView`, `credentialState`,
   `tutorialManager` itself.
2. Setter injection from `App`'s constructor: `setValidationManager`,
   `setManagers(inputManager, eventManager, validationManager)`,
   `setFriendsManager`. The same modules that import singletons directly
   receive `inputManager` by setter. `cs2Manager.initialize(appInputManager)`
   and `gsiManager.initialize(getExpectedSteamId)` are a third shape.
3. `configure(deps)` with getter functions: `mapFinder.configure({ getAuth,
   getUserId, getFriendIds, ... })`, `MapFinderView.initialize({ getMainAuth })`,
   `AccountView.initialize({ onRefresh })`. This is the newest and the best
   shape: the module names what it reads, the composition root supplies it,
   and tests supply stubs without `jest.mock`.

`App.initialize()` then runs eleven logged steps (numbered 1 to 11 with a
5.1, a 5.2 and two step 9s). Settings are loaded twice. `validateInputs()`
at the end triggers `checkAndStartAutoRefresh`, which waits 500 ms and starts
the refresh; the wait has no comment and hides no race the code shows (on a
first run there are no saved friends, so nothing starts; on a later run the
tutorial does not start). That is an assumption to confirm live, see step 7.

One import cycle: `core/app-friends-manager.js` imports
`ui/tutorial/tutorial-manager.js` (to check `isActive`), and
`tutorial-manager.js` imports `core/app-friends-manager.js` and
`core/app-state-manager.js` (to stop and restart auto-refresh). The tutorial
reaching back into the friends feature is the inversion. The dynamic imports
in `tutorial-mock-data-manager.js` ("to avoid circular dependencies") avoid
nothing: `join-manager`, `friends-renderer`, `fake-friends-manager` and
`status-manager` do not import the tutorial.

Coverage of `core/` is 25%, with `app.js` and `app-validation-manager.js` at
0%. The click on a friend row that starts every friend join
(`setupFriendListeners`) is not covered by any test.

### 1.4 Layers that only pass calls through

- `steam/steam-api.js`: eight static methods, each `return SteamAPIClient.x(...)`.
  It is also the mocking seam of 14 test suites (`jest.mock("../src/steam/steam-api.js")`).
- `ui/ui-manager.js`: thirteen static members delegating to three modules; 0%
  covered; mocked in 4 suites.
- `utils/dom-utils.js` `getElementById`: `document.getElementById`; the
  seam of 15 suites.
- `game/cs2-manager.js` `getGsiUserState()`: `gsiManager.getUserState()`.
- `ui/tutorial/tutorial-manager.js` `stopAutoRefresh()` / `restoreAutoRefresh()`:
  call `appFriendsManager`.
- `ui/tutorial/tutorial-state-manager.js`: getters and setters over three
  fields.
- `steam/api-logger.js`: four wrappers around `logger` that add the method name.
- `preload.cjs`: every bridge method wrapped in try/catch returning `null`
  or `false`; the renderer then guards the same calls again with `?.` and
  try/catch. Three layers of guarding for one failure.

The first three earn their keep as test seams. Removing `steam-api.js` or
`dom-utils.getElementById` costs 14 to 15 test edits for no behaviour gain;
see Part 3. `ui-manager.js` is removable (step 9).

### 1.5 Parallel ways of doing the same thing

| Concern | Ways found | Where |
|---|---|---|
| Logging, renderer | `logger.*` (console + IPC to main); bare `console.log/warn/error` (13 in `join-manager.js`, 2 in the tutorial, 2 in `emoji-svg.js`); `ErrorHandler.logError` (console only, no level, no IPC); `SteamAPILogger` on top of `logger` | `utils/logger.js`, `game/join-manager.js`, `utils/error-handler.js`, `steam/api-logger.js` |
| Logging, main | `MainLogger`, a fourth format; renderer lines arrive over IPC tagged `[MAIN]` | `main/main.js` |
| Errors | Thrown errors with a `code` (`ErrorHandler.createError`); `null` returns (`allowFailure`); `false` returns (preload); `{valid, error}` objects (`Validators`); string sniffing (`isPrivacyError` looks for "private" in the message) | `steam/`, `main/preload.cjs`, `utils/` |
| Error texts | `ErrorHandler.getErrorMessage` (English only) and `t("errors.*")` (both languages) | `utils/error-handler.js`, `i18n/locales` |
| "No friends" | `processFriendsListResponse` throws `EMPTY_FRIENDS_LIST`; `updateFriendsList` then also checks `!allFriendIds.length`, which can no longer be true | `steam/steam-api-response-processor.js`, `core/app-friends-manager.js` |
| Notifications | `UIManager.showError` (privacy special case) and `NotificationManager.showNotification(html)` with hand-built markup; inline errors under inputs (`setFakeFriendError`, `fof-key-hint`) | `core/`, `ui/` |
| Opening `steam://` links | `join-manager.js` (`openExternal`, else `window.open(url, "_self")`) and `cs2-manager.js` (`openExternal`, else `window.open(url)`) | `game/` |
| Reading the credentials | `appInputManager.getAuth()`; `join-manager.js`'s own DOM read; `updateFriendsList`'s fallback to `savedSettings`; `MapFinderView.getMainAuth` injected; `cs2Manager` through `appInputManager` | `core/`, `game/`, `ui/` |
| One account, read four ways | `processJoinInfoResponse` (join facts), `processPresenceResponse` (extends it), `_mapAccountsToFriends` (the `Friend` row shape, `in_casual_mode`/`join_available`), `processPlayerCS2StatusResponse` (a boolean, 100 lines), `createPlayerDebugInfo` | `steam/steam-api-response-processor.js`, `steam/steam-api-utils.js` |
| Listeners | `onChange(listener)` + `_notify()` with try/catch copied six times | `credential-state`, `gsi-manager`, `map-finder`, `map-keeper`, `user-location`, `view-tabs` |
| Double-click confirmation | `armRemoveButton`/`disarmRemoveButton` (a `WeakMap`, 3 s) and `confirmClear` (a `Map`, 3 s) | `core/app-event-manager.js`, `ui/map-finder-view.js` |
| Small helpers | `formatScore` twice; `escapeAttribute` beside `DOMUtils.escapeHtml`; the close icon path hard-coded in `REMOVE_FAKE_ICON` beside `ICON_PATHS.CLOSE` | `ui/` |
| Chunking by 100 | `_fetchLinkDetailsInChunks` and `getPlayerSummaries` | `steam/steam-api-client.js` |
| Tutorial active flag | `tutorialManager.isActive` (5 sites) and `tutorialManager.stateManager.getIsActive()` (3 sites) | `core/` |
| Module shape | Instance singletons with `reset()` (`game/`, `credential-state`); static classes with `_initialized` and static state (`ui/` views, `SteamAPIClient`); function modules (`i18n/`, `main/`) | everywhere |

### 1.6 Static members that hold module state, and what they cost

Instance singletons with a `reset()` (`gsiManager`, `joinJournal`,
`mapFinder`, `mapKeeper`, `userLocation`, `credentialState`) are the pattern
that works: tests call `reset()` in `beforeEach` and touch no private field.
`joinManager` and `cs2Manager` have no `reset()`; tests get by with
`resetAll()` and re-wiring the callbacks each time.

Static state without a `reset()`:

- `SteamAPIClient._batchers`, `_inFlight`, `_cache`, `_avatarCache`. Four
  suites clear `_cache` and `_inFlight` by hand; none clears `_batchers` or
  `_avatarCache`, so a 10 ms batch timer armed by one test can fire into the
  next, and avatars leak between tests. The tests name private fields, so a
  rename inside the client breaks them.
- `SteamAPIResponseProcessor._reportedInvalidConnects`: cleared by hand in
  one suite.
- `FriendsRenderer.lastRenderedFriends`, `lastRenderedFakeFriends`;
  `NotificationManager._lastMain`; `ViewTabs.current`, `listeners`.
- `AccountView`, `MapFinderView`, `JoinBar`, `GsiStatusIndicator`:
  `_initialized` guards that `initialize()` runs once. `AccountView.reset()`
  does not clear it, so a second `initialize()` on a fresh DOM attaches
  nothing. `MapFinderView` has no `reset()`; its test initialises once in
  `beforeAll`, pokes `_lastListHtml = null` and `expanded` before each test,
  and notes that `mapKeeper.reset()` cannot be used because it "would also
  drop the view's own subscriptions". `credentialState.reset()` clears its
  listeners, which drops `AccountView`'s subscription for the rest of a suite.
- Function-module state: `i18n-manager.js` (`currentLanguage`, `listeners`),
  `join-journal-file.js` (the `writing` chain), `emoji-svg.js` (`svgCache`).

The cost today is confined to tests: private-field coupling, `beforeAll`
setups that share one DOM, and subscriptions that cannot be undone. Jest
gives every test file a fresh module registry, so nothing leaks between
files. Nothing in the running app is hurt. The fix is cheap: a `reset()` on
every stateful module, and tests that use only that (step 11).

### 1.7 Dead code (each verified by grep over `src/`, `index.html`, `css/`, `__tests__/`)

- `shared/icon-paths.js`: `HELP`, `MINIMIZE`, `CLOSE`, `CHEVRON_LEFT`,
  `CHEVRON_RIGHT`, `CHECK` and the two commented entries are unused; only
  `CLOSE_BOLD` is. `assets/icons-svg/arrow_back*`, `arrow_forward*`,
  `check*`, `chevron_left*`, `chevron_right*` are referenced by nothing but
  those entries.
- `shared/constants.js`: `LOGGING_CONFIG.MAX_LOG_ENTRIES` and
  `DEFAULT_LEVEL` are unused. `CURRENT_LEVEL` is the one knob (edited by
  hand for a debug build); `logger.setLevel`, its only writer, is never
  called.
- `utils/logger.js`: `setLevel`. (`logStateChange` and `trace` print only
  with the level raised; they are debug aids, not dead.)
- `ui/ui-manager.js` `hideCS2LaunchNotification`: no caller.
- `ui/tutorial/tutorial-highlight-manager.js`: `waitForElementWithAttempts`
  (only calls itself); `spotlight` is never created, so `removeSpotlight`
  removes nothing. `tutorial-event-manager.js`: `handleSteamTokenLinkClick`
  is never assigned. `tutorial-manager.js`: the `currentStep` and `steps`
  getters have no callers.
- `core/app-friends-manager.js`: the `if (!allFriendIds.length)` branch
  after `getFriendsList` (the processor throws first).
- `core/app.js`: `await import("../i18n/i18n-manager.js")` for `t` inside
  the catch, although the module is already imported statically; the
  `import("../i18n/dom-i18n.js")` in `app-event-manager.js` likewise.
- `steam/steam-api-client.js`: the `avatarsCache` parameter of
  `getFriendsStatuses` (both callers pass two arguments); the literal `100`
  beside `_MAX_IDS_PER_REQUEST`.
- Commented-out `export default` lines at the end of `app-input-manager.js`,
  `app-validation-manager.js`, `app-event-manager.js`; `// // Singleton
  instance` in `tutorial-ui-manager.js`; `dev-scripts/` in the eslint
  ignores and `.gitignore` with no such folder.

### 1.8 Timers that are not events

Against the rule that a timeout is only a named, explained fallback:

| Where | Wait | Explained? |
|---|---|---|
| `join-manager.js` `_startAttempt` | `setInterval(..., 1000)` repainting the row's dot and button | "Periodic UI re-assert" - not why, nor what it covers that `updateJoinState`'s immediate notify and the renderers (which draw rows from `joinStates`) do not |
| `core/app-validation-manager.js` | `setTimeout(..., 500)` before auto-refresh starts | No |
| `game/cs2-manager.js` `startStatusMonitoring` | `intervalMs = 3000` default, Steam polled while waiting for the lobby | Yes in a comment ("the fallback while GSI is not delivering"), but a literal, not a named constant |
| `game/map-finder.js` `_scheduleSave` | `setTimeout(..., 2000)` | "Save shortly after the last change" - a literal |
| `ui/tutorial/*` | 0, 50, 100, 500, 2000, 10000 ms in five places | Partly ("prevent flicker", "ensure cleanup is complete") |

The join loop's own cadence (`JOIN_LOOP_INTERVAL_MS`, `JOIN_RETRY_INTERVAL_MS`,
`MISSING_TIMEOUT_MS`, `JOIN_GSI_CONFIRM_MS`, `JOIN_SUCCESS_DISPLAY_MS`) is
named and explained in `constants.js` and is not touched by this plan.
The micro-batch window and cache TTL in `steam-api-client.js` are named and
explained.

### 1.9 Naming

- Seventeen classes end in `Manager` (`AppInputManager`, `JoinManager`,
  `CS2Manager`, `UIManager`, `NotificationManager`, six tutorial managers,
  ...). The newer modules use nouns (`MapFinder`, `MapKeeper`,
  `UserLocation`, `JoinJournal`, `CredentialState`, `AccountView`, `JoinBar`,
  `ViewTabs`), which say what the thing is. New modules should follow the
  noun style; renaming existing ones is churn (see Part 3).
- `AppValidationManager` validates nothing. `SteamAPIUtils` is a grab bag.
  `UIManager` is a facade.
- `isPlayerInCS2` exists three times with different meanings:
  `SteamAPI.isPlayerInCS2(id, auth)` (a request), `SteamAPIUtils.isPlayerInCS2(privateData)`
  (a predicate), `userLocation.isInCS2()` (the user, from CS2 or Steam).
- `JoinManager` parameters are named `friend_id` where the value is a map,
  server or pinned-maps join id (`cancelJoin`, `updateJoinState`,
  `cancelAllExcept`). `snake_case` (`steam_id`, `user_steam_id`, `join_id`)
  and `camelCase` (`joinId`, `steamId`) alternate within one file. The
  `Friend` row shape is `snake_case` (`in_casual_mode`, `join_available`),
  the presence shape `camelCase` (`inSupportedMode`, `serverId`); both mean
  "in a casual match" by two names.
- `checkUserInCS2` returns `false` when the manager is not initialised and
  `null` when Steam could not be asked; the join loop treats `false` as
  "offer to launch CS2". A wiring mistake would offer a launch instead of
  going ahead. Worth a look during step 16, not a refactoring.
- `types.js`: `JoinState.interval` is "Interval ID for join loop"; it is the
  repaint timer.

### 1.10 What guards the join logic today

The join loop and its inputs are the best-tested part of the code, and
every step below that goes near them names these:

- `join-manager-loop.test.js` (738 lines): one connect per status, the
  journal, acting only for its own attempt, Steam not answering, starting an
  attempt (CS2 check, launch offer, double click), one snapshot per
  iteration, `cancelJoin`/`resetAll`.
- `join-manager-gsi.test.js` (392): CS2's state against Steam's, protected
  matches, training, the connect hold after a map load, the server the user
  just left.
- `join-manager-map.test.js` (454): `resolveMapTarget`, map, server, pinned
  and several-map joins.
- `join-manager-competitive.test.js` (405), `join-manager-integration.test.js` (425):
  mode changes mid-join, errors, the UI callbacks, `window.open` fallback.
- `join-replay.test.js` (211) and `join-replay-journal.test.js` (229, with
  `fixtures/join-journal-replays.json`): recorded joins replayed through the
  real `SteamAPIResponseProcessor`, `interpretGsiPayload` and the real loop.
  These catch a change in the presence rules or the loop that would have
  spoilt a join that worked.
- `steam-api-join-snapshot.test.js` (336), `steam-presence.test.js` (334),
  `steam-api-batching.test.js` (144), `steam-api-utils.test.js` (183): the
  client's batching and cache through a mocked `fetch`, the presence facts,
  the rules.
- `gsi-manager.test.js` (290), `cs2-manager.test.js` (316),
  `user-location.test.js` (88), `map-finder.test.js` (823),
  `map-keeper.test.js` (161), `join-journal.test.js` (154).

All join suites mock the same four modules at the top:
`utils/dom-utils.js`, `steam/steam-api.js`, `utils/validators.js`,
`utils/error-handler.js`, and feed the credentials through
`DOMUtils.getElementById.mockImplementation(...)`. They do not mock
`logger`; the real logger runs with the console silenced by
`__tests__/setup.js`.

What is not guarded: the click on a row that starts a friend join
(`app-event-manager.js`, 0% there), the startup decision to auto-refresh,
the CS2 launch overlay (`notification-manager.js`, 9%), the tutorial (0%),
and `ui-manager.js`, `steam-api.js` (0%, mocked away).

---

## Part 2. The steps, in order

Value against risk, best first. "Join risk" is the risk to what you can only
check live in CS2: none (no join path file changes), low (a join path file
changes but no decision, timing or value in it), medium (a value the loop
acts on is produced by different code).

| # | Step | Join risk | Verdict |
|---|---|---|---|
| 1 | Delete the dead code | none | do |
| 2 | Name the three unexplained literal waits | none | do |
| 3 | Map labels and small helpers in one place | none | do |
| 4 | One logging channel in the renderer | low | do |
| 5 | Guard tests for the click paths, startup and the launch overlay | none | do first, before 6 to 10 |
| 6 | Attach the friends click listener once | none | do |
| 7 | Fold the validation manager into the friends manager | none | do |
| 8 | Remove the `UIManager` facade | none | do |
| 9 | Fake-friends flows out of the event manager; dissolve it | none | do |
| 10 | Break the tutorial to core cycle; static imports; named steps | none | do |
| 11 | `reset()` on the Steam client and processor; tests stop poking privates | none | do |
| 12 | Inject the credentials into `JoinManager`; one `steam://` opener | low | do |
| 13 | The rich presence rules in a module of their own | low | do |
| 14 | Split `html-templates.js` by owner; synchronous emoji | none | do |
| 15 | The CS2 launch overlay as a module | low | do |
| 16 | One user-state check in `CS2Manager`; inject its credentials | low | do |
| 17 | Target resolution out of `join-manager.js` | low | optional |
| 18 | Drop the 1 s repaint interval from the join loop | low to medium | your call |
| 19 | One account reader in the processor | medium | optional, last |
| 20 | A shared `Listeners` helper | low | optional |

### Step 1. Delete the dead code

**Touches**: `shared/icon-paths.js` (keep `CLOSE` for step 3), five files
under `assets/icons-svg/`, `shared/constants.js` (`LOGGING_CONFIG` down to
the two fields `logger.js` reads), `utils/logger.js` (`setLevel`),
`ui/ui-manager.js` (`hideCS2LaunchNotification`),
`ui/tutorial/tutorial-highlight-manager.js`, `tutorial-event-manager.js`,
`tutorial-manager.js` (the items in 1.7), `core/app-friends-manager.js`
(the unreachable branch), `core/app.js` and `core/app-event-manager.js` (the
two dynamic imports), `steam/steam-api-client.js` (the `avatarsCache`
parameter; `100` to `_MAX_IDS_PER_REQUEST`), the three commented exports,
`eslint.config.js` and `.gitignore` (`dev-scripts`).

**Keeps**: everything the app does. Removing `avatarsCache` must leave
`getFriendsStatuses` reading `this._avatarCache` exactly as now (the
parameter was spread over it; with no caller passing it the merge is the
cache alone).

**Guards today**: every suite; `steam-presence.test.js` "friends statuses"
covers `getFriendsStatuses`.

**Add first**: nothing.

**Join risk**: none. `steam-api-client.js` changes, but only a parameter no
caller uses and a constant for a literal of the same value.

### Step 2. Name the three unexplained literal waits

**Touches**: `shared/constants.js`, `game/map-finder.js`
(`MAP_FINDER_CONFIG.SAVE_DEBOUNCE_MS = 2000`), `game/cs2-manager.js`
(`API_CONFIG.CS2_LOBBY_POLL_MS = 3000` with the existing comment moved next
to it: Steam is polled for the lobby only while CS2's own state is not
arriving), `ui/tutorial/*` (a `TUTORIAL_TIMING` object in the tutorial folder
for its waits of 0, 50, 100, 500, 2000 and 10000 ms, each with the one-line
reason the code already gives or "no reason recorded" where it gives none). The 500 ms in
`app-validation-manager.js` is handled in step 7 and the 1 s repaint in
step 18.

**Keeps**: every value. This step changes no number.

**Guards today**: `map-finder.test.js` "saves once shortly after changes"
(advances fake timers by the literal; switch it to the constant),
`cs2-manager.test.js` launch-wait tests.

**Add first**: nothing.

**Join risk**: none.

### Step 3. Map labels and small helpers in one place

**Touches**: new `shared/map-labels.js` with `MAP_LABELS` and `mapLabel`
(moved from `game/map-finder.js`); `game/map-finder.js`, `game/map-keeper.js`,
`ui/friends-renderer.js`, `ui/join-bar.js`, `ui/map-finder-view.js` import
it. `formatScore` from `friends-renderer.js` and `map-finder-view.js` into
`ui/join-status.js` (it already owns the row's text rules); `escapeAttribute`
in `join-status.js` replaced by `DOMUtils.escapeHtml`; `REMOVE_FAKE_ICON`
uses `ICON_PATHS.CLOSE`.

Why: `ui/friends-renderer.js` and `ui/join-bar.js` import the whole
`game/map-finder.js` singleton (and through it `gsi-manager`,
`join-journal`, `user-location`, `steam-api`) for one label function.

**Keeps**: `mapLabel` output for known and unknown maps; `escapeHtml` escapes
`'` as well, which `escapeAttribute` did not - harmless in a quoted
attribute, and the test below pins it.

**Guards today**: `map-finder.test.js` "mapLabel names known maps" (moves
with the function), `join-status.test.js` "survive the trip through
attributes, quotes and markup included", `friend-rows.test.js`,
`map-finder-view.test.js`, `html-escaping.test.js`. `join-bar.test.js` mocks
`game/map-finder.js` with `{ mapLabel }`: point the mock at the new module
or drop it.

**Add first**: nothing.

**Join risk**: none.

### Step 4. One logging channel in the renderer

**Touches**: `game/join-manager.js` (13 `console.log` calls become
`logger.info` or `logger.debug` with a `"JoinManager"` context, the two
`ErrorHandler.logError` calls become `logger.error`), `core/app-friends-manager.js`,
`core/app-input-manager.js`, `core/app-event-manager.js`,
`ui/map-finder-view.js` (their `ErrorHandler.logError` calls),
`utils/error-handler.js` (delete `logError`), `ui/tutorial/*` and
`utils/emoji-svg.js` (bare `console.*` to `logger`), `steam/api-logger.js`
(`logRequest` from `info` to `debug`: at `info` every Steam request logs a
line and a `console.table` and sends both over IPC to main, five times a
second during a join and thirty lines per map refresh).

Optional in the same commit: `main.js` tags lines that arrive from the
renderer `[RENDERER]` instead of `[MAIN]`.

**Keeps**: every decision, timing and journal line of the loop. Only what
reaches the console and the main process stdout changes. `ErrorHandler.createError`,
`formatErrorMessage`, `isPrivacyError` stay as they are. If you read the
request lines when tuning, keep `logRequest` at `info` and skip that part.

**Guards today**: every join suite runs the lines. Four tests assert on
`ErrorHandler.logError` and will assert on `logger.error` instead:
"a CS2 check that throws is logged and no attempt starts" and "Steam
failing once mid-join does not cancel" in `join-manager-integration.test.js`,
"a start that fails before its attempt exists leaves the running one alone"
in `join-manager-loop.test.js`, "a rejected snapshot does not cancel" in
`join-manager-competitive.test.js`. The join suites do not mock `logger`;
add `jest.mock("../src/utils/logger.js")` with the factory the `game/`
suites already use.

**Add first**: nothing beyond adjusting those assertions.

**Join risk**: low. `join-manager.js` changes on 15 lines, none of them a
condition, an `await`, a sleep or a value. The replays run the loop as
before.

### Step 5. Guard tests for the click paths, startup and the launch overlay

Tests only; no `src/` change. These are the tests steps 6 to 10 and 15
need and that do not exist:

- `__tests__/friends-view-clicks.test.js` (jsdom): a click on a row's Join
  calls `mapKeeper.userJoined(null)` then `joinManager.startJoin(steamid)`;
  on Cancel calls `joinManager.cancelJoin`; the same for the fake friends
  tab; during tutorial step 8 (index 7) the click advances the tutorial and
  starts no join; during steps 7, 9, 10 it does nothing. One listener on the
  container however many renders (count `addEventListener` calls after three
  renders).
- `__tests__/startup-auto-refresh.test.js`: with saved settings, a valid
  credential and saved friends, auto-refresh starts once and only once
  however often `validateInputs()` runs; not with an expired token; not while
  the tutorial is active; not without saved friends.
- `__tests__/cs2-launch-dialog.test.js` (jsdom): the overlay shows; Launch
  calls `launchAndWaitForLobby` and the promise resolves `true` when it
  succeeds, the overlay hides; Close resolves `false` and calls
  `cancelLaunchOperations`; a timeout keeps the overlay open with the retry
  texts and a second Launch calls `launchAndWaitForLobby` again; a thrown
  error resolves `false`.

**Join risk**: none.

### Step 6. Attach the friends click listener once

**Touches**: `core/app-friends-manager.js` (drop the two
`this.eventManager.setupFriendListeners()` calls after rendering),
`core/app-event-manager.js` (`setupFriendListeners` attaches once; the
remove-and-re-add dance goes).

**Keeps**: one delegated listener on `#friends`, which never leaves the DOM;
the handler body as is.

**Guards today**: none. **Add first**: step 5's click test.

**Join risk**: none (the wiring that starts a join, not the join).

### Step 7. Fold the validation manager into the friends manager

**Touches**: delete `core/app-validation-manager.js`; `core/app-friends-manager.js`
gains `startAutoRefreshOnce(facts)` with the same conditions
(`hasSaved && !tokenExpired && savedFriends.length`, once, not during the
tutorial); `core/app-input-manager.js` calls it from `validateInputs()` and
loses `setValidationManager`; `core/app.js` loses the setter wiring;
`core/app-state-manager.js` loses `initialLoadAttempted` (a field on the
friends manager now). The 500 ms wait: either drop it, or keep it as a named
constant with the reason, if you know one. Dropping it is the assumption to
check live: start the app with saved friends and a valid token, the list
should load and refresh as before.

**Keeps**: auto-refresh starts at most once per app run, under exactly the
conditions above; `validateInputs()` keeps its order of effects (button,
classes, `AccountView.update`, then the auto-refresh decision).

**Guards today**: nothing (0% covered). **Add first**: step 5's startup
test, written against the current code, then kept.

**Join risk**: none. Startup risk: low, one live start covers it.

### Step 8. Remove the `UIManager` facade

**Touches**: delete `ui/ui-manager.js`; `core/app.js`,
`core/app-friends-manager.js`, `core/app-input-manager.js`,
`core/app-event-manager.js` call `NotificationManager`, `FriendsRenderer`,
`StatusManager` directly. Tests: `app-friends-refresh.test.js`,
`app-input-manager.test.js`, `fake-friend-remove.test.js`,
`fake-friends-manager.test.js` mock `ui-manager.js`; they mock the three
modules instead.

**Keeps**: everything; every facade method is a one-line delegate.

**Guards today**: the four suites above. **Add first**: nothing.

**Join risk**: none. Do it in the same sitting as step 9; both edit the same
four files.

### Step 9. Fake-friends flows out of the event manager; dissolve it

**Touches**: new `ui/fake-friends-view.js` holding the add/remove flows
(`addFakeFriend`, `removeFakeFriend`, `setFakeFriendError`, the arm/disarm
confirmation, the delegated listener on `#fake-friends`) moved verbatim from
`core/app-event-manager.js`, wired by `initialize({ getOwnSteamId, onAdded })`
in the `configure(deps)` style; `ui/fake-friends-manager.js` stays the data
side. The window-bar, language, tutorial button, help link, filter and input
listeners move into `core/app.js` (they are ten lines of `addEventListener`),
or into a small `ui/window-bar.js` if `app.js` feels crowded. The friends
row listener (`setupFriendListeners`) moves to `ui/friends-renderer.js` or a
`ui/friends-view.js`, beside the rendering it serves. Delete
`core/app-event-manager.js`.

The tutorial step numbers in the row handler (`7`, `6`, `8`, `9`) become
`TUTORIAL_STEPS.CONNECTION` etc., defined in step 10 - do step 10 first if
you want to avoid touching the handler twice.

**Keeps**: every flow byte for byte: the order of checks in `addFakeFriend`
(tutorial active, SteamID format, own id, `addId`, error, clear, notify,
`startAutoRefresh`), `removeFakeFriend` cancelling the join and trimming
`friendsData`, the 3 s confirmation.

**Guards today**: `fake-friend-remove.test.js` (moves with the code; its ten
`jest.mock` lines shrink once the flows take `deps`), `fake-friends-manager.test.js`.
**Add first**: step 5's click tests.

**Join risk**: none; the row click path is pinned by step 5.

### Step 10. Break the tutorial to core cycle; static imports; named steps

**Touches**: `ui/tutorial/tutorial-manager.js` stops importing
`core/app-friends-manager.js` and `core/app-state-manager.js`; it gains
`onChange(listener)` fired on start and stop (the `Listeners` shape every
`game/` module has). `core/app.js` wires
`tutorialManager.onChange(active => active ? friends.stopAutoRefresh() : friends.restoreAutoRefresh())`
with `restoreAutoRefresh` moved into the friends manager (its 500 ms
"cleanup" wait named in step 2). `ui/tutorial/tutorial-mock-data-manager.js`
replaces its four dynamic imports with static ones. A `TUTORIAL_STEPS`
object (`WELCOME: 0, CREDENTIAL: 1, TOKEN_PAGE: 2, ..., CONNECTION: 7, STATUS: 8, DONE: 9`)
in `tutorial/tutorial-steps.js` replaces the literals in
`tutorial-manager.js`, `tutorial-mock-data-manager.js`,
`tutorial-event-manager.js` and the row handler. `tutorialManager.isActive`
is the one way to read the flag; the three
`stateManager.getIsActive()` sites in `core/` use it.

**Keeps**: the tutorial's behaviour step for step; auto-refresh stops when
it starts and resumes when it stops; the mock friend, the mock connection
cycle, the API token notification on step 3.

**Guards today**: none (0%). **Add first**: a small test that `start()`
notifies listeners with `true` and `stop()` with `false`, and that
`app.js`'s wiring (test the two callbacks in isolation) stops and restores
auto-refresh. The tutorial itself is checked live: open it from the help
button and walk the ten steps; it needs no CS2.

**Join risk**: none.

### Step 11. `reset()` on the Steam client and processor; tests stop poking privates

**Touches**: `steam/steam-api-client.js` gains `static reset()` that clears
`_cache`, `_inFlight`, `_avatarCache` and clears the timer of every entry
in `_batchers` before emptying it; `steam/steam-api-response-processor.js`
gains `static reset()` for `_reportedInvalidConnects`. Tests
`steam-api-batching.test.js`, `steam-api-join-snapshot.test.js`,
`steam-presence.test.js` call the two `reset()`s in `beforeEach` instead of
`_cache.clear()` / `_inFlight.clear()` / `_reportedInvalidConnects.clear()`.
The one test that sets a cache entry by hand ("expired cache entries are
dropped, not only ones asked about again") keeps doing so: it is testing
the cache. In the same commit: a `chunk(ids, size)` helper used by both
`_fetchLinkDetailsInChunks` and `getPlayerSummaries`, and `getFriendIdsOf`
reading its list through `SteamAPIUtils.extractFriendIds(data, false)`.

**Keeps**: batching, in-flight sharing, cache TTL, the negative-answer
cache, the stop-on-429/5xx/401/403 rule, the avatar cache across refreshes.
`reset()` is never called by the app.

**Guards today**: the three suites above plus `steam-api-utils.test.js`
"friends lists". **Add first**: nothing.

**Join risk**: none at runtime; the chunk helper is a pure extraction with
the same size and order, and `getPlayerSummaries` feeds avatars and the
account bar, not the loop.

Going further and turning `SteamAPIClient` into an instance is not worth
it; see Part 3.

### Step 12. Inject the credentials into `JoinManager`; one `steam://` opener

**Touches**: `game/join-manager.js`: `configure({ getCredentials })`
replaces the `DOMUtils.getElementById("steam-id")` / `("auth")` read and the
`Validators.extractApiKeyOrToken` call in `_startAttempt`; the `DOMUtils`
and `Validators` imports go. `core/app.js` wires
`joinManager.configure({ getCredentials: () => ({ steamId: inputManager.getSteamId(), auth: inputManager.getAuth() }) })`
(`getAuth()` already trims and extracts, `getSteamId()` already trims: the
values are the same). New `game/steam-protocol.js` with
`openSteamUrl(url)` (the bridge's `shell.openExternal`, else
`window.open(url, "_self")`), `joinUrl(joinAs, connect)` and
`LAUNCH_CS2_URL`, used by `join-manager.js` and `cs2-manager.js`.
`main/external-links.js` keeps its allow-list as is; the URL shapes do not
change.

**Keeps**: the order inside `_startAttempt` exactly: CS2 check, launch
offer, read the credentials once, "already in progress" check, create the
state, journal, callbacks, loop. The credentials are read once per attempt
and never re-read inside the loop (a token pasted mid-join still resets the
joins through `handleAuthInput`). Missing credentials throw the same error
into the same catch, which logs and cancels nothing. `openSteamUrl` is
awaited in the loop as `openExternal` is now; `launchCS2` keeps not awaiting.
The `cs2-manager.js` fallback changes from `window.open(url)` to
`window.open(url, "_self")`: only reachable with no bridge, that is, in
tests.

**Guards today**: every join suite starts attempts through this code;
`join-manager-loop.test.js` "a start that fails before its attempt exists
leaves the running one alone" forces the missing-input error;
`join-manager-integration.test.js` "without the Electron bridge it connects
through window.open"; `main-settings.test.js` "steam:// commands" pins the
allow-list. The seven join suites replace
`DOMUtils.getElementById.mockImplementation(...)` and
`Validators.extractApiKeyOrToken.mockReturnValue(AUTH)` with
`joinManager.configure({ getCredentials: () => ({ steamId: USER_ID, auth: AUTH }) })`;
the failing-start test uses a `getCredentials` that returns empty strings.
The `jest.mock` lines for `dom-utils` and `validators` can then go from those
suites.

**Add first**: nothing; the existing suites are the guard, adjusted as above.

**Join risk**: low. Two values enter the loop from a function instead of two
input elements, through the same trim and extraction. Every join suite and
both replay suites exercise the path. Live check: one friend join and one
map join from the Friends and Maps tabs; a join with the fields empty does
nothing, as now.

### Step 13. The rich presence rules in a module of their own

**Touches**: new `steam/rich-presence.js` exporting plain functions moved
verbatim from `SteamAPIUtils` (one renamed): `parseRichPresence`, `richPresenceKey`,
`connectKind`, `isValidConnect`, `isInCS2` (was `isPlayerInCS2(privateData)`),
`isInSupportedMode`, `isOffline`, `isInProtectedMatch`, `isOfficialServer`,
`isAnonymousGameServer`, `parseRoundsPlayed`, `isMatchOver`. What remains in
`steam-api-utils.js` (`handleHttpResponse`, `getMethodErrorHandlers`,
`extractFriendIds`, `extractPlayersFromSummaries`, `extractBestAvatar`,
`filterMissingAvatars`, `createPlayerDebugInfo`, `maskAuthInUrl`) is the
client's and processor's business; leave it there under its name. For one
commit `SteamAPIUtils` re-exports the moved functions so nothing else
changes; the next commit updates the importers (`steam-api-response-processor.js`,
`game/join-manager.js`, `game/map-finder.js`, `game/user-location.js`;
`steam-api-client.js` and `api-logger.js` use only what stays behind) and
the tests (`steam-api-utils.test.js`,
`steam-presence.test.js`, `steam-api-join-snapshot.test.js`), then removes
the re-exports.

Why: these twelve functions are the rules you tune from live joins and the
journal. Today they sit between HTTP error handling and avatar helpers in a
392-line static class. `isInProtectedMatch` keeps its `logger.debug` call.

**Keeps**: every function's result for every input. This is a move; no body
changes. `CASUAL_ROUNDS_TO_WIN`, `INTERRUPTIBLE_MODES`,
`ANON_GAME_SERVER_ACCOUNT_TYPE` stay in `constants.js`.

**Guards today**: `steam-api-utils.test.js`, `steam-presence.test.js`,
`steam-api-join-snapshot.test.js`, and both replay suites, which run the
real processor and therefore every one of these functions. **Add first**:
nothing.

**Join risk**: low. The code that computes the loop's facts moves; the
replays would catch a line lost in the move.

### Step 14. Split `html-templates.js` by owner; synchronous emoji

**Touches**: `FRIENDS_TEMPLATES` into `ui/friend-row-template.js` (or into
`friends-renderer.js`, which is its only user besides the remove button);
`TUTORIAL_TEMPLATES` into `ui/tutorial/tutorial-templates.js`;
`NOTIFICATION_TEMPLATES` and `HELP_TEMPLATES` stay with
`notification-manager.js` as `ui/notification-templates.js`. The emoji
pipeline: `getEmojiSVG` and `replaceEmojisWithSVG` fetch twelve SVG files at
runtime, parse them with `DOMParser` and inline them, which makes the help
templates, `showSteamIdHelp`, `showApiKeyHelp`, the tutorial steps and
`refreshTextsAfterLanguageChange` async. Replace with
`emojiImg(emoji)` returning `<img class="emoji-svg" src="assets/emoji-svg/emoji_u1f511.svg" alt="🔑">`
and delete `utils/emoji-svg.js`; the templates and the two help methods
become synchronous. Keep `css/emoji-svg.css` only for the classes still
used.

**Keeps**: the markup of the friend row (pinned by `html-escaping.test.js`),
the privacy link, the texts. The emoji render the same files at the same
size; `role="img"` and `aria-label` as now. Check by eye: both help
notifications, the tutorial's ten step icons, the clipboard icon on the last
step.

**Guards today**: `html-escaping.test.js`, `notification-privacy-link.test.js`,
`friend-rows.test.js`. **Add first**: nothing.

**Join risk**: none.

### Step 15. The CS2 launch overlay as a module

**Touches**: new `ui/cs2-launch-dialog.js` with `ask(cs2Manager)` returning
the same `Promise<boolean>` as `showCS2LaunchNotification`, built from the
existing `_renderCS2LaunchPhase` (one `render(phase)`) and the listener
choreography, minus `_cleanupCS2LaunchNotification`'s second reset of the
same texts. `notification-manager.js` loses 160 lines; `core/app.js` wires
`joinManager.setCS2LaunchCallback(() => Cs2LaunchDialog.ask(cs2Manager))`
(the `friendId` argument is unused today). The language re-render of the
overlay moves with it.

**Keeps**: the promise contract to the letter, because `_startAttempt`
decides on it: `true` once `launchAndWaitForLobby` resolves `true`; `false`
on Close (after `cancelLaunchOperations`), on an error, or when the overlay
or its buttons are missing; on a timeout the overlay stays open with the
retry texts and resolves nothing until the user acts. The overlay's DOM ids
(`#launch-cs2-btn`, `#close-cs2-launch`) and classes stay for the CSS.

**Guards today**: `cs2-manager.test.js` for the manager's side; nothing for
the overlay. **Add first**: step 5's dialog test, written against the
current `showCS2LaunchNotification`, then pointed at the new module.

**Join risk**: low. This is the "CS2 is closed" entry to a join; the loop's
code does not change. Live check: Join with CS2 closed, launch it from the
overlay, see the join go on once the menu is up; Close instead, see nothing
start.

### Step 16. One user-state check in `CS2Manager`; inject its credentials

**Touches**: `game/cs2-manager.js`: `checkUserInCS2` and
`checkUserInCS2AndLobby` share one private `_userState()` returning
`{ inCS2, inMenu }` from CS2's fresh state when there is one, else from a
single `SteamAPI.isPlayerInCS2` call (the `requireLobby` form); the two public
methods keep their names and return values. `initialize(appInputManager)`
becomes `configure({ getCredentials })` wired from `core/app.js` with the
same function as step 12; the `isInitialized` flag goes with it.

**Keeps**: return values per case, since the loop branches on them:
`true` with a fresh CS2 state; `null` when Steam could not be asked;
`false` when the credentials are missing (today also when not initialised;
consider returning `null` there so a wiring mistake does not offer a launch,
but that is a behaviour change, so make it its own commit if you want it);
`checkUserInCS2AndLobby` reads `inMenu` from CS2 and `game_state === "lobby"`
from Steam. The launch-and-wait flow, its poll, the GSI subscription and
`cancelLaunchOperations` do not change.

**Guards today**: `cs2-manager.test.js` ("returns null when Steam cannot be
asked", "returns false when steamId or auth is missing", the GSI cases, the
launch-wait cases). **Add first**: a case for each of the three return
values of both public methods, if not already there (two are).

**Join risk**: low. The loop's first decision reads these values; the
contract is pinned by tests and does not change.

### Step 17. Target resolution out of `join-manager.js` (optional)

**Touches**: new `game/join-targets.js` with `resolveFriendTarget(friendId,
userId, auth)` and `resolveMapTarget(target, userId, auth, getGsiUserState)`
moved verbatim, plus `getMapJoinId`, `getServerJoinId`; `join-manager.js`
keeps the loop, the states, the callbacks, `startJoin` and `startMapJoin`,
and shrinks from 800 to about 550 lines.

**Keeps**: both functions line for line; `resolveMapTarget` reads CS2's state
through the passed getter at the same two moments (once for `ownServerId`,
once inside `isJoined`).

**Guards today**: `join-manager-map.test.js` calls `resolveMapTarget`
directly (import path changes); both replay suites.

**Join risk**: low: a move of the most tuned code in the repository. Worth
it only if you expect to keep tuning `resolveMapTarget` and want it in a file
of its own. Otherwise skip.

### Step 18. Drop the 1 s repaint interval from the join loop (your call)

**Touches**: `game/join-manager.js` (`ownState.interval` and its
`setInterval`, the `clearInterval` calls in `cancelJoin` and `resetAll`),
`shared/types.js` (`JoinState.interval`).

Why: `updateJoinState` already notifies the UI on every status change, and
the rows are drawn from `joinStates` whenever they are rendered
(`FriendsRenderer.rowModel`, `MapFinderView.render`), so a re-rendered row
shows the running attempt without a tick. The interval looks like a leftover
from before those two existed. It is the one unexplained timer in the join
path, and the only reason `JoinState` carries a timer id.

**Keeps**: the status callbacks on every change; `cancelJoin` painting
`CANCELLED` exactly once; `resetAll` painting every attempt.

**Guards today**: `join-manager-loop.test.js` "cancelJoin paints CANCELLED
once, with no delayed repaint", "resetAll paints every attempt CANCELLED and
stops the loops"; `friend-rows.test.js` "a status update shows the join,
then falls back to the row's slot". **Add first**: a jsdom test that renders
a friends list during a WAITING attempt, re-renders it (as a refresh does),
and finds the label and button still showing the attempt and the join bar
still up, with no timer advanced.

**Join risk**: low for the loop (no decision reads the interval), medium for
what you see: if some path re-renders a row from stale data, the label would
stop catching up every second. The assumption that no such path exists is
not verified here. Cheap to check live (start a join, switch tabs, let two
refreshes pass, watch the label and the bar) and cheap to revert. If you
would rather keep it, name it (`JOIN_UI_REPAINT_MS`) in step 2 and write
down what it is for.

### Step 19. One account reader in the processor (optional, last)

**Touches**: `steam/steam-api-response-processor.js`: one
`readAccount(raw)` producing `PlayerJoinInfo`; `processPresenceResponse`
and `_mapAccountsToFriends` derive their shapes from it;
`processPlayerCS2StatusResponse` goes, `CS2Manager` reading `inCS2` and an
added `inLobby` fact instead (through `getJoinSnapshot`-style calls, so the
"is the user in CS2" check shares the batch and cache like everything else);
`createPlayerDebugInfo` goes with the debug breakdown it serves.

**Keeps**: every field of `PlayerJoinInfo`, `PlayerPresence` and `Friend`,
value for value, including the odd ones: `game_server_id` falling back from
rich presence to the account, `connect: ""` (not `null`) in the row shape,
`statusKey` built from the server id and `richPresenceKey`, the malformed
connect warned about once per value.

**Guards today**: `steam-api-join-snapshot.test.js`, `steam-presence.test.js`,
the replays, `steam-api-utils.test.js`. **Add first**: a characterisation
test that feeds a handful of raw accounts (in casual with a connect, in the
lobby, in competitive, offline training, not in CS2, no account) through the
three parsers and asserts the complete expected objects written out by hand,
so the new reader must reproduce them.

**Join risk**: medium. This is the code that turns Steam's answer into the
facts the loop acts on. The replays and the characterisation test make a
slip visible, but a field-level difference in a case no fixture covers would
only show live. Do it when a feature needs a fourth reading of an account,
not before.

### Step 20. A shared `Listeners` helper (optional)

**Touches**: new `utils/listeners.js` (`add`, `remove`, `notify` with the
try/catch and `logger.error` the six copies have); `credential-state.js`,
`gsi-manager.js`, `map-finder.js`, `map-keeper.js`, `user-location.js`,
`view-tabs.js`, and the tutorial's `onChange` from step 10.

**Keeps**: notify order (insertion), a failing listener not stopping the
others, iteration over a copy so a listener may unsubscribe during notify.

**Guards today**: `gsi-manager.test.js` "a failing listener does not stop the
others", "notifies listeners on every state", `user-location.test.js`
"listeners hear about a change once". **Add first**: a unit test for the
helper covering the three points above.

**Join risk**: low: `gsi-manager` and `map-keeper` are in the join path, but
only their notification plumbing changes. Saves sixty lines; skip if that is
not worth a commit to you.

---

## Part 3. Not worth doing, and why

- **Renaming the `Manager` classes and the `snake_case` parameters.** Every
  rename touches `jest.mock` paths and fixtures across up to 15 suites, for
  no behaviour change. Rename a module only when a step above already
  rewrites it (steps 7, 9, 10 do), and let new modules follow the noun style.
- **`src/renderer/` or feature folders (`features/friends`, `features/maps`,
  ...).** The grouping would be truer than `core/` and `ui/`, but it moves
  sixty files, every import, every test path, and `jest.config.json`, and
  conflicts with every open branch. Zero behaviour. The small moves in steps
  3, 9, 14 get most of the clarity.
- **Replacing `AppStateManager`'s string keys with properties.** Ten source
  files and three test factories for a bag of six keys. Not until the bag
  changes for another reason.
- **Removing the `steam-api.js` facade.** It is the mocking seam of 14
  suites. Automocking `steam-api-client.js` instead would automock its
  static `Map`s. Keep it.
- **Replacing `DOMUtils.getElementById`.** The seam of 15 suites. Keep it;
  step 12 removes its only use in `game/`.
- **Turning `SteamAPIClient` into an instance.** `reset()` (step 11) buys
  the test isolation; an instance buys nothing more while the app has one
  credential set and the batchers are already keyed by credential.
- **Turning the static view classes into instances.** A `reset()` that also
  clears `_initialized` and detaches listeners (add it to `AccountView`,
  `MapFinderView`, `JoinBar`, `GsiStatusIndicator` when you touch them) is
  enough.
- **Rewriting the tutorial's positioning and observers.** 470 lines with no
  tests and nothing to do with joining. Step 10 and the dead-code removal
  are enough; the rest works and is only read when it breaks.
- **Removing the preload's try/catch wrappers.** They define the bridge's
  failure semantics (`null`/`false`, never a rejection), which every renderer
  caller relies on. Changing that is a behaviour change across the app.
- **Renaming `inSupportedMode` / `in_casual_mode` to one name.** Touches the
  loop, the target shapes, `types.js` and the fixtures of eight suites.
- **A `Listeners` helper, a shared double-click confirmation, a shared
  `chunk`** beyond what steps 11 and 20 do: each saves a dozen lines.
- **Internationalising `ErrorHandler.getErrorMessage`** (Russian users see
  English for "friends list private", "no friends", 401/403): worth doing,
  but it is a fix with a visible change, not a refactoring. Do it as its own
  small PR: errors keep their `code`, `NotificationManager.showError` maps
  codes to `errors.*` keys, `getErrorMessage` goes.
- **Housekeeping noticed in passing, not refactoring**: `package.json` and
  `README.md` point at `cs2-casual-enjoyer-electron`; `CONTRIBUTING.md`'s
  file tree lacks `main/` and `i18n/`; `types.js` `AppSettings` lacks three
  fields; `babel.config.js` and `jest.config.json` are fine.

---

## Part 4. Carrying it out

- Start after the three fix PRs are merged; rebase this plan's branch and
  re-read steps 4, 11, 12, 13, 17, 18, 19 against their diffs.
- One commit per step, in the order above, each green on `npm test` and
  `npm run lint`. Steps 5 (tests), 8 and 9 (same files), 2 and 7 (the same
  constant) pair naturally into one sitting; still commit them apart so a
  live failure can be reverted alone.
- Steps marked "none" need no CS2. Steps marked "low" each name their live
  check; together they come to: a friend join from the Friends tab, a map
  join and a pinned-maps rejoin from the Maps tab, a Cancel from the join
  bar, a join with CS2 closed through the launch overlay (launch, and
  separately close), a join with the credential fields empty, the tutorial
  walked through once, both help notifications opened, a language switch
  while a notification and the overlay are up.
- A step that misbehaves live is reverted as one commit; no later step
  depends on an earlier one except where it says so: 6, 7, 9 and 15 on the
  tests of 5, 3 on step 1 keeping `ICON_PATHS.CLOSE`, and 13's second
  commit on its first.
