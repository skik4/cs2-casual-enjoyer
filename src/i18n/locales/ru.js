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
