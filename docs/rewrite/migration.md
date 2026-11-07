# Moving users from 0.9 to 1.0

Users of 0.9.x should land on 1.0 by themselves, with their settings, their key, their friends and their pool, and without having to restart CS2 for GSI.

## What 0.9.x leaves on a machine

- **The app.** A per-user NSIS install with an uninstall entry under HKCU, made by electron-builder, product name "Casual Enjoyer". It updates through electron-updater from the GitHub releases of `skik4/cs2-casual-enjoyer`. On each release it reads `latest.yml` and downloads the setup `.exe` with its `.blockmap`.
- **Data in `%APPDATA%\cs2-casual-enjoyer`**, kept on uninstall:
  - `settings.json`. The field list and its handling are in [02](spec/02-account-and-friends.md) and [07](spec/07-ui-shell-security-and-updates.md).
    - Two fields are credentials: `auth`, the token or key, and `fof_api_key`, the key kept for reading friends lists. On disk each is `{"encrypted": "<base64>"}`; a plain string is an older, unencrypted value.
    - The ciphertext is Electron's safeStorage. On Windows that is AES-256-GCM: the value starts with `v10`, then the nonce, the ciphertext and the tag.
    - The AES key is wrapped by DPAPI for the Windows user and stored in Electron's `Local State` file in the same folder.
    - Code outside Electron can read it: unwrap the key with DPAPI, then decrypt with AES-GCM. This was done read-only during research on 2026-11-04.
  - `gsi.json`: the GSI token and port. CS2 keeps using the cfg it read at its start, so these must stay the same, or a running CS2 stops posting until it is restarted.
  - `map-finder.json`: the pool, friends of pool players, friends of friends, Prime marks and friends lists checked, version 1. See [04](spec/04-maps.md).
  - `join-journal.log` and `join-journal.log.old`: the journal, rotated at 5 MB.
  - Chromium's own folders (cache, Local Storage and the rest). Local Storage holds small UI flags such as the hidden privacy warning.
- **In CS2's folder**: `game\csgo\cfg\gamestate_integration_casualenjoyer.cfg`, which names the endpoint and token.

## What 1.0 must do on its first start

1. Use the same data folder, or import from it once. Simplest: point 1.0's data directory at `%APPDATA%\cs2-casual-enjoyer`. In Tauri the default is a folder named after the app identifier, so this has to be set on purpose.
2. Read `settings.json`.
   - Decrypt `auth` and `fof_api_key` the 0.x way.
   - A token in `auth` may be skipped, since it expires within a day anyway. A key in either field must come over.
   - Re-save everything in 1.0's own format.
3. Keep `gsi.json`'s token and port, and write the cfg only if its content differs. With the same token and port the content is the same, so a running CS2 keeps posting.
4. Import `map-finder.json` version 1.
5. Start a new journal, or keep appending to the old one: the record format should stay readable by the same analysis.

## Getting users from the old updater to 1.0

electron-updater in 0.9.x only knows the releases of `skik4/cs2-casual-enjoyer` and runs the `.exe` named in `latest.yml`. Options:

- **Same repository.** 1.0 is published there as the next release, with a `latest.yml` the old updater understands. Its `.exe` is the new installer.
  - What has to be checked is what happens when electron-updater runs a Tauri NSIS installer. It passes its own silent-install arguments and restarts the app.
  - Expect the new app to be installed beside the old one, since the product registry keys differ. 1.0 should then remove 0.9 through its uninstall entry, keeping the data folder.
- **New repository.** A last 0.9.x release in the old repository has to bring users over: a bridging updater, or at least a footer notice with a link. The old repository's latest release keeps pointing there.
- In both cases test the whole path on a spare Windows user before publishing:
  - a 0.9.7 install;
  - its update offer;
  - the switch;
  - the first start of 1.0 with the imported data;
  - CS2 still posting without a restart.

## Decisions this needs from the owner

- Same repository with a fresh history (for example a new default branch), or a new repository. The release history and the updater URL stay with the old one.
- Product name, app identifier and install folder of 1.0.
- Whether 1.0 removes 0.9 by itself.
