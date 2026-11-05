# Casual Enjoyer

A Windows app for Counter-Strike 2 Casual. It joins a friend's match the moment a slot frees up, and finds Valve's official casual servers by map, so you can pick the map instead of taking what matchmaking gives you.

Steam has no way to wait for a free slot in a friend's Casual match, and the slots it shows may be out of date. Casual Enjoyer follows the match through the Steam Web API and connects as soon as there is room.

## Download

Get `Casual-Enjoyer-Setup-<version>.exe` from [Releases](https://github.com/skik4/cs2-casual-enjoyer/releases/latest) and run it. Installing for yourself alone needs no administrator rights. The installer is not signed, so Windows may warn about an unrecognized app on the first install: choose "More info", then "Run anyway".

The app keeps itself up to date from the same page. A new version downloads in the background, and "Update … is ready — restart" in the footer installs it; without a click it goes in when you close the app.

## Features

- **Friends**: join a friend in Casual or Deathmatch. The app sends a connect only when the friend's status changes, says when the server is full, and stops rather than pull you out of a match of another mode (Competitive, Premier, Wingman).
- **Maps**: official casual servers by map, found through other players: your friends, players seen on official servers before, their friends and friends of friends (read with an API key when you ask), and the players of your own matches. Join any server of a map or a chosen one. Pin maps, and the app rejoins one of them when a match ends. "Prime only" keeps to servers where a player shows a sign of Prime (CS2 XP or a Premier match).
- **Fake friends**: join any Steam ID like a friend.
- **CS2 Game State Integration**: CS2 reports your own state (menu, match, mode, map) to the app directly. The app writes its config into CS2's `game/csgo/cfg` folder; restart CS2 once after the first start.
- English and Russian.

## Getting started

1. Connect to Steam in the panel at the top, with either:
   - a **token** (recommended): open the token page in Steam, copy everything and paste it. A token lasts about 24 hours;
   - a **Web API key**: it does not expire, but your friends list must be public once, so the app can store it.
2. Click **Load friends**.
3. Click **Join** next to a friend, or open **Maps**.

Everything stays on your computer. The token and the key are encrypted with Windows' own keys. Every join attempt is written to `%APPDATA%\cs2-casual-enjoyer\join-journal.log` (kept under 10 MB) to help with troubleshooting.

## Building from source

Requires [Node.js](https://nodejs.org/) 22.12 or newer.

```sh
git clone https://github.com/skik4/cs2-casual-enjoyer.git
cd cs2-casual-enjoyer
npm install
npm start
```

The first `npm start` downloads Electron itself, about 150 MB.

| Command        | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| `npm test`     | Runs the Jest tests                                                 |
| `npm run lint` | Runs ESLint                                                         |
| `npm run dist` | Builds the installer, its `.blockmap` and `latest.yml` into `dist/` |

### Releasing an update

1. Raise `version` in `package.json`.
2. Run `npm run dist`.
3. Publish a GitHub release tagged `v<version>` with `Casual-Enjoyer-Setup-<version>.exe`, its `.blockmap` and `latest.yml`. Installed apps take the latest published release; drafts and pre-releases are skipped.

## License

[MIT](LICENSE). Bugs and ideas go to [Issues](https://github.com/skik4/cs2-casual-enjoyer/issues); see [CONTRIBUTING](CONTRIBUTING.md).
