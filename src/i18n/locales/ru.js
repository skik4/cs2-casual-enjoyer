// Russian locale
export default {
  common: {
    appTitle: "Casual Enjoyer",
    tutorial: "Обучение",
    showTutorialTitle: "Показать обучение",
    minimize: "Свернуть",
    close: "Закрыть",
    cancel: "Отменить",
    join: "Подключиться",
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
    updateFriendsButton: "Загрузить друзей",
    updateFriendsButtonTitle: "Загрузить список друзей из Steam",
    updateFriendsButtonUpdating: "Загружаю...",
    friendFilterPlaceholder: "Фильтр по нику",
    footerSteamProfileTitle: "Открыть профиль skik4 в Steam",
    footerGithubProfileTitle: "Открыть GitHub профиль skik4",
    hiddenH1Title: "Casual Enjoyer",
  },

  notifications: {
    closeButtonTitle: "Закрыть",
    privacy: {
      warningMain:
        "Список друзей не получен. Возможно, твой список друзей приватный.",
      linkText: "Открыть твои настройки приватности Steam",
      linkTitle: "Открыть твои настройки приватности в Steam",
      note: 'После того как сделаешь список друзей публичным, нажми "Обновить список друзей", потом можешь вернуть приватность.',
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
        hint: "Уведомление закроется автоматически, когда CS2 будет обнаружен.",
        launchButtonHtml: '<span class="loading-spinner"></span> Запуск...',
        closeButton: "Закрыть",
      },
      timeout: {
        title: "CS2 не запустился",
        message: "Counter-Strike 2 так и не дошёл до главного меню.",
        hint: "Проверь, что Steam запущен и игра стартует, затем попробуй снова.",
        launchButton: "Повторить",
        closeButton: "Закрыть",
      },
      launchOnly: {
        title: "Запустить CS2?",
        message:
          "Запустим Counter-Strike 2 через Steam и подождём, пока игра дойдёт до главного меню.",
        hint: "Это только запуск игры, без подключения к кому-либо.",
      },
      // In place of the offer, when Steam shows CS2 running already
      running: {
        title: "CS2 уже запущен",
        message:
          "Steam показывает, что ты в Counter-Strike 2, так что запускать нечего. Приложение ждёт, когда игра выйдет на связь.",
        hint: "Обычно CS2 ещё загружается; когда игра отзовётся, внизу появится «{connected}».",
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
      note: "Твой SteamID64 используется для идентификации аккаунта в запросах Steam Web API.",
    },
    apiKey: {
      title: "Как получить токен или ключ Steam API",
      option1Title: "Вариант 1: Токен (рекомендуется)",
      getTokenLinkText: "Получить свой токен Steam Web API в клиенте Steam",
      getTokenLinkTitle: "Получить свой токен Steam Web API в клиенте Steam.",
      option1Body:
        "На открытой странице (она может быть чёрной / пустой) нажми <strong>Ctrl+A</strong>, затем <strong>Ctrl+C</strong>, а потом вставь в поле Токен (<strong>Ctrl+V</strong>).",
      option1Bullet1: "Приложение автоматически извлечёт токен и SteamID",
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
      option2Bullet2: "Один раз сделай список друзей публичным для кэширования",
      option2Bullet3:
        "Если нужно обновить список друзей, временно сделай его снова публичным",
      note1: "Твои учётные данные хранятся только локально.",
      note2: "Все запросы выполняются только через официальный Steam Web API.",
    },
  },

  friends: {
    temporarilyNotSupported: "Временно не в поддерживаемом режиме",
    addFakeFriend: "Добавить фейкового друга",
    fakeFriendSteamIdPlaceholder: "Введи Steam ID друга (17 цифр)",
    addButton: "Добавить",
    invalidSteamId: "Введи корректный Steam ID из 17 цифр",
    alreadyInList: "Этот Steam ID уже есть в твоём списке друзей",
    fakeFriendAdded: "Фейковый друг успешно добавлен",
    removeFakeFriend: "Удалить из фейковых друзей",
    confirmRemove: "Удалить?",
  },

  views: {
    friends: "Друзья",
    fakeFriends: "Фейк-друзья",
    maps: "Карты",
    fakeFriendsEmpty: "Фейковых друзей пока нет. Добавь Steam ID выше.",
    friendsEmpty:
      "Никого из друзей сейчас нет в casual. Загляни во вкладку «Карты».",
  },

  account: {
    tokenValidUntil: "Токен действует до {date}",
    tokenExpiresIn: "Токен истекает через {minutes} мин",
    tokenExpired: "Токен истёк, получи новый",
    tokenRejected: "Steam не принял токен, получи новый",
    keyRejected: "Steam не принял ключ, проверь его",
    apiKey: "Ключ Steam Web API",
    edit: "Аккаунт",
    refreshTitle: "Обновить список друзей",
    panelTitle: "Подключение к Steam",
    panelIntro:
      "Нужно примерно раз в сутки: токен Steam живёт около 24 часов. Друзья загрузятся сами.",
    step1: "Открой страницу токена в Steam",
    openInSteam: "Открыть в Steam",
    step1Hint: "Страница может быть чёрной, это нормально.",
    step2: "Скопируй всё и вставь сюда",
    step2Hint: "Ctrl+A, Ctrl+C на странице Steam, потом Ctrl+V в поле.",
    steamIdFromToken: "SteamID взят из токена: {steamid}",
    steamIdPending: "SteamID возьмётся из токена",
    steamIdForKey: "С API-ключом укажи ещё SteamID64",
    help: "Токен или API-ключ: как получить",
    close: "Закрыть",
  },

  join: {
    freeSlot: "есть место",
    noSlot: "мест нет",
    connecting: "подключаемся…",
    waitingForSlot: "ждём место",
    missing: "не в casual",
    joined: "на сервере ✓",
    waitButton: "Ждать место",
    notInCS2: "Не в CS2",
    youAreHere: "вы здесь",
    together: "вы вместе",
    onThisMap: "вы на этой карте",
    matchOver: "матч закончился",
    onPinnedMap: "вы на закреплённой карте",
  },

  joinBar: {
    title: "Подключаемся: {name}",
    connecting: "Попытка отправлена, ждём CS2",
    waiting: "Сервер полон: подключимся, как только освободится место",
    missing: "Вышел из casual: ждём минуту, вдруг вернётся",
    joined: "Ты на сервере",
  },

  mapFinder: {
    servers: {
      one: "{count} сервер",
      few: "{count} сервера",
      many: "{count} серверов",
      other: "{count} сервера",
    },
    freeServers: "{count} со свободным местом",
    round: "Раунд {round} · {score}",
    finalScore: "Итог {score}",
    keep: "Закрепить карту. Над списком появится строка, где «Подключиться» берёт любую закреплённую, а после конца матча приложение само подключит к одной из них",
    pinnedTitle: "Любая из закреплённых",
    unpinAll: "Снять все",
    keeping: "Карта закреплена. Нажми, чтобы снять",
    noScore: "Счёта пока нет",
    searchingAmong: {
      one: "ищем среди {count} игрока",
      few: "ищем среди {count} игроков",
      many: "ищем среди {count} игроков",
      other: "ищем среди {count} игрока",
    },
    source: {
      pool: "Пул",
      poolTitle:
        "Игроки, которых приложение видело на официальных серверах в обычном режиме за последние две недели",
      poolFriends: "Друзья игроков пула",
      poolFriendsTitle: "Друзья игроков пула из их открытых списков друзей",
      fof: "Друзья друзей",
      fofTitle: "Друзья твоих друзей из их открытых списков друзей",
    },
    read: {
      button: "Прочитать списки",
      poolFriends:
        "Прочитать списки друзей у игроков пула, чьи списки не читались за последние сутки: {count}",
      poolFriendsNone: "Списки всех игроков пула прочитаны за последние сутки",
      fof: "Прочитать списки друзей у твоих друзей: {count}",
      fofNone: "Друзей в списке пока нет",
      needsKey: "Нужен ключ Steam Web API: токен чужие списки друзей не читает",
      progress: "читаю {done} из {total}…",
      failed: "ни один список не прочитался",
      at: "прочитаны {date}",
    },
    clear: "Очистить",
    clearPoolTitle:
      "Удалить игроков из пула: всех или только без признака Prime",
    clearPoolAsk: "Удалить из пула:",
    clearPoolAll: "всех",
    clearPoolNoPrime: "без признака Prime ({count})",
    clearPoolNoPrimeTitle:
      "Оставить в пуле только тех, у кого видели признак Prime: опыт CS2 или игру в Premier. У остальных Prime тоже может быть, просто признака не видно",
    cancel: "отмена",
    clearPoolFriendsTitle:
      "Забыть друзей игроков пула. Следующее чтение возьмёт списки всех игроков пула заново",
    clearFofTitle:
      "Забыть друзей друзей. Прочитать их заново можно кнопкой «Прочитать списки»",
    confirmClear: "Точно? Нажми ещё раз",
    keyNotSet: "Ключ API не задан",
    keySaved: "Ключ API сохранён",
    keyMain: "Используется основной ключ API",
    setKey: "Задать ключ",
    changeKey: "Изменить ключ",
    hideKey: "Скрыть",
    searching: "поиск…",
    updatedAt: "обновлено в {time}",
    needAuth: "Сначала введи токен или ключ Steam Web API и SteamID64.",
    searchingEmpty: "Ищу игроков на официальных серверах…",
    nothingFound:
      "Сейчас никого не нашёл на официальных серверах в обычном режиме. Поиск продолжается.",
    fofTitle: "Друзья друзей",
    fofKeyPlaceholder: "Ключ Steam Web API (32 символа)",
    fofKeySave: "Сохранить",
    fofNeedsKey:
      "Чтобы читать списки друзей — друзей твоих друзей и игроков пула, — нужен ключ Steam Web API: токен чужие списки не читает.",
    fofKeySaved:
      "Ключ сохранён. Списки друзей читаются, только когда нажмёшь «Прочитать списки»; ключ можно удалить — найденные игроки останутся, но новых через друзей не прибавится.",
    fofKeyDelete: "Удалить ключ",
    fofKeptWithoutKey:
      "Друзья друзей ({count}) сохранены и проверяются без ключа. Ключ нужен, только чтобы прочитать списки заново.",
    fofUsesMainKey: "Для списков друзей используется твой основной API-ключ.",
    fofKeyInvalid: "Это не API-ключ: нужно 32 буквы и цифры.",
    fofKeyError:
      "С этим ключом не прочитался ни один список друзей. Проверь ключ.",
    primeOnly: "Только Prime",
    primeOnlyTitle:
      "Показывать и подключать к карте только серверы, где виден игрок с признаком Prime: опыт CS2 или игра в Premier. Это не гарантия: игрок с Prime мог зайти к другу в матч без Prime. К серверу, выбранному вручную, подключает всегда.",
    primeTag: "Prime",
    primeTagDoubt: "Prime?",
    primeTagTitle:
      "Игроков с признаком Prime на сервере: {count}. Признак — опыт CS2 или игра в Premier; что Prime здесь у всех, он не обещает.",
    // What the check of their friends found, after primeTagTitle
    primeCheck: {
      alone:
        "Игрок с признаком Prime, рядом нет его друзей: скорее всего, пришёл через поиск. Друзей, скрывших игровую информацию, не видно.",
      "prime-friends":
        "Игрок с признаком Prime играет с друзьями, у которых тоже есть признак Prime. Друзей, скрывших игровую информацию, не видно.",
      friend:
        "Игрок с признаком Prime играет с другом без признака Prime: мог зайти к нему в матч без Prime.",
      pending: "Друзей игрока с признаком Prime ещё не проверили.",
      "no-key": "Друзей проверить не удалось: нет ключа API.",
      closed:
        "Друзей проверить не удалось: список друзей закрыт или не прочитался.",
    },
    primeServersTag: "Prime: {count}",
    primeServersTitle:
      "Серверов, где виден игрок с признаком Prime: {count} из {total}",
    noPrimeServers:
      "Сейчас нет серверов, где виден игрок с Prime. Остальные скрыты переключателем «Только Prime». Поиск продолжается.",
  },

  update: {
    available: "Доступно обновление {version}",
    install: "Установить",
    installTitle: "Скачает обновление и перезапустит приложение",
    confirm: "Установить обновление {version}? Приложение перезапустится",
    yes: "Да",
    no: "Нет",
    downloading: "Скачивается обновление {version}",
    size: "{transferred} из {total} МБ",
    percent: "{percent}%",
    installing: "Установка обновления {version} и перезапуск…",
    failed: "Обновление {version} не скачалось",
    retry: "Повторить",
    ready: "Обновление {version} скачано",
  },

  gsi: {
    label: {
      active: "CS2 на связи",
      waiting: "Ждём CS2",
      restart: "Перезапусти CS2",
      "other-account": "CS2 на другом аккаунте",
      unavailable: "GSI выключен",
      error: "Ошибка GSI",
    },
    active:
      "CS2 Game State Integration подключена: приложение получает состояние игры прямо из CS2.",
    waiting:
      "CS2 Game State Integration настроена и подключится, когда запустится CS2.",
    restart:
      "CS2 Game State Integration только что настроена. Если CS2 уже запущена, перезапусти её один раз.",
    otherAccount:
      "CS2 запущена на другом аккаунте Steam, а не на указанном здесь, поэтому её данные не используются.",
    unavailable:
      "Папка CS2 не найдена, поэтому Game State Integration выключена. Приложение использует Steam Web API.",
    error:
      "Не удалось настроить CS2 Game State Integration. Приложение использует Steam Web API.",
    launchHint: "Нажми, чтобы запустить CS2.",
  },

  errors: {
    pleaseEnterSteamIdAndApiKey: "Введи свой SteamID64 и API Key",
    noFriendsFound: "В твоём списке друзей никого не найдено.",
    tokenRejected: "Steam не принял токен, получи новый.",
    keyRejected: "Steam не принял ключ, проверь его.",
    rateLimited:
      "Steam просит подождать: слишком много запросов. Попробуй чуть позже.",
    steamUnavailable: "Steam сейчас недоступен, попробуй позже.",
    steamError: "Steam ответил ошибкой {status}, попробуй позже.",
    noConnection:
      "Не удалось связаться со Steam. Проверь интернет и попробуй ещё раз.",
    unexpected: "Что-то пошло не так: {message}",
  },

  validation: {
    urlMustBeString: "URL должен быть строкой",
    notSteamCommunityUrl: "Это не URL сообщества Steam",
    unrecognizedSteamUrl: "Неизвестный формат ссылки Steam",
    validSteamIdRequired: "Требуется корректный SteamID64",
    validAuthRequired: "Требуется корректный API Key или токен",
    vanityNeedsAuth:
      "Сначала введи токен или API-ключ, чтобы распознать ссылку на профиль",
    vanityResolving: "Распознаю ссылку на профиль...",
    vanityNotResolved:
      "Не удалось распознать ссылку на профиль. Введи SteamID64 вручную.",
    vanityError: "Ошибка при распознавании ссылки на профиль: ",
  },

  tutorial: {
    stepCounter: "{current} из {total}",
    step1Title: "Добро пожаловать в Casual Enjoyer",
    step1Content:
      "Короткое обучение по основным функциям.<br>Используй кнопки ниже для навигации.",
    keyHint: "Enter — далее, Backspace — назад, Esc — пропустить.",
    step2Title: "Токен Steam",
    step2Content:
      "Нажми на подсвеченную ссылку, чтобы открыть помощь со ссылкой на страницу токена в Steam.",
    step3Title: "Получение токена Steam Web API",
    step3Content:
      "Нажми на подсвеченный текст для открытия Steam.<br>Страница может быть чёрной — просто тыкни по странице, нажми Ctrl+A, затем Ctrl+C, чтобы скопировать токен.",
    step4Title: "Вставь токен",
    step4Content:
      "Вставь токен (Ctrl+V) в подсвеченное поле.<br>Токен истекает через 24 часа, при необходимости получи новый.",
    step5Title: "Загрузи друзей",
    step5Content:
      "Нажми на подсвеченную кнопку, чтобы загрузить друзей из Steam со статусом игры.",
    step6Title: "Фильтруй друзей",
    step6Content: "Введи текст для фильтрации по нику если необходимо.",
    step7Title: "Отображение списка друзей",
    step7Content: "Друзья, играющие в Casual, появятся в этом списке.",
    step8Title: "Присоединись к игре друга",
    step8Content:
      "Например, твой лучший друг <strong>Gabe Newell</strong> играет в Casual на Dust 2.<br>Нажми «Подключиться», чтобы автоматически подключиться к его матчу!",
    step9Title: "Процесс подключения",
    step9ContentTop:
      "Метка рядом со счётом показывает, что происходит: «есть место» или «мест нет» до подключения, «подключаемся…» после попытки, «ждём место», пока сервер полон, и «на сервере ✓», когда ты зашёл. Друг на твоём сервере помечен «вы вместе», к нему подключаться не нужно.",
    step9ContentNote1:
      "Пока ждём место, приложение подключится само, как только оно освободится.",
    step9ContentNote2:
      "Полоса над вкладками показывает попытку с любой вкладки, там же её можно отменить.",
    step9ContentNote3:
      "В это время CS2 покажет ошибки соединения (это нормально) — удерживай ESC в игре, чтобы закрыть все.",
    step10Title: "Обучение завершено!",
    step10ContentTop:
      "Поздравляем! Ты завершил обучение и узнал об основных функциях.<br><br>Приятного пользования Casual Enjoyer!",
    step10ContentNote1: "Надеюсь, приложение будет полезным.",
    step10ContentNote2: "Если понравилось — расскажи друзьям.",
    githubReleases: "GitHub Releases",
    linkCopied: "Ссылка скопирована",
    copyFailed: "Не удалось скопировать",
  },
};
