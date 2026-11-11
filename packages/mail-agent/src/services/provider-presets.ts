export type MailProviderPreset = {
  imap: {
    host: string
    port: number
    secure: boolean
  }
  smtp: {
    host: string
    port: number
    secure: boolean
  }
}

export const mailProviderPresets = {
  gmail: {
    imap: {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
    },
  },
  yandex: {
    imap: {
      host: "imap.yandex.ru",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.yandex.ru",
      port: 465,
      secure: true,
    },
  },
  mailru: {
    imap: {
      host: "imap.mail.ru",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.mail.ru",
      port: 465,
      secure: true,
    },
  },
  rambler: {
    imap: {
      host: "imap.rambler.ru",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.rambler.ru",
      port: 465,
      secure: true,
    },
  },
  beget: {
    imap: {
      host: "imap.beget.com",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.beget.com",
      port: 465,
      secure: true,
    },
  },
} satisfies Record<
  "gmail" | "yandex" | "mailru" | "rambler" | "beget",
  MailProviderPreset
>
