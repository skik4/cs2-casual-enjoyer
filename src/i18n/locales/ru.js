// Russian locale
export default {
  common: {
    appTitle: "Casual Enjoyer",
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
    apiTokenKeyTitle: "Получить свой токен / ключ Steam Web API в Steam",
    steamId64Label: "SteamID64",
    steamId64Title: "Открыть твой профиль в Steam",
    updateFriendsButton: "Обновить список друзей",
    updateFriendsButtonTitle:
      "Обновить полный список друзей через Steam API",
    updateFriendsButtonUpdating: "Обновление...",
    updateHint:
      'Нажми "Обновить список друзей", чтобы загрузить друзей и запустить автообновление',
    friendFilterPlaceholder: "Фильтр по нику...",
    footerSteamProfileTitle: "Открыть профиль skik4 в Steam",
    footerGithubProfileTitle: "Открыть GitHub профиль skik4",
    hiddenH1Title: "CS2 Casual Enjoyer",
  },

  notifications: {
    closeButtonTitle: "Закрыть",
    tokenExpired: {
      message: "Твой токен истёк.",
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
        "Список друзей не получен. Возможно, твой список друзей приватный.",
      linkText: "Открыть твои настройки приватности Steam",
      linkTitle: "Открыть твои настройки приватности в Steam",
      note:
        'После того как сделаешь список друзей публичным, нажми "Обновить список друзей", потом можешь вернуть приватность.',
    },
    cs2Launch: {
      initial: {
        title: "Сначала запусти CS2",
        message:
          "Тебе нужно запустить Counter-Strike 2, прежде чем присоединиться к игре друга.",
        hint: "Подожди полной загрузки игры, затем попробуй снова.",
        launchButton: "Запустить CS2",
        closeButton: "Закрыть",
      },
      launching: {
        title: "Запуск CS2...",
        message:
          "Запускается Counter-Strike 2. Пожалуйста, дождись полной загрузки игры.",
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
      openProfileLinkText: "Открыть твой профиль в клиенте Steam",
      openProfileLinkTitle: "Открыть твой профиль в клиенте Steam.",
      option1Body:
        "Профиль откроется в клиенте Steam. Кликни по адресу в адресной строке сверху — он скопируется автоматически. Затем вставь его в поле <strong>SteamID64</strong> ниже.",
      option1Bullet1: "Быстро и автоматически",
      option1Bullet2: "Работает с любым форматом ссылки профиля",
      option1Bullet3: "Приложение само сконвертирует URL в SteamID64",
      option2Title: "Вариант 2: Ввести вручную",
      option2Body:
        "Если ты знаешь свой <strong>SteamID64</strong> (17-значный номер), можешь ввести его напрямую.",
      note:
        "Твой SteamID64 используется для идентификации аккаунта в запросах Steam Web API.",
    },
    apiKey: {
      title: "Как получить токен или ключ Steam API",
      option1Title: "Вариант 1: Токен (рекомендуется)",
      getTokenLinkText: "Получить свой токен Steam Web API в клиенте Steam",
      getTokenLinkTitle: "Получить свой токен Steam Web API в клиенте Steam.",
      option1Body:
        "На открытой странице (она может быть чёрной / пустой) нажми <strong>Ctrl+A</strong>, затем <strong>Ctrl+C</strong>, а потом вставь в поле Токен (<strong>Ctrl+V</strong>).",
      option1Bullet1:
        "Приложение автоматически извлечёт токен и SteamID",
      option1Bullet2: "Список друзей может оставаться приватным",
      option1Bullet3: "Токен действует около 24 часов",
      option2Title: "Вариант 2: API Key",
      getApiKeyLinkText: "Получить свой ключ Steam Web API в клиенте Steam",
      getApiKeyLinkTitle: "Получить свой ключ Steam Web API в клиенте Steam.",
      option2Body1:
        "Зарегистрируй новый ключ, указав домен <strong>localhost</strong>, прими условия и скопируй ключ.",
      option2Body2:
        "Нажми на метку поля <strong>SteamID64</strong> ниже, чтобы открыть свой профиль в Steam, скопируй URL профиля и вставь его в поле SteamID64.",
      option2Bullet1:
        "Возможно потребуется подтверждение через Steam Guard или e‑mail",
      option2Bullet2:
        "Один раз сделай список друзей публичным для кэширования",
      option2Bullet3:
        "Если нужно обновить список друзей, временно сделай его снова публичным",
      note1: "Твои учётные данные хранятся только локально.",
      note2:
        "Все запросы выполняются только через официальный Steam Web API.",
    },
  },

  friends: {
    temporarilyNotSupported: "Временно не в поддерживаемом режиме",
  },

  errors: {
    pleaseEnterSteamIdAndApiKey:
      "Введи свой SteamID64 и API Key",
    noFriendsFound: "В твоём списке друзей никого не найдено.",
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
      "Короткое обучение по основным функциям.<br>Используй кнопки ниже для навигации.",
    keyHint:
      "Enter — далее, Backspace — назад, Esc — пропустить.",
    step2Title: "Токен / Ключ Steam Web API",
    step2Content:
      "Нажми на подсвеченный текст, чтобы открыть помощь со ссылкой на страницу токена в Steam.",
    step3Title: "Получение токена Steam Web API",
    step3Content:
      "Нажми на подсвеченный текст для открытия Steam.<br>Страница может быть чёрной — просто тыкни по странице, нажми Ctrl+A, затем Ctrl+C, чтобы скопировать токен.",
    step4Title: "Вставь токен",
    step4Content:
      "Вставь токен (Ctrl+V) в подсвеченное поле.<br>Токен истекает через 24 часа, при необходимости получи новый.",
    step5Title: "Обнови список друзей",
    step5Content:
      "Нажми на подсвеченную кнопку, чтобы загрузить друзей из Steam со статусом игры.",
    step6Title: "Фильтруй друзей",
    step6Content: "Введи текст для фильтрации по нику если необходимо.",
    step7Title: "Отображение списка друзей",
    step7Content:
      "Друзья, играющие в Casual или Deathmatch, появятся в этом списке.",
    step8Title: "Присоединись к игре друга",
    step8Content:
      "Например, твой лучший друг <strong>Gabe Newell</strong> играет в Casual на Dust 2.<br>Нажми 'Присоединиться', чтобы автоматически подключиться к его матчу!",
    step9Title: "Процесс подключения",
    step9ContentTop:
      "Красная точка = нет слотов, Жёлтая = попытка подключения, Зелёная = успешно подключено.",
    step9ContentNote1: "Жёлтая может гореть длительное время.",
    step9ContentNote2: "Сменится на красную или зелёную после ответа сервера.",
    step9ContentNote3:
      "В это время CS2 покажет ошибки соединения (это нормально) — удерживай ESC в игре, чтобы закрыть все.",
    step10Title: "Обучение завершено!",
    step10ContentTop:
      "Поздравляем! Ты завершил обучение и узнал об основных функциях.<br><br>Приятного пользования Casual Enjoyer!",
    step10ContentNote1: "Надеюсь, приложение будет полезным.",
    step10ContentNote2: "Если понравилось — расскажи друзьям.",
    githubReleases: "GitHub Releases",
  },
};
