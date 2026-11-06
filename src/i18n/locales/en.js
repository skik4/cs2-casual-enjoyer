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
    updateFriendsButton: "Load friends",
    updateFriendsButtonTitle: "Load your friends list from Steam",
    updateFriendsButtonUpdating: "Loading...",
    friendFilterPlaceholder: "Filter by nickname",
    footerSteamProfileTitle: "Open skik4's Steam profile",
    footerGithubProfileTitle: "Open skik4's GitHub profile",
    hiddenH1Title: "Casual Enjoyer",
  },

  notifications: {
    closeButtonTitle: "Close",
    privacy: {
      warningMain:
        "No friends list returned. This could be because your friends list is set to private.",
      linkText: "Open your Steam privacy settings",
      linkTitle: "Open privacy settings in Steam",
      note: 'After setting your friends list to public, click "Update Friend List", then you can set it back to private.',
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
      timeout: {
        title: "CS2 Did Not Start",
        message: "Counter-Strike 2 has not reached the main menu.",
        hint: "Check that Steam is running and the game starts, then try again.",
        launchButton: "Try Again",
        closeButton: "Close",
      },
      launchOnly: {
        title: "Launch CS2?",
        message:
          "The app launches Counter-Strike 2 through Steam and waits for the game's main menu.",
        hint: "This only launches the game, without joining anyone.",
      },
      // In place of the offer, when Steam shows CS2 running already
      running: {
        title: "CS2 Is Already Running",
        message:
          "Steam shows you in Counter-Strike 2, so there is nothing to launch. The app is waiting for the game to report.",
        hint: "Usually CS2 is still loading; once it reports, the footer reads “{connected}”.",
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
      note: "Your SteamID64 is used to identify your account in Steam Web API requests.",
    },
    apiKey: {
      title: "How to Get Your Steam API Token or Key",
      option1Title: "Option 1: Token (Recommended)",
      getTokenLinkText: "Get your Steam Web API Token in the Steam client",
      getTokenLinkTitle: "Get your Steam Web API Token in the Steam client.",
      option1Body:
        "On the opened page (may appear blank / black), press <strong>Ctrl+A</strong> then <strong>Ctrl+C</strong> to copy, and <strong>Ctrl+V</strong> to paste into the Token field.",
      option1Bullet1:
        "The app will extract your token and SteamID automatically",
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
      option2Bullet2:
        "Set your friend list to public at least once for caching",
      option2Bullet3:
        "Make it public again temporarily to update your friends list",
      note1: "Your credentials are stored locally only.",
      note2: "All requests are made only through the official Steam Web API.",
    },
  },

  friends: {
    temporarilyNotSupported: "Temporarily not in supported mode",
    addFakeFriend: "Add Fake Friend",
    fakeFriendSteamIdPlaceholder: "Enter friend's Steam ID (17 digits)",
    addButton: "Add",
    invalidSteamId: "Please enter a valid 17-digit Steam ID",
    alreadyInList: "This Steam ID is already in your friends list",
    fakeFriendAdded: "Fake Friend added successfully",
    removeFakeFriend: "Remove from Fake Friends",
    confirmRemove: "Remove?",
  },

  views: {
    friends: "Friends",
    fakeFriends: "Fake Friends",
    maps: "Maps",
    fakeFriendsEmpty: "No Fake Friends yet. Add a Steam ID above.",
    friendsEmpty:
      "None of your friends is in casual right now. Try the Maps tab.",
  },

  account: {
    tokenValidUntil: "Token valid until {date}",
    tokenExpiresIn: "Token expires in {minutes} min",
    tokenExpired: "Token expired, get a new one",
    tokenRejected: "Steam turned the token down, get a new one",
    keyRejected: "Steam turned the key down, check it",
    apiKey: "Steam Web API key",
    edit: "Account",
    refreshTitle: "Update the friends list",
    panelTitle: "Connect to Steam",
    panelIntro:
      "Needed about once a day: a Steam token lives for about 24 hours. Your friends load by themselves.",
    step1: "Open the token page in Steam",
    openInSteam: "Open in Steam",
    step1Hint: "The page may look black, that is fine.",
    step2: "Copy everything and paste it here",
    step2Hint: "Ctrl+A, Ctrl+C on the Steam page, then Ctrl+V in the field.",
    steamIdFromToken: "SteamID taken from the token: {steamid}",
    steamIdPending: "Your SteamID is read from the token",
    steamIdForKey: "With an API key, enter your SteamID64 too",
    help: "Token or API key: how to get one",
    close: "Close",
  },

  join: {
    freeSlot: "free slot",
    noSlot: "no free slot",
    connecting: "connecting…",
    waitingForSlot: "waiting for a slot",
    missing: "not in casual",
    joined: "on the server ✓",
    waitButton: "Wait for a slot",
    notInCS2: "Not in CS2",
    youAreHere: "you're here",
    together: "you're together",
    onThisMap: "you're on this map",
    matchOver: "match over",
    onPinnedMap: "you're on a pinned map",
  },

  joinBar: {
    title: "Joining {name}",
    connecting: "Connect sent, waiting for CS2",
    waiting: "The server is full: joining as soon as a slot opens",
    missing: "Left casual: waiting a minute for a return",
    joined: "You are on the server",
  },

  mapFinder: {
    servers: { one: "{count} server", other: "{count} servers" },
    freeServers: "{count} with a free slot",
    round: "Round {round} · {score}",
    finalScore: "Final score {score}",
    keep: "Pin this map. A row above the list then joins any pinned map, and when a match ends the app joins one of them by itself",
    pinnedTitle: "Any pinned map",
    unpinAll: "Unpin all",
    keeping: "Keeping this map. Click to stop",
    noScore: "No score yet",
    searchingAmong: {
      one: "searching {count} player",
      other: "searching {count} players",
    },
    source: {
      pool: "Pool",
      poolTitle:
        "Players the app has seen on official casual servers in the last two weeks",
      poolFriends: "Friends of pool players",
      poolFriendsTitle:
        "Friends of pool players, from their public friends lists",
      fof: "Friends of friends",
      fofTitle: "Your friends' friends, from their public friends lists",
    },
    read: {
      button: "Read lists",
      poolFriends:
        "Read the friends lists of pool players whose lists were not read in the last day: {count}",
      poolFriendsNone: "Every pool player's list was read in the last day",
      fof: "Read your friends' friends lists: {count}",
      fofNone: "No friends in your list yet",
      needsKey:
        "Needs a Steam Web API key: a token cannot read other people's friends lists",
      progress: "reading {done} of {total}…",
      failed: "no list could be read",
      at: "read {date}",
    },
    clear: "Clear",
    clearPoolTitle:
      "Remove players from the pool: all of them, or only those without a sign of Prime",
    clearPoolAsk: "Remove from the pool:",
    clearPoolAll: "everyone",
    clearPoolNoPrime: "without a sign of Prime ({count})",
    clearPoolNoPrimeTitle:
      "Keep only the players seen with a sign of Prime: CS2 XP or a Premier match. The others may have Prime too; it just was not seen",
    cancel: "cancel",
    clearPoolFriendsTitle:
      "Forget the friends of pool players. The next read takes every pool player's list again",
    clearFofTitle: "Forget friends of friends. Read lists brings them back",
    confirmClear: "Sure? Click again",
    keyNotSet: "API key not set",
    keySaved: "API key saved",
    keyMain: "Your main API key is used",
    setKey: "Set key",
    changeKey: "Change key",
    hideKey: "Hide",
    searching: "searching…",
    updatedAt: "updated {time}",
    needAuth: "Enter your Steam Web API token or key and SteamID64 first.",
    searchingEmpty: "Looking for players on official servers…",
    nothingFound:
      "Nobody found on official casual servers right now. The search keeps going.",
    fofTitle: "Friends of friends",
    fofKeyPlaceholder: "Steam Web API key (32 characters)",
    fofKeySave: "Save",
    fofNeedsKey:
      "Reading friends lists - your friends' and the pool players' - needs a Steam Web API key: a token cannot read other people's lists.",
    fofKeySaved:
      "API key saved. Friends lists are read only when you click Read lists; without the key the players found stay, but no new ones come through friends.",
    fofKeyDelete: "Delete key",
    fofKeptWithoutKey:
      "Friends of friends ({count}) are kept and checked without a key. A key is only needed to read the lists again.",
    fofUsesMainKey: "Your main API key is used for friends lists.",
    fofKeyInvalid:
      "That is not an API key: it should be 32 letters and digits.",
    fofKeyError: "No friends list could be read with this key. Check the key.",
    primeOnly: "Prime only",
    primeOnlyTitle:
      "List and join by map only servers where a player with a sign of Prime is seen: CS2 XP or a Premier match. Not a guarantee: a Prime player may have joined a friend in a match without Prime. A server you pick yourself is always joined.",
    primeTag: "Prime",
    primeTagDoubt: "Prime?",
    primeTagTitle:
      "Players with a sign of Prime here: {count}. The sign is CS2 XP or a Premier match; it does not promise that everyone here has Prime.",
    // What the check of their friends found, after primeTagTitle
    primeCheck: {
      alone:
        "A player with a sign of Prime has none of their friends here: most likely came through matchmaking. Friends who hide their game details do not show.",
      "prime-friends":
        "A player with a sign of Prime plays with friends who show a sign of Prime too. Friends who hide their game details do not show.",
      friend:
        "A player with a sign of Prime plays with a friend who shows none: may have joined that friend's match without Prime.",
      pending:
        "The friends of the player with a sign of Prime are not checked yet.",
      "no-key": "Their friends could not be checked: no API key.",
      closed:
        "Their friends could not be checked: the friends list is private or could not be read.",
    },
    primeServersTag: "Prime: {count}",
    primeServersTitle:
      "Servers where a player with a sign of Prime is seen: {count} of {total}",
    noPrimeServers:
      "No server with a visible Prime player right now. The others are hidden by “Prime only”. Still searching.",
  },

  update: {
    available: "Update {version} available — download",
    availableTitle: "Downloads in the background, then offers to install",
    failed: "Update {version} did not download — retry",
    downloading: "Downloading update {version}… {percent}%",
    ready: "Update {version} downloaded — install",
    readyTitle: "The app closes, updates and opens again",
  },

  gsi: {
    label: {
      active: "CS2 connected",
      waiting: "Waiting for CS2",
      restart: "Restart CS2",
      "other-account": "CS2 on another account",
      unavailable: "GSI off",
      error: "GSI error",
    },
    active:
      "CS2 Game State Integration is connected: the app gets your game state straight from CS2.",
    waiting:
      "CS2 Game State Integration is set up and connects when CS2 starts.",
    restart:
      "CS2 Game State Integration was just set up. If CS2 is already running, restart it once.",
    otherAccount:
      "CS2 is running on a different Steam account than the one entered here, so its game state is ignored.",
    unavailable:
      "CS2 installation not found, so Game State Integration is off. The app uses the Steam Web API instead.",
    error:
      "Could not set up CS2 Game State Integration. The app uses the Steam Web API instead.",
    launchHint: "Click to launch CS2.",
  },

  errors: {
    pleaseEnterSteamIdAndApiKey: "Please enter your SteamID64 and API Key",
    noFriendsFound: "No friends found in your friends list.",
    tokenRejected: "Steam turned the token down, get a new one.",
    keyRejected: "Steam turned the key down, check it.",
    rateLimited:
      "Steam asks to slow down: too many requests. Try again a bit later.",
    steamUnavailable: "Steam is unavailable right now, try again later.",
    steamError: "Steam answered with error {status}, try again later.",
    noConnection:
      "Couldn't reach Steam. Check your internet connection and try again.",
    unexpected: "Something went wrong: {message}",
  },

  validation: {
    urlMustBeString: "URL must be a string",
    notSteamCommunityUrl: "Not a Steam Community URL",
    unrecognizedSteamUrl: "Unrecognized Steam URL format",
    validSteamIdRequired: "Valid SteamID64 is required",
    validAuthRequired: "Valid API Key or Token is required",
    vanityNeedsAuth:
      "Enter your API token or key first to resolve profile links",
    vanityResolving: "Resolving profile link...",
    vanityNotResolved:
      "Could not resolve the profile link. Please enter SteamID64 manually.",
    vanityError: "Error resolving the profile link: ",
  },

  tutorial: {
    stepCounter: "{current} of {total}",
    step1Title: "Welcome to Casual Enjoyer",
    step1Content:
      "Quick tutorial on main features.<br>Use buttons below to navigate.",
    keyHint: "Press Enter for next step, Backspace for previous, Esc to skip.",
    step2Title: "Steam token",
    step2Content:
      "Click the highlighted link to open help with the Steam link for a token.",
    step3Title: "Get Steam Web API Token",
    step3Content:
      "Click highlighted text to open Steam.<br>It may appear black - press Ctrl+A then Ctrl+C to copy token.",
    step4Title: "Paste Token",
    step4Content:
      "Paste token (Ctrl+V) into highlighted field.<br>Token expires in 24 hours, get new one when needed.",
    step5Title: "Load friends",
    step5Content:
      "Click the highlighted button to load your friends from Steam with their game status.",
    step6Title: "Filter Friends",
    step6Content: "Type in highlighted box to filter friends by nickname.",
    step7Title: "Friends List Display",
    step7Content: "Friends currently playing Casual will appear in this list.",
    step8Title: "Join to Friend Game",
    step8Content:
      "For example, your best friend <strong>Gabe Newell</strong> is playing Casual on Dust 2.<br>Click 'Join' to automatically connect to his match!",
    step9Title: "Connection Process",
    step9ContentTop:
      "The label next to the score shows what is going on: «free slot» or «no free slot» before you join, «connecting…» once the connect is sent, «waiting for a slot» while the server is full, and «on the server ✓» once you are in. A friend on your server says «you're together» and cannot be joined.",
    step9ContentNote1:
      "While waiting for a slot, the app joins by itself as soon as one opens.",
    step9ContentNote2:
      "The bar above the tabs shows the attempt from any tab, with Cancel.",
    step9ContentNote3:
      "Meanwhile, CS2 will show connection error dialogs (this is normal) - hold ESC to dismiss them all.",
    step10Title: "Tutorial Complete!",
    step10ContentTop:
      "Congratulations! You've completed the tutorial and learned all the main features.<br><br>Enjoy using Casual Enjoyer!",
    step10ContentNote1: "Hope you find it useful.",
    step10ContentNote2: "If you like it, please share with your friends.",
    githubReleases: "GitHub Releases",
    linkCopied: "Link copied",
    copyFailed: "Copy failed",
  },
};
