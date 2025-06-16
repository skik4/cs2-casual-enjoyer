# Casual Enjoyer

**Casual Enjoyer** is an Electron-based desktop application that automates the process of joining a friend's **Casual** or **Deathmatch** matches in Counter-Strike 2 (CS2). Steam does not provide a built-in feature for this in CS2, and the Steam client may show outdated or delayed information about available slots in a match. This app helps you connect to your friend's match as soon as a slot becomes available, improving your experience and saving time.

## ✨ Key Features

- **🎮 Dual Game Mode Support**: Automatically join friends playing in both Casual and Deathmatch modes
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
- **Smart Connection Process**: After pressing "Join", the app continuously monitors for available slots. When found, it attempts to connect automatically.
- **CS2 Integration**: If CS2 isn't running, the app can automatically launch it and wait for you to be ready before starting the join process.

## How to Run

The easiest way to use the application is to download the prebuilt `.exe` from the [Releases](https://github.com/skik4/cs2-casual-enjoyer-electron/releases) page and run it directly.  
**No installation of Node.js or other dependencies is required.**

## How to Use

1. **First Launch**: The app will automatically start with an interactive tutorial to guide you through all features
2. **Authentication Setup**:
   - Click on **"Steam Web API Token / Key"** label for detailed setup instructions
   - Choose between Session Token (recommended) or API Key
3. **Load Friends**: Click "Update Friends List" to fetch your Steam friends
4. **Join Games**: Friends playing Casual or Deathmatch will appear in the list - simply click "Join" to connect automatically
5. **Status Monitoring**:
   - 🔴 Red dot = No slots available
   - 🟡 Yellow dot = Attempting to connect
   - 🟢 Green dot = Successfully connected

### 🎯 Tutorial System

New users will see an interactive tutorial on first launch that covers:

- How to obtain Steam API credentials
- Friend list management
- Join process demonstration
- Status indicator meanings
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
