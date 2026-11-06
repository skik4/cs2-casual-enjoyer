# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.5] - 2026-11-07

### Changed

- Updates stay in the footer. A newer version is offered with Install, which asks "Install update X? The app restarts" in the same place before anything downloads. After Yes, a bar shows the download with the megabytes in, and the app restarts into the new version as soon as it is in; a download that breaks off offers Retry. This shows from the update after the one that ships it.

## [0.9.4] - 2026-11-06

### Changed

- Joins follow the join tokens players show, no longer their status. A new token gets a connect at once, and a token already sent never goes out again, from any attempt: clicking Join again no longer resends one CS2 has just turned away, and a new score or map with the same token sends nothing.
- The user's own arrival renews the tokens of the players on that server. The app tells it apart by Steam's own log of the games it runs (`logs\gameprocess_log.txt`, written without any launch option), where Steam notes CS2 changing server before the tokens change. Without that log, or after a join it failed to note, every new token gets a connect: a "server full" message beats a missed slot.
- The join journal says why each connect went out and notes the tokens taken for the user's own arrival.

## [0.9.3] - 2026-11-06

### Changed

- Updates no longer download by themselves. The footer offers a new version, a click downloads it in the background, and a second click installs it; a download that breaks off is offered again. A downloaded version that no click installed still goes in when the app closes. This holds from the next update on: 0.9.2 and earlier download this one by themselves.

## [0.9.2] - 2026-11-06

### Added

- Maps: with an API key, the app checks the friends of players with a sign of Prime, a few players per refresh. The Prime tag's tooltip says whether such a player has no friends on the server, plays with friends who show a sign of Prime too, or with a friend who shows none. When every such player on a server sits with a friend without a sign of Prime, the tag dims to "Prime?". It is a mark only: "Prime only", the list and the joins work as before.

### Changed

- Electron 45, up from 36, which no longer gets security fixes. A token or key saved by an earlier version still reads. Building from source needs Node 22.12 or newer.
- The Maps tab stops polling Steam while the window is minimized, unless a map join or pinned maps need fresh servers.
- "Waiting for CS2" asks Steam first: while Steam shows CS2 running, it says the game is still loading instead of offering a launch.
- Buttons and links show a blue frame when reached with the keyboard, and none after a mouse click.

### Security

- Images load only from the app itself and Steam's avatar hosts.

## [0.9.1] - 2026-11-06

### Added

- Installer pages: install for you alone or for everyone, choose the folder, decide on desktop and Start menu shortcuts, and start the app from the finish page. The pages follow the system language, Russian or English. Updates still install silently.

## [0.9.0] - 2026-11-06

The first version that installs and keeps itself up to date. It was not published on GitHub; 0.9.1 was, with everything since 0.5.2 below.

### Added

- Installer and automatic updates from the GitHub releases. A newer version downloads in the background, and "Update … is ready — restart" in the footer installs it. Without a click it goes in when the app closes.
- Maps tab: official casual servers by map, found through other players:
  - the pool of players seen on official servers, their friends and friends of friends, read with an API key when you click Read lists;
  - the players of your own matches.
- Joining from the Maps tab: any server of a map or one chosen server; several maps can be pinned, and the app rejoins one of them when a match ends.
- Clearing the sources: each source has its own clear. The pool can be cleared of everyone or only of the players without a sign of Prime.
- "Prime only": players showing CS2 XP or a Premier match are remembered as Prime. Their servers get a Prime tag, and the map list and map joins can keep to such servers.
- CS2 Game State Integration: the app hears from CS2 directly. "Waiting for CS2" in the footer offers to launch the game.
- Fake friends: join any Steam ID like a friend.
- A local join journal of every attempt, for troubleshooting.
- An account bar with your Steam avatar, and step-by-step Steam setup.

### Changed

- A look modelled on Steam's own dialogs: one size per button kind, Steam's Motiva Sans typeface (Russian text in Arial, as in Steam), a greyscale icon so the app is not taken for the game, and no emoji. The help cards are restyled to match.
- Joining sends one connect per change in the target's status and says when the server is full and it waits for a slot. A reload of the same account keeps running joins. A join stops if you enter a match it must not interrupt.
- The Maps tab comes before Fake Friends.

### Security

- The Steam token and the API key are stored encrypted on disk.
- The Electron build is hardened with fuses.
- Only the app's own steam:// commands are opened, and browser permissions the page never needs are denied.
- External links are restricted, and player text is escaped.

### Fixed

- Steam requests give up after 10 seconds. A credential Steam turned down stops being polled, and a batch Steam refused is retried.
- Timers keep full speed while CS2 covers the window, so joins are not slowed down.
- Official servers are judged by rich presence alone, after Steam stopped listing their addresses.
- Finished matches are skipped, and the server you are on cannot be joined.

## [0.5.2] - 2025-08-18

### Added

- Russian interface, and switching between English and Russian without a restart.

### Changed

- Steam avatars load more reliably. API calls are cached and batched, and external links open through the system browser.
- The friends list, tutorial highlighting and notification texts were improved.

## [0.4.7] - 2025-06-15

### Changed

- Renamed from "CS2 Casual Enjoyer" to "Casual Enjoyer".
- A join is cancelled when you enter a competitive or Premier match.
- The join loop checks every 200 ms instead of 500 ms.

### Added

- The MIT License text, CONTRIBUTING.md and this changelog.

## [0.4.6] - 2024-06-11

### Added

- Links to the author's Steam and GitHub profiles in the footer.

### Changed

- The styles share one set of design tokens, and wide windows are laid out better.

## [0.4.5] - 2024-06-10

### Added

- A step-by-step tutorial that opens on the first start, with keyboard navigation (Enter, Backspace, Esc).

### Changed

- A redesigned interface with Material Design icons and smoother animations.
- The styles are split into modules without SCSS, and logging is structured.

## [0.4.0] - 2024-06-04

### Added

- Friends in Deathmatch can be joined as well as in Casual.
- CS2 is launched when it is not running at a join.

### Changed

- The code is split into separate managers and the Steam API into its own modules, and the app loads faster.

## [0.3.1] - 2024-06-04

### Changed

- Pending and blocked friends are no longer listed.
- Steam API calls are logged in one format, and unused code is removed.

## [0.3.0] - 2024-06-04

### Added

- The first release: a portable Windows app that joins a friend's Casual match as soon as a slot is free, with a Steam Web API key or token and live friend status.
