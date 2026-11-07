# 01. Overview

CS2 Casual Enjoyer ("Casual Enjoyer") is a Windows app for Counter-Strike 2's casual mode. Version 0.9.7 is the state these documents describe; version 1.0.0 is to be written from them.

## What it does

- **Joins a friend's casual match the moment a slot frees up.** A friend's join link in Steam appears, or is renewed, when someone arrives or leaves their server. It may hang on after the place is taken. The app watches the link and sends CS2 to every new one at once, so the user does not have to keep clicking Join Game in Steam (see [03](03-joining.md)).
- **Finds official casual servers by map.** It reads the Steam presence of other players: the user's friends, players of the user's own matches (the pool), their friends, and friends of friends. From this it lists which official servers play which map, with scores, free slots and signs of Prime. A server or a whole map can be joined the same way as a friend.
- **Keeps the user on chosen maps.** Pinned maps are rejoined by themselves when the user's match ends or lands on another map.
- **Knows the user's own game.** Through CS2's Game State Integration (GSI) and Steam's own files it knows whether CS2 is open, and whether the user is in the menu or in a match, on which map and mode. It never pulls the user out of a match that must not be left.
- **Updates itself** from GitHub releases, at the user's click.
- **Speaks Russian and English.**

## Who uses it and what they need

- CS2 players on Windows 10 or 11 (x64), with Steam and CS2 installed.
- A Steam web token, which is the day's `webapi_token` from Steam's store page and lives about 24 hours, or a Steam Web API key. The key also reads other players' friends lists.
- Nothing else. No CS2 launch option, no second account, no login of the app into Steam (see [working rules](../working-rules.md)).

## What it must never do

- Tamper with CS2 or its memory (VAC).
- Ask players for setup beyond the token or key.
- Pull the user out of a competitive, Premier, Wingman or other protected match.
- Start CS2 again after the user closed it.
- Contact anything but the Steam Web API, Steam's own sites the user opens (the token page), and GitHub for updates. No telemetry.

## Glossary

- **Casual**: CS2's casual mode on Valve's servers. A match ends when a side wins 8 rounds, or after round 15 (from the join journal; the constant is `CASUAL_ROUNDS_TO_WIN`).
- **Official server**: one of Valve's matchmaking servers. Recognised by the signature described in [06](06-steam-web-api.md) and [04](04-maps.md).
- **Connect string, join token**: the `connect` value of a player's rich presence. `+gcconnect` plus 24 hex digits joins that player's server; the middle 8 digits are the player's account id. `G…` joins a lobby, `L…` a local server.
- **Join attempt**: one running loop for one target: a friend, a map, a server or the pinned maps.
- **GSI**: CS2's Game State Integration. CS2 posts its state to a local HTTP endpoint named in a cfg file the app writes into CS2's folder.
- **Steam's game log**: `logs\gameprocess_log.txt` in the Steam folder. Steam notes there each game process starting and ending, and each change of game server. It needs no setup.
- **Seeds**: players CS2 lists in its GSI state: the player the user spectates, or everyone, when CS2 lists them.
- **Pool**: players of the user's own casual matches, kept 14 days after last seen.
- **Friends of pool players**, **friends of friends (FoF)**: extra sources for the map list, read with an API key on the user's click. They never join the pool.
- **Prime sign**: evidence that a player has Prime, such as a Premier sighting or an XP trail. A server's Prime mark is a likelihood, not proof (see [04](04-maps.md)).
- **Fake friends**: Steam IDs the user adds by hand, polled like friends.
- **Join journal**: `join-journal.log` in the app's data folder, JSON lines about every join attempt, for analysis.

## Cross-cutting requirements

- **Keep pace behind CS2.** The join loop asks Steam about once every 0.5 s: about 0.3 s per request plus a 0.2 s pause. It must keep that pace while fullscreen CS2 covers the window, which is exactly when joining happens. On 2026-11-03 a covered Chromium page with default settings stretched 200 ms pauses to 1000 ms. After 5 minutes hidden it woke about once a minute.
- **Signals over waits.** See [working rules](../working-rules.md). Every remaining timeout is named and explained where it is defined.
- **Request budget**, as of 0.9.7:
  - The friends list costs one request every 3 s, and none while the window is minimized.
  - Maps cost up to 30 requests every 30 s, only while needed.
  - Each running join costs about two requests a second.
  - The Web API key is limited to 100,000 calls a day by Steam's terms. No limit is published for the token.
- **Credentials stay local and encrypted** with the operating system's facilities. They are sent only to Steam.
- **The window never navigates away.** Only allowed external links open, in the OS.
- **Data lives in `%APPDATA%\cs2-casual-enjoyer`**. Uninstalling keeps it.

## The rest of the specification

- [02 Account and friends](02-account-and-friends.md)
- [03 Joining](03-joining.md)
- [04 Maps](04-maps.md)
- [05 CS2, GSI and Steam on this computer](05-cs2-gsi-and-local-steam.md)
- [06 Steam Web API](06-steam-web-api.md)
- [07 UI shell, security and updates](07-ui-shell-security-and-updates.md)
- [08 Coplay candidates](08-coplay-candidates.md), new in 1.0

Each area document gives the rules with their reasons, the data kept, `path:line` references into the 0.9.7 code, and its smells and open questions.

## Decisions log

The owner's decisions that shaped the app. Areas documents hold the details.

- **2026-10-25**
  - Maps UI: a list of maps, each with its own Join; a map expands into its servers with scores.
  - No automatic "best server or wait" button. Community servers are not wanted.
  - Every join attempt is logged to the join journal.
- **2026-10-26 to 10-30**
  - Reading CS2's console log was built and then removed, because it needs a launch option.
- **2026-10-30**
  - Official servers are recognised from rich presence alone. The server address check was dropped, because Steam stopped listing addresses for anonymous servers between 10-27 and 10-29 and might change them again.
  - Seeds are taken only while the user's own match is casual.
- **2026-11-03**
  - A casual server whose match is over (8 rounds) is not joinable.
  - The user's own server is shown but blocked ("вы здесь", "вы вместе"), not hidden.
  - "Keep the map": pinned maps rejoin at match end. The trigger is the match ending, kept for speed, rather than waiting 14 to 24 s for the next map.
  - The compact, friends-list-like UI variant was kept.
- **2026-11-04 to 11-05**
  - Prime: a mark on servers and maps, and a "Prime only" filter. The friend check is a mark only and never excludes.
  - Friends lists are read only on the user's click, since each list is a request on the key.
  - Steam's fonts. No emoji.
- **2026-11-06**
  - The join token rule: connect on any token not yet sent, never resend one, skip the user's own arrival as Steam's game log shows it. Without the log, connect on every new token: "легче закрыть окно что сервер полон чем пропустить место".
  - Updates are downloaded only at the user's click.
  - QR login and window automation for the token were declined.
  - Motiva Sans with Russian in Arial, "как у Steam".
- **2026-11-07**
  - The pool holds only players of the user's own casual matches. There is no in-app cleanup of old pools.
  - One answer to whether CS2 is open, from Steam's game log. GSI says what CS2 is doing.
  - Fewer requests while nobody can use them.
  - For 1.0: the coplay candidates (Steam's "recently played with" list) become a pool source, and the PR #16 UI checklist becomes tests.
  - 1.0 is a rewrite from a specification, on Tauri 2, in the same repository rebuilt from scratch with a fresh history. 0.x is kept in the branch `legacy/electron`, its tags and a local backup. The Python versions of 2024 are not kept.
