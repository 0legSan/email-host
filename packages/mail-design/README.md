# `@workspace/mail-design`

Reusable React presentation components and visual tokens for the Email Host mail workspace.

## Consumer contract

- React 19 and a browser runtime.
- Tailwind CSS 4 through the consumer build.
- `@workspace/ui` and `@workspace/editor-ui` available as package dependencies.
- Application data, routing, mutations, caching and PWA behavior are supplied by the consumer.

Import the shared stylesheet once at the application entry point:

```ts
import "@workspace/mail-design/styles.css"
```

Use only the root and documented feature entry points. Paths under `src` or `components` are internal.

Large optional surfaces are separate entry points so consumers can keep them lazy:

```ts
const ComposePanel = React.lazy(() => import("@workspace/mail-design/compose"))
const SettingsPanel = React.lazy(
  () => import("@workspace/mail-design/settings")
)
```

`MailSettingsSurface` provides a full page shell with a named `main` landmark. The application supplies its header, section navigation, scrollable content and return action. `MailWorkspace` accepts `hidden` so the mail DOM and its scroll position can remain mounted while the settings page is visible.

## Interface language

`useMailLocale()` returns `locale`, `intlLocale`, `t(ru, en)`, `setLocale` and `localeSaved`. Both text variants are required. `MailLanguagePicker` uses the same state; no separate locale provider is needed. Mount `MailDocumentLanguage` once in an application entry to synchronize the document language. A marketing site with separate language URLs can own its document language and pass explicit locale to appearance settings.

Pure helpers are available from `@workspace/mail-design/locale`: `mailText`, `getMailLocale`, `getMailIntlLocale` and locale parsing/storage functions. Resolve text at render or call time, rather than caching translated labels at module initialization.

The browser-local choice uses `mail-language`. Explicit `?lang=ru|en` overrides a saved choice, and Russian is the default. Storage events update other documents on the same origin. If storage is blocked, switching still works in memory and the picker reports that it could not save the choice. User content and external diagnostics are not automatically translated.

Editor consumers pass labels and commands through editor-ui's optional labels API. Keep plugin options stable across locale renders. An open signature editing session snapshots its initial document so refreshed demo seed data cannot replace unsaved text. The application and demo share these actual consumers.
