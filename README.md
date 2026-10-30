# Casual Enjoyer

**Casual Enjoyer** is an Electron-based desktop application that automates the process of joining a friend's **Casual** matches in Counter-Strike 2 (CS2). Steam does not provide a built-in feature for this in CS2, and the Steam client may show outdated or delayed information about available slots in a match. This app helps you connect to your friend's match as soon as a slot becomes available, improving your experience and saving time.

## ✨ Key Features

- **🎮 Casual Auto-Join**: Automatically join friends playing Casual as soon as a slot frees up
- **🎯 Interactive Tutorial System**: Comprehensive step-by-step tutorial for new users with automatic launch on first run
- **🚀 Smart CS2 Launch Integration**: Automatically launches CS2 if not running when trying to join a friend
- **🔄 Real-time Status Monitoring**: Live updates of friends' game status with visual status indicators
- **🔍 Advanced Friend Filtering**: Search and filter friends by nickname for easy navigation
- **🌟 Modern UI/UX**: Beautiful, responsive interface with Material Design icons and smooth animations
- **🔐 Flexible Authentication**: Support for both Steam API Keys and Session Tokens with privacy-friendly options

## How It Works

- The app uses Steam Web API requests to monitor your friends' match statuses in real-time.
- **Authentication Options**: Choose between a Steam API Key or Session Token (recommended) for authentication.
  - **Session Token** (Recommended): Valid for 24 hours, obtained through Steam client integration. No privacy restrictions required.
  - **API Key**: Permanent but requires your profile and friends list to be public at least once for initial setup.
- **Smart Connection Process**: After pressing "Join", the app continuously monitors for available slots. When found, it attempts to connect automatically. Another attempt goes out only once your friend's status changes, so a full server or a join still loading does not get repeated connects. A new join token alone does not count as a change: CS2 hands one out whenever a player arrives on the server, you included.
- **Join journal**: Every join attempt is written to `join-journal.log` in the app's data folder (`%APPDATA%\cs2-casual-enjoyer`): the connects sent, changes in your and the target's status, the states CS2 reports meanwhile, and what became of the players seen in your casual matches (added to the Maps pool, waiting for their server's address, or not visible). It stays on your computer and is kept under 10 MB.
- **Maps tab**: Picks a casual map on Valve's official servers. Valve publishes no server list, so the app finds people playing there: your friends, a pool of players it has seen on official servers before, players you spectate in your own casual matches (or everyone on the server, when CS2 lists them, which it has done at times while the user spectated), and friends of your friends (needs a Steam Web API key, which can be entered on the tab). Join on a map takes any of its servers with a free slot; expand the map to see each server with its score and join that one. Players seen in your own casual match are checked with Steam right away, whichever tab is open, while they are still on that server; only those whose game details Steam shows can join the pool, and a server that has just started may need a minute before Steam lists its address.
- **Fake Friends tab**: Steam IDs added by hand, with Join and a remove button (click it twice to remove).
- **CS2 Game State Integration**: On start the app writes `gamestate_integration_casualenjoyer.cfg` into CS2's `game/csgo/cfg` folder. CS2 then reports your own game state (main menu or match, mode, map) straight to the app on `127.0.0.1`, so the app reacts instantly and makes fewer Steam API requests. CS2 reads the file only at startup, so restart CS2 once after the first run. The footer says whether CS2 is connected; its tooltip explains the state. Friends' status still comes from the Steam Web API.
- **CS2 Integration**: If CS2 isn't running, the app can automatically launch it and wait for you to be ready before starting the join process.

## How to Run

The easiest way to use the application is to download the prebuilt `.exe` from the [Releases](https://github.com/skik4/cs2-casual-enjoyer-electron/releases) page and run it directly.  
**No installation of Node.js or other dependencies is required.**

## How to Use

1. **First Launch**: The app will automatically start with an interactive tutorial to guide you through all features
2. **Connect to Steam**: The "Connect to Steam" panel walks you through it: open the token page in Steam, copy everything and paste it; your SteamID is read from the token. "Token or API key: how to get one" explains both options. Once your friends are loaded, the panel folds into a one-line account bar with your Steam avatar and name and how long the token lasts; "Account" opens it again.
3. **Load Friends**: Click "Load friends"; the ↻ button in the account bar reloads them later
4. **Join Games**: Friends playing Casual are listed with their map and score - click "Join" to connect automatically, or "Wait for a slot" when their server is full
5. **Status Monitoring**: The label next to the score says what is going on: "free slot" or "no free slot" before you join, then "connecting…", "waiting for a slot" and "on the server ✓". The bar above the tabs shows the running attempt from any tab, with Cancel

### 🎯 Tutorial System

New users will see an interactive tutorial on first launch that covers:

- How to obtain Steam API credentials
- Friend list management
- Join process demonstration
- Status label meanings
- Keyboard shortcuts (Enter/Backspace/Esc for navigation)

You can restart the tutorial anytime by clicking the help button in the interface.

## Building from Source

If you want to build the application yourself:

### Requirements

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [Git](https://git-scm.com/) (optional, for cloning the repository)

### Installation

1. **Clone the repository:**

   ```sh
   git clone https://github.com/skik4/cs2-casual-enjoyer-electron.git
   cd cs2-casual-enjoyer-electron
   ```

2. **Install dependencies:**

   ```sh
   npm install
   ```

### Running in Development Mode

To start the application in development mode:

```sh
npm start
```

### Building the App

To build a portable version of the application for Windows:

```sh
npm run dist
```

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### What this means

- ✅ **Free to use** for personal and commercial purposes
- ✅ **Modify and distribute** as you wish
- ✅ **Include in other projects** without restrictions
- ⚠️ **No warranty provided** - use at your own risk
- 📝 **Attribution required** - keep the copyright notice

---

### 🔗 Links & Support

- **GitHub Repository**: [cs2-casual-enjoyer-electron](https://github.com/skik4/cs2-casual-enjoyer-electron)
- **Latest Releases**: [Download Page](https://github.com/skik4/cs2-casual-enjoyer-electron/releases)
- **Steam Profile**: [skik4](https://steamcommunity.com/id/skik4)
- **Issues & Bug Reports**: [GitHub Issues](https://github.com/skik4/cs2-casual-enjoyer-electron/issues)

### 👨‍💻 Created by skik4

If you find this tool useful, please consider:

- ⭐ Starring the repository
- 🐛 Reporting any issues you find
- 💬 Sharing with friends who play CS2
- 💡 Suggesting new features
