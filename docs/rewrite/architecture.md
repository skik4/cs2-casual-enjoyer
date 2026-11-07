# Architecture proposal for 1.0

The owner chose the platform on 2026-11-07: Tauri 2. The rest is a proposal for the rewrite session to refine with the owner.

## Platform

**Chosen: Tauri 2, with a Rust core and a web UI in TypeScript.** The reasons it was recommended:

- The UI stays HTML and CSS, so the Steam look, the fonts and the translations carry over.
- All logic runs in the Rust core: joins, the map finder, the Steam client, GSI and Steam's logs. The window only shows state. A web page covered by fullscreen CS2 gets its timers slowed, and Tauri on Windows has no switch against that. Its `backgroundThrottling` option is unsupported on Windows per a mirror of its docs. In this design nothing time-critical runs in the page.
- The installer weighs a few megabytes instead of 116, because the page is shown by the WebView2 that comes with Windows. Tauri ships its own NSIS bundler, and an updater with signed updates that needs a free signing key, not code signing.
- Costs:
  - Rust is harder for the owner to read than JS.
  - Building needs Rust and Visual Studio's C++ tools; neither was installed on the owner's PC on 2026-11-07, while WebView2 157 was.
  - WebView2 updates with Edge, not with the app.
  - Moving users from 0.9 needs a bridging release (see [migration](migration.md)).

**Not chosen: Electron from scratch, in TypeScript.** The same layers, with the core in the main process or a utility process, where timers are not slowed either. Familiar and low risk, but the installer and memory stay as they are.

Advised against as well:

- .NET (WPF, WinUI, Avalonia): the UI would be redrawn in XAML;
- native Rust GUIs (egui, iced, Slint): Steam's look, overlays and the tutorial are hard to build there;
- Wails (Go and WebView2): a smaller ecosystem and no built-in updater.

## Principles

- **The core has no I/O.** It takes events and the current time, and returns state and commands. It can be tested without Steam, CS2, files or clocks.
- **One answer per fact.** Each fact has one owner module, and everything else asks it:
  - whether CS2 is open;
  - what CS2 is doing;
  - where the user is;
  - which tokens were sent;
  - what the pool holds.
- **Signals over waits.** Time enters the core only through an injected clock and a scheduler. Every timeout is a named constant with its reason and its measurement.
- **Typed contracts.** The core's events, commands and state snapshots are typed and versioned. The UI gets snapshots, not internals.
- **Errors are values.** "Steam could not be asked" is an answer of its own, different from "not in CS2" or "no account". The 0.x code keeps this distinction everywhere, and it must survive.
- **The journal is a feature.** Every join attempt keeps writing the journal. Its records are the evidence for future rules, and the replay tests are built from it.

## Layers

```
UI (TypeScript)           views, i18n, styles, tutorial; renders snapshots, sends user commands
  |  typed commands / events
Shell                     the desktop host: window, tray-less lifecycle, IPC wiring, permissions
  |
Core (no I/O)             user state, join engine, map finder, keeper, polling planner, settings model
  |  ports (traits / interfaces)
Adapters                  Steam Web API, GSI endpoint and cfg, Steam's files, stores, URL opener, updater, window state
```

### Core

- **User state.** It merges three things:

  - CS2 open or closed, from Steam's game log;
  - CS2's own game state from GSI: menu, match, map, mode, phase, score, observed player, listed players;
  - Steam's presence of the user: server id, Steam's map and score.

  The precedence is that of 0.9.7. The log decides open or closed; GSI decides what CS2 does while fresh, and its freshness ends when the log shows CS2 closed; Steam's presence stands in only where neither can tell, and gives the server id. See [05](spec/05-cs2-gsi-and-local-steam.md).

- **Join engine.** One state machine per attempt.
  - It reads a Steam snapshot of the user and the target each iteration, and the user state.
  - It shares a registry of tokens already sent or skipped, and an own-arrival detector fed by Steam's "Game server change" lines.
  - It returns commands: open a join URL, set a status, write a journal record.
  - Cancellation must be explicit and checked after every awaited step. In 0.9.7 that is the `alive()` check.
  - See [03](spec/03-joining.md).
- **Map finder.**
  - Sources: friends, seeds, the pool, friends of pool players, friends of friends, and coplay candidates (new in 1.0).
  - It decides which ids each round polls, builds servers from presence (official signature, scores, match over, free slots, Prime), applies the pool rule, TTLs and caps, and runs the friend check.
  - See [04](spec/04-maps.md).
- **Keeper.** Pinned maps; the trigger to join when a match ends or lands on a map not pinned; when it needs fresh servers.
- **Polling planner.** One place decides what may ask Steam and when. In 0.9.7 this is scattered over the friends refresh, the map finder's needs and the join loops. It takes into account:
  - who needs data: an open view, a running join, pinned maps;
  - window state: minimized, focused;
  - whether CS2 is open;
  - credential state: rejected or missing.
- **Settings model.** The credential, SteamID, friends, fake friends, language and Maps options, with validation: SteamID64, key or token format, token expiry.

### Adapters

- **Steam Web API client.**
  - Requests are batched by 100 ids, deduplicated while in flight and cached for a short time; each has a timeout.
  - HTTP failures are classified, and a rejected credential pauses requests.
  - See [06](spec/06-steam-web-api.md).
- **GSI.** A local HTTP endpoint on 127.0.0.1 that checks the token; a store of token and port that stay stable across runs, so a running CS2 keeps its cfg; the cfg writer; the CS2 locator (registry, `libraryfolders.vdf`).
- **Steam's files.**
  - The game log reader reads back its end at start, then looks at the file's size once a second, since Windows reports nothing while Steam keeps it open.
  - The coplay reader parses binary KeyValues (new in 1.0).
- **Stores.**
  - Settings in JSON, with the credentials encrypted by DPAPI.
  - The map finder's store: pool, friends of pool players, friends of friends, Prime marks, friend lists checked.
  - The join journal: append-only, with rotation.
- **Steam URL opener**: `steam://rungame/730/<steamid>/<connect>` for joins, `steam://run/730` for launching. Only validated connect strings get through.
- **Updater**: GitHub releases, a check at start, every four hours and at the user's click; the download only at the user's click.
- **Window state**: minimized and focused.

### UI

- Views:
  - the account panel;
  - Friends, Fake friends and Maps tabs;
  - the join bar;
  - the footer: version, update notice and the GSI indicator;
  - the CS2 launch overlay;
  - notifications;
  - the tutorial, with mock data.
- Templating escapes by default. 0.x builds HTML strings and must remember `escapeHtml` for every name from Steam.
- Styles: tokens from Steam's `sp.css`, one long-button size and one square-button size, Motiva Sans with Russian in Arial, drawn icons. See [07](spec/07-ui-shell-security-and-updates.md).

## Time, concurrency and testing

- The core uses an injected clock. In Rust, Tokio's paused test clock gives what Jest's fake timers give the 0.x tests: whole minutes run in milliseconds, deterministically.
- Join attempts run concurrently, and two of them may meet the same token. 0.x guards this with a token registry that is checked again after its last await before a connect. Keep that ordering, or serialize connects through one actor.
- Adapters are tested against fakes and recorded data. The core is tested by unit tests and by replaying the journal fixtures. See [test plan](test-plan.md).

## Repository layout

With Tauri:

```
core/          Rust crate: domain logic, no I/O, no Tauri
adapters/      Rust crate: Steam client, GSI, Steam files, stores, opener, updater glue
app/           Tauri app: commands, events, wiring, capabilities (permissions), bundling
ui/            TypeScript + Vite: views, i18n, styles, tutorial; tests with mocked IPC
docs/          this specification, carried over and kept current
fixtures/      journal replays and recorded payloads, anonymised
```

With Electron, the same split under `src/core`, `src/adapters`, `src/main` and `src/ui`, in TypeScript.

## Where 0.9.7 modules go

- `src/game/join-manager.js`, `join-journal.js` go to the core's join engine, plus the journal adapter.
- `src/game/map-finder.js`, `map-keeper.js` go to the core's map finder and keeper.
- `src/game/gsi-manager.js`, `cs2-process.js`, `user-location.js`, `cs2-manager.js` become the core's user state, plus the launch command.
- `src/steam/*` becomes the Steam Web API adapter, with the rich presence parsing in the core.
- `src/main/gsi-*.js`, `cs2-locator.js` become the GSI adapter and the CS2 locator.
- `src/main/steam-game-log.js` becomes the Steam files adapter.
- `src/main/settings-store.js`, `map-finder-store.js`, `join-journal-file.js` become the stores.
- `src/main/app-updater.js` becomes the updater adapter.
- `src/core/app-*.js`, `window-state.js` go partly to the polling planner and partly to the UI's state store.
- `src/ui/*`, `css/*`, `src/i18n/*`, `index.html` become the UI.
- `src/main/main.js`, `preload.cjs`, `permissions.js`, `external-links.js` become the shell.
