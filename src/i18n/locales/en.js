// English locale
export default {
  common: {
    appTitle: "Casual Enjoyer",
    tutorial: "Tutorial",
    showTutorialTitle: "Show Tutorial",
    minimize: "Minimize",
    close: "Close",
    cancel: "Cancel",
    join: "Join",
    previous: "Previous",
    next: "Next",
    finish: "Finish",
    skipTutorial: "Skip Tutorial",
    failedToInitializeAppPrefix: "Failed to initialize app: ",
    languageSwitchTitle: "Switch Language",
  },

  index: {
    apiTokenKeyLabel: "Steam Web API Token / Key",
    apiTokenKeyTitle: "Get your Steam Web API Token / Key in Steam",
    steamId64Label: "SteamID64",
    steamId64Title: "Open your profile in Steam",
    updateFriendsButton: "Update Friends List",
    updateFriendsButtonTitle: "Update the complete list of friends from Steam API",
    updateFriendsButtonUpdating: "Updating...",
    updateHint:
      'Click "Update Friends List" to load your friends and start auto-refresh',
    friendFilterPlaceholder: "Filter friends by nickname...",
    footerSteamProfileTitle: "Open skik4's Steam profile",
    footerGithubProfileTitle: "Open skik4's GitHub profile",
    hiddenH1Title: "CS2 Casual Enjoyer",
  },

  notifications: {
    closeButtonTitle: "Close",
    tokenExpired: {
      message: "Your token has expired.",
      getNewLinkText: "Get a new one",
      getNewLinkTitle: "Get a new token",
    },
    tokenInfo: {
      detected: "Steam Web API Token detected.",
      steamIdLabel: "SteamID:",
      expiresLabel: "Token expires:",
    },
    privacy: {
      warningMain:
        "No friends list returned. This could be because your friends list is set to private.",
      linkText: "Open your Steam privacy settings",
      linkTitle: "Open privacy settings in Steam",
      note:
        'After setting your friends list to public, click "Update Friend List", then you can set it back to private.',
    },
    cs2Launch: {
      initial: {
        title: "Launch CS2 First",
        message:
          "You need to launch Counter-Strike 2 before joining your friend's game.",
        hint: "Wait for the game to fully load before trying to join again.",
        launchButton: "Launch CS2",
        closeButton: "Close",
      },
      launching: {
        title: "Launching CS2...",
        message:
          "Starting Counter-Strike 2. Please wait for the game to fully load.",
        hint: "The notification will close automatically when CS2 is detected.",
        launchButtonHtml: '<span class="loading-spinner"></span> Launching...',
        closeButton: "Close",
      },
    },
  },

  help: {
    steamId: {
      title: "How to Get Your SteamID64",
      option1Title: "Option 1: Quick Link (Recommended)",
      openProfileLinkText: "Open your Steam profile in the Steam client",
      openProfileLinkTitle: "Open your Steam profile in the Steam client.",
      option1Body:
        "Your profile will open in the Steam client. Click on the URL in the address bar at the top of the Steam window - this automatically copies it to your clipboard. Then paste it into the <strong>SteamID64</strong> field below.",
      option1Bullet1: "Fast and automatic",
      option1Bullet2: "Works with any Steam profile URL format",
      option1Bullet3: "The app converts URLs to SteamID64 automatically",
      option2Title: "Option 2: Manual Entry",
      option2Body:
        "If you already know your <strong>SteamID64</strong> (17-digit number), you can enter it directly.",
      note:
        "Your SteamID64 used to identify your account in Steam Web API requests.",
    },
    apiKey: {
      title: "How to Get Your Steam API Token or Key",
      option1Title: "Option 1: Token (Recommended)",
      getTokenLinkText: "Get your Steam Web API Token in the Steam client",
      getTokenLinkTitle: "Get your Steam Web API Token in the Steam client.",
      option1Body:
        "On the opened page (may appear blank / black), press <strong>Ctrl+A</strong> then <strong>Ctrl+C</strong> to copy, and <strong>Ctrl+V</strong> to paste into the Token field.",
      option1Bullet1: "The app will extract your token and SteamID automatically",
      option1Bullet2: "Your friend list can stay private",
      option1Bullet3: "A token is valid for about 24 hours",
      option2Title: "Option 2: API Key",
      getApiKeyLinkText: "Get your Steam Web API Key in the Steam client",
      getApiKeyLinkTitle: "Get your Steam Web API Key in the Steam client.",
      option2Body1:
        "Register a new API key by entering <strong>localhost</strong> as your domain, accept the terms, and copy your key.",
      option2Body2:
        "Click the <strong>SteamID64</strong> field label below to open your Steam profile, then copy your profile URL and paste it into the SteamID64 field.",
      option2Bullet1: "You may need to confirm via Steam Guard or email",
      option2Bullet2: "Set your friend list to public at least once for caching",
      option2Bullet3:
        "Make it public again temporarily to update your friends list",
      note1: "Your credentials are stored locally only.",
      note2:
        "All requests are made only through the official Steam Web API.",
    },
  },

  friends: {
    temporarilyNotSupported: "Temporarily not in supported mode",
  },

  errors: {
    pleaseEnterSteamIdAndApiKey: "Please enter your SteamID64 and API Key",
    noFriendsFound: "No friends found in your friends list.",
  },

  validation: {
    urlMustBeString: "URL must be a string",
    notSteamCommunityUrl: "Not a Steam Community URL",
    unrecognizedSteamUrl: "Unrecognized Steam URL format",
    validSteamIdRequired: "Valid SteamID64 is required",
    validAuthRequired: "Valid API Key or Token is required",
  },

  tutorial: {
    stepCounter: "{current} of {total}",
    step1Title: "Welcome to Casual Enjoyer",
    step1Content:
      "Quick tutorial on main features.<br>Use buttons below to navigate.",
    keyHint:
      "Press Enter for next step, Backspace for previous, Esc to skip.",
    step2Title: "Steam Web API Token / Key",
    step2Content:
      "Click the highlighted text to open help with Steam link for token.",
    step3Title: "Get Steam Web API Token",
    step3Content:
      "Click highlighted text to open Steam.<br>It may appear black - press Ctrl+A then Ctrl+C to copy token.",
    step4Title: "Paste Token",
    step4Content:
      "Paste token (Ctrl+V) into highlighted field.<br>Token expires in 24 hours, get new one when needed.",
    step5Title: "Update Friends List",
    step5Content:
      "Click highlighted button to load friends from Steam with game status.",
    step6Title: "Filter Friends",
    step6Content: "Type in highlighted box to filter friends by nickname.",
    step7Title: "Friends List Display",
    step7Content:
      "Friends currently playing Casual or Deathmatch modes will appear in this list.",
    step8Title: "Join to Friend Game",
    step8Content:
      "For example, your best friend <strong>Gabe Newell</strong> is playing Casual on Dust 2.<br>Click 'Join' to automatically connect to his match!",
    step9Title: "Connection Process",
    step9ContentTop:
      "Red dot = no slots available, Yellow = attempting to connect, Green = successfully connected.",
    step9ContentNote1: "Yellow may stay for a while.",
    step9ContentNote2: "Will change to red or green once server responds.",
    step9ContentNote3:
      "Meanwhile, CS2 will show connection error dialogs (this is normal) - hold ESC to dismiss them all.",
    step10Title: "Tutorial Complete!",
    step10ContentTop:
      "Congratulations! You've completed the tutorial and learned all the main features.<br><br>Enjoy using Casual Enjoyer!",
    step10ContentNote1: "Hope you find it useful.",
    step10ContentNote2: "If you like it, please share with your friends.",
    githubReleases: "GitHub Releases",
  },
};
