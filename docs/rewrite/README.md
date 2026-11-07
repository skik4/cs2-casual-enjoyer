# Rewrite to 1.0: start here

This folder holds everything a new session needs to rewrite CS2 Casual Enjoyer from scratch as version 1.0.0, without losing any behaviour the 0.x app learned the hard way. Notes kept by earlier sessions were tied to the old working folder and will not follow a session into a new one. What mattered from them is written down here.

## State of the old app

- Version 0.9.7, released 2026-11-07 from commit `4f1b311` of `skik4/cs2-casual-enjoyer`.
- Electron 45, plain JavaScript, about 17,000 lines in 75 files, 829 Jest tests in 63 files. ESLint and Prettier are clean.
- The owner's view: the code holds junk and hacks, and the architecture drifted. Much of what looks like a hack, though, is measured behaviour. That is why this specification exists.

## Read in this order

1. [working-rules.md](working-rules.md): how the owner wants work done. It becomes the new tree's `CLAUDE.md`.
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

4. [architecture.md](architecture.md): the layers on Tauri 2.
5. [test-plan.md](test-plan.md): test levels, must-have cases, the UI checklist, open in-game checks.
6. [migration.md](migration.md): bringing 0.9 users over with their data.

The 0.x code stays the reference. The `path:line` references point at commit `4f1b311`; later 0.x commits changed only documents. Use:

- its tests, as a catalogue of cases;
- `CHANGELOG.md`, for the history of every behaviour.

## Decided by the owner, 2026-11-07

- 1.0.0 is written from this specification, with tests from it.
- **Platform: Tauri 2**, with a Rust core and a web UI in TypeScript.
- **Repository: the same `skik4/cs2-casual-enjoyer`, rebuilt from scratch with a fresh history.** Its releases go on, so the 0.9 updater sees 1.0 (see [migration.md](migration.md)).
- **0.x is backed up**:
  - on GitHub, in the branch `legacy/electron` at the last 0.x commit, and in the tags `v0.3.0` to `v0.9.7` with their releases;
  - on the owner's PC, in `D:\Repository\my_projects\backups\cs2-casual-enjoyer-electron\`: a git bundle of every branch and tag, and the local files git ignores, such as `dev-scripts` and the release helpers;
  - and in the old working folder `D:\Repository\my_projects\GitHub\cs2-casual-enjoyer-electron`, which stays.
- Only the Electron app matters. The Python versions of 2024 are not kept.
- The coplay candidates are a 1.0 feature and are not built into 0.9. Steam's "recently played with" list becomes a source for the pool.
- The UI checklist of PR #16 becomes end-to-end tests of 1.0.

## For the owner to decide first

1. **How to rebuild the repository.**
   - Recommended: work on a new orphan branch, for example `v1`, in a fresh clone, and make it `master` at the 1.0 release. Until then the repository's page keeps showing the working 0.9.7.
   - The other way: replace `master` with the new history at once.
   - Either way, replacing `master` rewrites GitHub's history. Do it only on the owner's explicit word, after checking that `legacy/electron` and the tags are on GitHub.
2. **Product name, app identifier and install folder.** The repository keeps its name. A rename on GitHub keeps redirects, but whether the 0.9 updater follows them would have to be checked first.
3. **Whether 1.0 removes 0.9 by itself.**

## First steps of the rewrite session

1. Confirm the decisions above with the owner.
2. **Tools.** Installed on 2026-11-07 at the owner's word; check they are still there.
   - Visual Studio 2022 Build Tools 17.14 with the C++ workload: MSVC 14.44, Windows SDK 10.0.26100. Installed with `winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--passive --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`. It asks for administrator rights.
   - Rust through rustup 1.29.3: rustc and cargo 1.99.1, default toolchain `stable-x86_64-pc-windows-msvc`, cargo in the user's PATH. Installed with `winget install --id Rustlang.Rustup -e`, after the Build Tools, so rustup did not offer its own Visual Studio.
   - Checked: a release build of a small program with a crates.io dependency linked and ran.
   - Already there before: WebView2 157, Node.js 24 with npm 11, Git, winget 1.29.
   - The Tauri CLI comes as a dev dependency of the project; nothing global is needed.
   - A shell opened before the install does not see the new PATH yet; open a new one, or call `%USERPROFILE%\.cargo\bin\cargo.exe` directly.
3. **Working tree.**
   - Clone `skik4/cs2-casual-enjoyer` into a new folder, then start the fresh history (step 1 of the decisions).
   - Give it the layout in [architecture.md](architecture.md).
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

- The owner's real data in `%APPDATA%\cs2-casual-enjoyer` stays on the owner's PC: settings, the pool and the join journal from 2026-10-25 on.
  - A session may read it there with the owner's OK, for analysis or to make fixtures.
  - It must not be committed raw: the journal holds other players' ids and the owner's playing times. See [test-plan.md](test-plan.md) for anonymising.
- The tool that turned journal records into the replay fixture is `dev-scripts/journal-to-replays.cjs` in the old working folder. It is ignored by git and kept in the local backup.

## Environment of the owner's PC

As seen on 2026-11-07:

- Windows 11 Pro.
- PowerShell and Git Bash; Node.js 24.
- Steam in its default folder; CS2 in a Steam library on another drive.
- The owner often works over Remote Control. A session started from there cannot start other sessions.
