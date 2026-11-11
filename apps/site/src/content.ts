export type Locale = "ru" | "en"

export const copy = {
  ru: {
    nav: ["Возможности", "Синхронизация", "Развёртывание"],
    demo: "Открыть демо",
    title: "Вся ваша почта.\nВ одном окне.",
    intro:
      "Один раз разверните Email Host, подключите свои почтовые ящики и работайте с письмами через веб или PWA.",
    hint: "Без регистрации. Только демонстрационные письма.",
    changeAccent: "Выбрать свой цвет",
    loadingDemo: "Загружаем демонстрационную почту…",
    previewInteract: "Управлять демо",
    previewExit: "К просмотру сайта",
    previewBrowseHint: "Прокрутка листает сайт",
    previewActiveHint: "Esc возвращает к сайту",
    demoFrame: "Настоящее приложение Email Host с вымышленными письмами",
    accounts: "Почтовые ящики",
    personalSpace: "Личное пространство",
    unified: "Единый список писем",
    explore: "Посмотрите, как это работает",
    preview: "Ваш обычный день, в одном окне",
    previewText:
      "Личные письма и рабочая переписка рядом. Выберите ящик, найдите письмо и откройте его, не меняя приложение.",
    scenarios: ["Все ящики", "Работа", "Личное"],
    search: "Найти письмо",
    inbox: "Входящие",
    empty: "Писем по этому запросу нет.",
    reset: "Сбросить поиск",
    samples: "Примеры писем",
    reader: "Чтение письма",
    to: "Кому",
    attachment: "Вложение",
    full: "Попробовать все возможности",
    local: "Настоящее приложение. Только вымышленные письма.",
    syncTitle: "Новые письма приходят.\nИнтерфейс обновляется сам.",
    syncText:
      "Две разные задачи, два механизма. IMAP получает почту, а подписки Convex доставляют изменения из базы в открытый интерфейс.",
    syncSteps: [
      ["Ваши ящики", "Существующие адреса и почтовые провайдеры."],
      [
        "IMAP → Email Host",
        "Сервис синхронизирует письма с почтовым сервером.",
      ],
      [
        "Convex → интерфейс",
        "Подписки обновляют список без ручного обновления страницы.",
      ],
    ],
    syncNote:
      "Время получения письма зависит от провайдера, соединения и режима синхронизации. Реактивный интерфейс не делает сам IMAP мгновенным.",
    ownTitle: "Один экземпляр.\nВаш привычный доступ.",
    ownText:
      "Откройте почту в браузере на компьютере или установите PWA на телефон. Подключённые ящики остаются в одном пространстве.",
    appearance: "Сделайте его своим",
    appearanceText:
      "Светлая или тёмная тема, акцент под ваш вкус. Выбор сохраняется в этом браузере и используется в демо.",
    deployTitle: "Что нужно для своего Email Host?",
    deployText:
      "Это self-hosted проект с открытым исходным кодом. Вы управляете своим экземпляром и отвечаете за его настройку, обновления и резервные копии.",
    deploySteps: [
      [
        "Подготовьте сервер",
        "Docker Compose, домен и HTTPS. Стек включает PostgreSQL, Convex, API и веб-приложение.",
      ],
      [
        "Настройте окружение",
        "Адреса сервисов, секреты авторизации и владельца. Затем запустите компоненты и настройте резервное копирование.",
      ],
      [
        "Подключите ящики",
        "Укажите параметры IMAP и SMTP своих провайдеров. После синхронизации можно читать, искать и отправлять письма.",
      ],
    ],
    source: "Исходный код на GitHub",
    friendsTitle: "Пригласите друзей\nи близких.",
    friendsText:
      "Одного экземпляра Email Host хватит и для ваших близких. У каждого будет свой вход и свои подключённые ящики.",
    friendsSteps: [
      [
        "Создайте приглашение",
        "В настройках пользователей владелец создаёт одноразовую ссылку и задаёт срок её действия.",
      ],
      [
        "Поделитесь ссылкой",
        "Друг или родственник регистрируется и получает собственную учётную запись.",
      ],
      [
        "Подключите свои ящики",
        "Каждый добавляет свою почту. Вы обслуживаете один сервер для всех пользователей.",
      ],
    ],
    faqTitle: "Перед первым запуском",
    faq: [
      [
        "Это новый почтовый адрес?",
        "Нет. Email Host подключается к вашим существующим ящикам. Для получения используется IMAP, для отправки SMTP.",
      ],
      [
        "Что я увижу в демо?",
        "Настоящий интерфейс почты с локальными вымышленными данными. Можно искать, читать и пробовать отправку. Демо не подключается к вашим ящикам и не отправляет реальные письма.",
      ],
      [
        "Нужно ли обслуживать сервер?",
        "Да. Самостоятельное размещение предполагает настройку, обновления и резервное копирование. Это не готовая облачная подписка.",
      ],
    ],
    end: "Сначала попробуйте свою\nбудущую почту.",
    endText: "Откройте полное демо и пройдите свой обычный сценарий.",
    footer: "Своя почта. Свой экземпляр.",
    top: "Наверх",
    skip: "Перейти к содержимому",
  },
  en: {
    nav: ["Features", "Synchronization", "Self-hosting"],
    demo: "Open demo",
    title: "All your email.\nIn one window.",
    intro:
      "Deploy Email Host once, connect your mail accounts and work with your email on the web or as a PWA.",
    hint: "No sign-up. Sample emails only.",
    changeAccent: "Pick your color",
    loadingDemo: "Loading the demo inbox…",
    previewInteract: "Interact with demo",
    previewExit: "Back to browsing",
    previewBrowseHint: "Scroll to explore the page",
    previewActiveHint: "Press Esc to return to the page",
    demoFrame: "The actual Email Host app with sample emails.",
    accounts: "Mail accounts",
    personalSpace: "Personal workspace",
    unified: "A unified message list",
    explore: "See how it works",
    preview: "Your everyday email, in one window",
    previewText:
      "Personal email and work conversations side by side. Choose an account, find a message and read it without switching apps.",
    scenarios: ["All accounts", "Work", "Personal"],
    search: "Find an email",
    inbox: "Inbox",
    empty: "No emails match this search.",
    reset: "Clear search",
    samples: "Sample emails",
    reader: "Email reader",
    to: "To",
    attachment: "Attachment",
    full: "Try the full app",
    local: "The actual app. Fictional emails only.",
    syncTitle: "New email arrives.\nYour view updates itself.",
    syncText:
      "Two separate jobs, two mechanisms. IMAP retrieves email, while Convex subscriptions deliver database changes to the open interface.",
    syncSteps: [
      ["Your accounts", "Your existing addresses and email providers."],
      [
        "IMAP → Email Host",
        "The service synchronizes messages with your mail server.",
      ],
      [
        "Convex → interface",
        "Subscriptions update the message list without a manual page refresh.",
      ],
    ],
    syncNote:
      "Retrieval time depends on your provider, connection and synchronization mode. A reactive interface does not make IMAP itself instantaneous.",
    ownTitle: "One instance.\nAccess that fits your day.",
    ownText:
      "Open your email in a desktop browser or install the PWA on your phone. Your connected accounts share one workspace.",
    appearance: "Make it yours",
    appearanceText:
      "A light or dark theme and your choice of accent. Your preferences stay in this browser and carry over to the demo.",
    deployTitle: "What do you need to self-host?",
    deployText:
      "Email Host is an open-source, self-hosted project. You manage your instance, including its configuration, updates and backups.",
    deploySteps: [
      [
        "Prepare a server",
        "Docker Compose, a domain and HTTPS. The stack includes PostgreSQL, Convex, an API and a web app.",
      ],
      [
        "Configure the environment",
        "Set service URLs, authentication secrets and owner credentials. Start the components and configure backups.",
      ],
      [
        "Connect your accounts",
        "Enter your providers’ IMAP and SMTP settings. Once synchronized, you can read, search and send email.",
      ],
    ],
    source: "Source code on GitHub",
    friendsTitle: "Invite your friends\nand family.",
    friendsText:
      "Your Email Host instance can serve the people close to you too. Each person gets their own login and connected mail accounts.",
    friendsSteps: [
      [
        "Create an invitation",
        "The owner creates a single-use registration link in user settings and chooses its expiry date.",
      ],
      [
        "Share the link",
        "Your friend or family member registers and gets their own user account.",
      ],
      [
        "Connect your mail",
        "Everyone adds their own accounts. You maintain one server for all users.",
      ],
    ],
    faqTitle: "Before you start",
    faq: [
      [
        "Do I get a new email address?",
        "No. Email Host connects to your existing accounts. It uses IMAP to retrieve email and SMTP to send it.",
      ],
      [
        "What is in the demo?",
        "The actual mail interface with fictional local data. Search, read and try sending. The demo does not connect to your accounts or send real email.",
      ],
      [
        "Do I need to maintain a server?",
        "Yes. Self-hosting includes configuration, updates and backups. This is not a managed cloud subscription.",
      ],
    ],
    end: "Try your next\nemail workspace.",
    endText: "Open the full demo and walk through your everyday workflow.",
    footer: "Your email. Your instance.",
    top: "Back to top",
    skip: "Skip to content",
  },
}
