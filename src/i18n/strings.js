// Centralized UI strings

// Base English locale
export const EN = {
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

// Russian overrides
export const RU_OVERRIDES = {
  common: {
    tutorial: "Обучение",
    showTutorialTitle: "Показать обучение",
    minimize: "Свернуть",
    close: "Закрыть",
    cancel: "Отмена",
    join: "Присоединиться",
    previous: "Назад",
    next: "Далее",
    finish: "Готово",
    skipTutorial: "Пропустить",
    failedToInitializeAppPrefix: "Не удалось инициализировать приложение: ",
    languageSwitchTitle: "Сменить язык",
  },
  index: {
    apiTokenKeyLabel: "Токен / Ключ Steam Web API",
    apiTokenKeyTitle: "Открыть страницу токена / ключа Steam Web API в Steam",
    steamId64Label: "SteamID64",
    steamId64Title: "Открыть профиль в Steam",
    updateFriendsButton: "Обновить список друзей",
    updateFriendsButtonTitle:
      "Обновить полный список друзей через Steam API",
    updateFriendsButtonUpdating: "Обновление...",
    updateHint:
      'Нажмите "Обновить список друзей", чтобы загрузить друзей и запустить автообновление',
    friendFilterPlaceholder: "Фильтр по нику...",
    footerSteamProfileTitle: "Открыть профиль skik4 в Steam",
    footerGithubProfileTitle: "Открыть GitHub профиль skik4",
    hiddenH1Title: "CS2 Casual Enjoyer",
  },
  notifications: {
    closeButtonTitle: "Закрыть",
    tokenExpired: {
      message: "Срок действия токена истёк.",
      getNewLinkText: "Получить новый",
      getNewLinkTitle: "Получить новый токен",
    },
    tokenInfo: {
      detected: "Обнаружен токен Steam Web API.",
      steamIdLabel: "SteamID:",
      expiresLabel: "Токен истекает:",
    },
    privacy: {
      warningMain:
        "Список друзей не получен. Возможно, у вас приватный список друзей.",
      linkText: "Открыть настройки приватности Steam",
      linkTitle: "Открыть настройки приватности в Steam",
      note:
        'После смены списка друзей на публичный нажмите "Обновить список друзей", затем можно вернуть приватность.',
    },
    cs2Launch: {
      initial: {
        title: "Сначала запустите CS2",
        message:
          "Необходимо запустить Counter-Strike 2 перед присоединением к игре друга.",
        hint: "Дождитесь полной загрузки игры, затем попробуйте снова.",
        launchButton: "Запустить CS2",
        closeButton: "Закрыть",
      },
      launching: {
        title: "Запуск CS2...",
        message:
          "Запускаем Counter-Strike 2. Пожалуйста, дождитесь полной загрузки.",
        hint:
          "Уведомление закроется автоматически, когда CS2 будет обнаружен.",
        launchButtonHtml:
          '<span class="loading-spinner"></span> Запуск...'
        ,
        closeButton: "Закрыть",
      },
    },
  },
  help: {
    steamId: {
      title: "Как получить свой SteamID64",
      option1Title: "Вариант 1: Быстрая ссылка (рекомендуется)",
      openProfileLinkText: "Открыть профиль в клиенте Steam",
      openProfileLinkTitle: "Открыть профиль в клиенте Steam.",
      option1Body:
        "Профиль откроется в клиенте Steam. Кликните по адресу в адресной строке сверху — он скопируется автоматически. Затем вставьте его в поле <strong>SteamID64</strong> ниже.",
      option1Bullet1: "Быстро и автоматически",
      option1Bullet2: "Работает с любым форматом ссылки профиля",
      option1Bullet3: "Приложение само сконвертирует URL в SteamID64",
      option2Title: "Вариант 2: Ввести вручную",
      option2Body:
        "Если вы знаете свой <strong>SteamID64</strong> (17-значный номер), просто введите его.",
      note:
        "SteamID64 используется для идентификации в запросах Steam Web API.",
    },
    apiKey: {
      title: "Как получить токен или ключ Steam API",
      option1Title: "Вариант 1: Токен (рекомендуется)",
      getTokenLinkText: "Получить токен Steam Web API в клиенте Steam",
      getTokenLinkTitle: "Получить токен Steam Web API в клиенте Steam.",
      option1Body:
        "На открытой странице (она может быть чёрной / пустой) нажмите <strong>Ctrl+A</strong>, затем <strong>Ctrl+C</strong> — и вставьте в поле Токен (<strong>Ctrl+V</strong>).",
      option1Bullet1:
        "Приложение автоматически извлечёт токен и SteamID",
      option1Bullet2: "Список друзей может оставаться приватным",
      option1Bullet3: "Токен действует около 24 часов",
      option2Title: "Вариант 2: API Key",
      getApiKeyLinkText: "Получить ключ Steam Web API в клиенте Steam",
      getApiKeyLinkTitle: "Получить ключ Steam Web API в клиенте Steam.",
      option2Body1:
        "Зарегистрируйте новый ключ, указав домен <strong>localhost</strong>, примите условия и скопируйте ключ.",
      option2Body2:
        "Нажмите на метку поля <strong>SteamID64</strong> ниже, чтобы открыть профиль в Steam, скопируйте URL профиля и вставьте в поле SteamID64.",
      option2Bullet1:
        "Возможна дополнительная подтверждение через Steam Guard или email",
      option2Bullet2:
        "Однажды установите список друзей публичным для кеширования",
      option2Bullet3:
        "Временно сделайте публичным снова, чтобы обновить список",
      note1: "Ваши данные хранятся только локально.",
      note2:
        "Все запросы выполняются только через официальный Steam Web API.",
    },
  },
  friends: {
    temporarilyNotSupported: "Временно не в поддерживаемом режиме",
  },
  errors: {
    pleaseEnterSteamIdAndApiKey:
      "Введите SteamID64 и API Key (или токен)",
    noFriendsFound: "В списке друзей никого не найдено.",
  },
  validation: {
    urlMustBeString: "URL должен быть строкой",
    notSteamCommunityUrl: "Это не URL сообщества Steam",
    unrecognizedSteamUrl: "Неизвестный формат ссылки Steam",
    validSteamIdRequired: "Требуется корректный SteamID64",
    validAuthRequired: "Требуется корректный API Key или токен",
  },
  tutorial: {
    stepCounter: "{current} из {total}",
    step1Title: "Добро пожаловать в Casual Enjoyer",
    step1Content:
      "Короткое обучение по основным функциям.<br>Используйте кнопки ниже для навигации.",
    keyHint:
      "Enter — далее, Backspace — назад, Esc — пропустить.",
    step2Title: "Токен / Ключ Steam Web API",
    step2Content:
      "Нажмите на подсвеченный текст, чтобы открыть помощь со ссылкой в Steam.",
    step3Title: "Получение токена Steam Web API",
    step3Content:
      "Нажмите на подсвеченный текст для открытия Steam.<br>Страница может быть чёрной — нажмите Ctrl+A, затем Ctrl+C, чтобы скопировать токен.",
    step4Title: "Вставка токена",
    step4Content:
      "Вставьте токен (Ctrl+V) в подсвеченное поле.<br>Токен действует 24 часа, при необходимости получите новый.",
    step5Title: "Обновление списка друзей",
    step5Content:
      "Нажмите на подсвеченную кнопку, чтобы загрузить друзей из Steam со статусом игры.",
    step6Title: "Фильтр друзей",
    step6Content: "Введите текст для фильтрации по нику.",
    step7Title: "Отображение списка друзей",
    step7Content:
      "Друзья, играющие в Casual или Deathmatch, появятся в этом списке.",
    step8Title: "Присоединение к игре друга",
    step8Content:
      "Например, ваш лучший друг <strong>Gabe Newell</strong> играет в Casual на Dust 2.<br>Нажмите 'Присоединиться', чтобы автоматически подключиться!",
    step9Title: "Процесс подключения",
    step9ContentTop:
      "Красная точка = нет слотов, Жёлтая = попытка подключения, Зелёная = успешно подключено.",
    step9ContentNote1: "Жёлтая может гореть длительное время.",
    step9ContentNote2: "Сменится на красную или зелёную после ответа сервера.",
    step9ContentNote3:
      "В это время CS2 покажет ошибки соединения (это нормально) — удерживайте ESC, чтобы закрыть все.",
    step10Title: "Обучение завершено!",
    step10ContentTop:
      "Поздравляем! Вы прошли обучение и узнали основные функции.<br><br>Приятного пользования Casual Enjoyer!",
    step10ContentNote1: "Надеюсь, это полезно.",
    step10ContentNote2: "Если понравилось — расскажите друзьям.",
    githubReleases: "GitHub Releases",
  },
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export const STRINGS = deepClone(EN);
export default STRINGS;