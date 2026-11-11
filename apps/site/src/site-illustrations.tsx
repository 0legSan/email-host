import {
  IconMail,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconDatabase,
} from "@tabler/icons-react"
import { EmailHostLogo } from "@workspace/mail-design"
import { type Locale } from "./content"

export function SyncIllustration({ locale }: { locale: Locale }) {
  return (
    <div className="sync-diagram" aria-hidden="true">
      <div className="sync-sources">
        <span>
          <IconMail size={19} />
          oleg@work.example
        </span>
        <span>
          <IconMail size={19} />
          oleg@home.example
        </span>
      </div>
      <div className="sync-wire">
        <i />
        <span>IMAP</span>
      </div>
      <div className="sync-hub">
        <EmailHostLogo />
        <strong>Email Host</strong>
        <span>
          <IconDatabase size={14} />
          Convex
        </span>
      </div>
      <div className="sync-wire outgoing">
        <i />
        <span>{locale === "ru" ? "Подписки" : "Subscriptions"}</span>
      </div>
      <div className="sync-destination">
        <div className="sync-endpoints">
          <IconDeviceLaptop size={40} stroke={1.3} />
          <IconDeviceMobile size={28} stroke={1.3} />
        </div>
        <strong>Web + PWA</strong>
        <span>
          {locale === "ru"
            ? "Список обновляется сам"
            : "Your view updates itself"}
        </span>
      </div>
    </div>
  )
}

export function DeviceIllustration() {
  return (
    <div className="device-illustration" aria-hidden="true">
      <svg className="device-connections" viewBox="0 0 480 300" fill="none">
        <path d="M90 82H240V152M240 152V240H392" />
        <path
          className="device-connection-pulse"
          d="M90 82H240V152M240 152V240H392"
        />
      </svg>
      <div className="device-core">
        <EmailHostLogo />
      </div>
      <div className="device-node web-node">
        <IconDeviceLaptop size={58} stroke={1.2} />
        <span>Web</span>
      </div>
      <div className="device-node pwa-node">
        <IconDeviceMobile size={48} stroke={1.2} />
        <span>PWA</span>
      </div>
    </div>
  )
}
