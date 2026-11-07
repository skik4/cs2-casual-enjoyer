# Test plan for 1.0

Every rule in [spec](spec/) gets a test before or with its code. A behaviour without a test is not done. The 0.9.7 suite has 829 Jest tests in 63 files. Their names state intended behaviour, and the area documents cite them. They are the first catalogue of cases to port.

## Levels

1. **Core unit tests.** Pure logic with an injected clock: join engine, map finder, keeper, user state, polling planner, validation. Whole minutes of joining run in milliseconds. Use Tokio's paused clock in Rust, or fake timers in TypeScript.
2. **Replay tests.** Recorded join attempts are fed through the real join engine. 0.9.7 has two suites:

   - `__tests__/join-replay.test.js` holds two recordings inline, and each test fails when its fix is undone:
     - 2026-10-25 20:53, the user's own arrival renews the join token;
     - 2026-10-30 20:26, the match ends at 8:2 while another Dust II server has a slot.
   - `__tests__/join-replay-journal.test.js` replays the six joins in `__tests__/fixtures/join-journal-replays.json`, all of which went right (2026-10-30 to 11-02). Among them: a single connect, a slot that stayed full for 3.5 minutes, three servers at once, a friend's server full for 2 minutes, a token renewed, a join from a warmup.

   Carry both over, and add a recording for every bug found in game from now on.

3. **Adapter tests** against fakes and recorded data:
   - Steam Web API JSON, including the 100-id limit, a rejected credential, 429 and 5xx;
   - GSI payloads;
   - lines of `gameprocess_log.txt`;
   - the bytes of a coplay file;
   - settings files encrypted the 0.x way, for the migration.
4. **UI tests**: views with a mocked core, in both languages.
5. **End-to-end tests**: the built app, driven through WebDriver or Playwright, with a fake Steam and no network. The checklist below lives here.
6. **Packaging checks**:
   - the installer builds;
   - the update manifest matches the files;
   - nothing unexpected is packed;
   - for Electron, the fuses and asar integrity hold, as `check-build.cjs` and `compare-packed.cjs` checked them for 0.x.
7. **In-game checks** by the owner, then reading the journal and the logs (list below).

## Must-have cases by area

Details and reasons are in each area document.

- **Joining** ([03](spec/03-joining.md)):
  - a new token gets one connect at once, and a token already sent never goes out again, from any attempt;
  - the user's own arrival, which Steam logs as a server change before the tokens renew, is skipped;
  - a log that missed a join is no longer trusted, and every new token is then connected;
  - a protected match (competitive, Premier, Wingman, anything not casual or deathmatch) is never left;
  - CS2 closing ends the attempt at once with no connect, and the log is read again right before every connect;
  - two attempts meeting the same token send one connect;
  - a cancel landing while a request is out acts on nothing;
  - Steam not answering does not cancel until the failure budget is spent;
  - "joined" is recognised on the target's server or map, never on the server the user just left;
  - match over: a server at 8 rounds is not joined.
- **Maps** ([04](spec/04-maps.md)):
  - only seeds join the pool, and a pool player seen again gets another 14 days;
  - caps and TTLs apply;
  - each round polls in order, with the rotating slice;
  - the official signature;
  - the server built from the player whose status changed last;
  - the user's own server is blocked, not hidden;
  - Prime marks and the Prime-only filter; the friend check marks only;
  - friends lists are read only on the user's click;
  - the keeper's triggers, and its polling only in the menu and from match point on.
- **CS2, GSI and Steam's files** ([05](spec/05-cs2-gsi-and-local-steam.md)):
  - every log line kind parses, and a reused PID is not the old one;
  - a Steam start clears what it tracked;
  - the log answers only once it has shown CS2, and is dropped for the run when GSI contradicts it;
  - GSI freshness ends at a logged close;
  - the restart badge shows only while a CS2 opened before the app runs;
  - the cfg is written only when its content changes;
  - the endpoint refuses a wrong token;
  - the port falls back when taken.
- **Steam Web API** ([06](spec/06-steam-web-api.md)):
  - chunks of 100 ids, the rest of a batch is not sent after 429, 401, 403 or 5xx, and a failed id stays unanswered rather than "no account";
  - in-flight requests are deduplicated, with the short cache;
  - the timeout;
  - a rejected credential pauses requests;
  - rich presence parsing and the Prime sign.
- **Account and friends** ([02](spec/02-account-and-friends.md)):
  - SteamID, key and token validation, and token expiry;
  - a paste replaces the field;
  - credentials are saved encrypted;
  - the startup refresh and the auto-refresh, with none while the window is minimized and one at once on restore;
  - fake friends added and removed (two clicks);
  - private and empty friends lists;
  - names from Steam are escaped.
- **Shell, security and updates** ([07](spec/07-ui-shell-security-and-updates.md)):
  - CSP;
  - only allowed external links open, and the window never navigates;
  - permission requests are denied except the needed ones;
  - the update states (check at start, every four hours and on a click on the version; download and install only at the user's click);
  - fonts load, and no shown character lacks a glyph (Cyrillic aside);
  - no emoji anywhere;
  - plurals in both languages.

## The UI checklist from PR #16

Never run as a whole on 0.x; in 1.0 these are end-to-end tests:

1. Cancel from the join bar ends the attempt and repaints its row.
2. The CS2 launch overlay: Launch starts CS2 and waits for its menu, and Close dismisses it with no join.
3. The tutorial runs from start to end on mock data, pauses the auto-refresh, and restores it.
4. Switching the language with the launch overlay up re-renders the overlay in the new language.

## Fixtures and anonymisation

- Recorded data from the owner's journal, logs or Steam answers must be anonymised before it is committed:
  - Steam IDs, server ids and account ids inside connect tokens are replaced by stable fake values;
  - names are dropped;
  - IP addresses are removed.
- Keep the real timing (milliseconds between records). Timing is what the tests are about.
- The 0.9.7 replay fixture already uses made-up player ids (`7656119800000xxxx`). Its server ids are real but transient ids of Valve's anonymous game servers, which identify no person.

## In-game checks still open

Carried over from 0.9.7 and still unverified there:

- A join waiting for a slot, then CS2 closed: the journal should show `cs2-closed` within about a second of Steam logging the exit, with no connect after it.
- Whether GSI in casual carries `map.team_ct.score` and `map.team_t.score`. The keeper's match-point polling depends on it.
- The token rule of 0.9.4 in real joins: the journal's `connect.why`, `skip` and `steam-log` records.
- The "CS2 уже запущен" overlay, the "Prime?" tag, Maps polling while minimized, the restart badge on a first install.
- When Steam writes the coplay file (`config\coplay_<steamid64>.vdf`): during play, on leaving a server, or only after CS2 exits. It was last written 38 s after CS2 closed on 2026-11-06. The coplay candidates must work either way (see [04](spec/04-maps.md)).
