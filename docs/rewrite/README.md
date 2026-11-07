# Rewrite to 1.0: start here

This folder holds everything a new session needs to rewrite CS2 Casual Enjoyer from scratch as version 1.0.0, without losing any behaviour the 0.x app learned the hard way. Notes kept by earlier sessions were tied to the old repository's folder and will not follow a session into a new one. What mattered from them is written down here.

## State of the old app

- Version 0.9.7, released 2026-11-07 from commit `4f1b311` of `skik4/cs2-casual-enjoyer`, branch `master`, the only branch.
- Electron 45, plain JavaScript, about 17,000 lines in 75 files, 829 Jest tests in 63 files. ESLint and Prettier are clean.
- The owner's view: the code holds junk and hacks, and the architecture drifted. Much of what looks like a hack, though, is measured behaviour. That is why this specification exists.

## Read in this order

1. [working-rules.md](working-rules.md): how the owner wants work done. It becomes the new repository's `CLAUDE.md`.
2. [spec/01-overview.md](spec/01-overview.md): what the app does, the glossary, cross-cutting requirements and the owner's decisions.
3. The area specifications:

   - [02 Account and friends](spec/02-account-and-friends.md)
   - [03 Joining](spec/03-joining.md)
   - [04 Maps](spec/04-maps.md)
   - [05 CS2, GSI and Steam on this computer](spec/05-cs2-gsi-and-local-steam.md)
   - [06 Steam Web API](spec/06-steam-web-api.md)
   - [07 UI shell, security and updates](spec/07-ui-shell-security-and-updates.md)
   - [08 Coplay candidates](spec/08-coplay-candidates.md): the new pool source planned for 1.0

   Each one has rules with reasons, data kept, `path:line` references into the 0.9.7 code, and its smells and open questions.

4. [architecture.md](architecture.md): the proposed layers and platform.
5. [test-plan.md](test-plan.md): test levels, must-have cases, the UI checklist, open in-game checks.
6. [migration.md](migration.md): bringing 0.9 users over with their data.

The old repository stays the reference: its code (the `path:line` references point at commit `4f1b311`), its tests as a catalogue of cases, and `CHANGELOG.md` for the history of every behaviour.

## Decided

- 1.0.0 is written from this specification, with tests from it, in a clean repository.
- The coplay candidates are a 1.0 feature and are not built into 0.9. Steam's "recently played with" list becomes a source for the pool.
- The UI checklist of PR #16 becomes end-to-end tests of 1.0.

## For the owner to decide first

1. **Platform.**
   - Tauri 2 with a Rust core: recommended, see [architecture.md](architecture.md).
   - Electron from scratch in TypeScript.
   - A small trial project can settle it: one window in the app's style and a core that reads Steam's game log and shows whether CS2 is open, with its installer.
2. **Repository.** A new one, or the same `skik4/cs2-casual-enjoyer` with a fresh history. The old updater only sees the old repository's releases, see [migration.md](migration.md).
3. **Product name, app identifier and install folder.**
4. **Whether 1.0 removes 0.9 by itself.**

## First steps of the rewrite session

1. Confirm the decisions above with the owner.
2. **Tools**, with the owner's OK; installers ask for administrator rights, so the owner must be at the PC.
   - For Tauri: Rust through rustup, with the MSVC toolchain, and Visual Studio Build Tools with the C++ workload. WebView2 157 is already installed.
   - Node.js 24 is installed, for the UI tooling.
3. **Repository.**
   - Create it with the layout in [architecture.md](architecture.md).
   - Copy this folder in as `docs/`, and `working-rules.md` as `CLAUDE.md`.
   - Add the anonymised fixtures (see [test-plan.md](test-plan.md)).
4. **Build in this order**, each part with its tests:
   1. settings model and stores;
   2. the Steam Web API adapter;
   3. user state: Steam's game log, GSI, the user's presence;
   4. the join engine, with the replay tests;
   5. the map finder and keeper;
   6. the UI;
   7. updates;
   8. migration;
   9. packaging.
5. Before release, run the in-game checks with the owner, and the whole 0.9.7 to 1.0 update path on a spare Windows user.

## Data that stays local

- The owner's real data in `%APPDATA%\cs2-casual-enjoyer` stays on the owner's PC: settings, the pool and the join journal from 2026-10-25 on. A session may read it there with the owner's OK, for analysis or to make fixtures. It must not be committed raw: the journal holds other players' ids and the owner's playing times. See [test-plan.md](test-plan.md) for anonymising.

## Environment of the owner's PC

As seen on 2026-11-07:

- Windows 11 Pro.
- PowerShell and Git Bash; Node.js 24.
- Steam in its default folder; CS2 in a Steam library on another drive.
- The owner often works over Remote Control. A session started from there cannot start other sessions.
