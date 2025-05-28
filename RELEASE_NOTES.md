# CS2 Casual Enjoyer v0.3.0

## 🎮 What's New

**CS2 Casual Enjoyer** is an Electron-based desktop application that automates the process of joining a friend's Casual match in Counter-Strike 2 (CS2).

## ✨ Features

- **🔗 Automated Match Joining**: Automatically connects to your friend's Casual match when a slot becomes available
- **🔑 Flexible Authentication**: Support for both Steam API Key and Session Token authentication
- **👥 Friend Monitoring**: Real-time monitoring of your friends' match statuses using Steam Web API
- **⚡ Smart Retry Logic**: Intelligent retry mechanism that continues attempting to join until successful
- **🎯 Privacy Friendly**: Token authentication doesn't require public profile settings
- **💻 Cross-Platform**: Built with Electron for Windows, macOS, and Linux

## 🚀 How It Works

1. The app monitors your friends' match statuses using Steam Web API
2. Choose between Steam API Key or Session Token for authentication
3. Press "Join" to start monitoring for available slots
4. The app automatically attempts to connect when a slot opens
5. Continues retrying until successful connection or manual cancellation

## 🔧 Authentication Options

- **Session Token** (Recommended): Valid for 24 hours, no privacy requirements
- **Steam API Key**: Permanent but requires public profile/friends list initially

## 📥 Installation

Download the prebuilt `.exe` file from the releases and run directly - no Node.js installation required!

## 🛠️ Building from Source

```bash
# Requirements: Node.js v16+, Git
npm install
npm run dev    # Development mode
npm run dist   # Build executable
```

## 📝 First Time Setup

1. Launch the application
2. Click on "Steam Web API Token / Key" label
3. Follow the detailed instructions to obtain your authentication credentials

---

*Enjoy hassle-free CS2 Casual match joining! 🎯*
