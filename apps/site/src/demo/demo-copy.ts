import type { MailLocale } from "@workspace/mail-design/locale"

export const demoCopy = {
  ru: {
    name: "Олег",
    accountNames: ["Студия", "Личный", "Проекты"],
    profiles: ["Работа", "Личное"],
    signature: "Рабочая",
    signatureHtml:
      "<p>С уважением,<br>Олег<br>Студия · демонстрация Email Host</p>",
    subjects: [
      "Макеты личного кабинета готовы к обсуждению",
      "План встречи команды на четверг",
      "Счёт за поддержку сервиса",
      "Комментарии к проекту библиотеки",
      "Подтверждение записи на мастерскую",
      "Новая версия технического задания",
      "Фотографии с прогулки",
      "Итоги недели и следующие шаги",
      "Приглашение на встречу книжного клуба",
      "Документы для согласования бюджета",
      "Обновление расписания занятий",
      "Вопрос по интеграции календаря",
    ],
    senders: [
      "Анна Смирнова",
      "Михаил Орлов",
      "Ирина Петрова",
      "Команда поддержки",
      "Алексей Волков",
      "Мария Соколова",
    ],
    greeting: "Здравствуйте, Олег!",
    paragraph:
      "Мы подготовили материалы и собрали комментарии. Посмотрите, пожалуйста, предложенный вариант. Обсудим детали на ближайшей встрече.",
    snippet:
      "Мы подготовили материалы и собрали комментарии. Посмотрите предложенный вариант.",
    disclaimer:
      "Это демонстрационное письмо. Все данные вымышлены, отправка и синхронизация работают только в этой вкладке.",
    ending: "Хорошего дня!",
    filename: "Материалы.txt",
  },
  en: {
    name: "Oleg",
    accountNames: ["Studio", "Personal", "Projects"],
    profiles: ["Work", "Personal"],
    signature: "Work",
    signatureHtml: "<p>Best regards,<br>Oleg<br>Studio · Email Host demo</p>",
    subjects: [
      "Account designs ready for review",
      "Team meeting plan for Thursday",
      "Service support invoice",
      "Feedback on the library project",
      "Workshop booking confirmed",
      "Updated project requirements",
      "Photos from our walk",
      "Weekly recap and next steps",
      "Invitation to the book club",
      "Documents for budget approval",
      "Class schedule update",
      "A question about calendar integration",
    ],
    senders: [
      "Anna Smirnova",
      "Michael Orlov",
      "Irina Petrova",
      "Support team",
      "Alex Volkov",
      "Maria Sokolova",
    ],
    greeting: "Hello Oleg,",
    paragraph:
      "We have prepared the materials and collected the feedback. Please review the proposed version. We can discuss the details at our next meeting.",
    snippet:
      "The materials and feedback are ready. Please review the proposed version.",
    disclaimer:
      "This is a sample email. All data is fictional. Sending and synchronization are simulated locally in this tab.",
    ending: "Have a good day!",
    filename: "Materials.txt",
  },
} satisfies Record<MailLocale, unknown>
