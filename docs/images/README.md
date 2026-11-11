# Screenshot sources

These PNGs were captured on 11 November 2026 from the actual Email Host demo at `/demo/`, using the repository's local site server and Ego Browser. No image generation or interface compositing was used.

| File                  | View                                               | Language | CSS viewport |
| --------------------- | -------------------------------------------------- | -------- | ------------ |
| `inbox-desktop.png`   | Unified inbox and open sample message, light theme | English  | 1440 × 960   |
| `compose-dark.png`    | Compose window with a fictional draft, dark theme  | English  | 1440 × 960   |
| `inbox-mobile-ru.png` | Inbox, light theme                                 | Russian  | 390 × 844    |

All messages and addresses come from the fictional demo, with reserved example domains. The compose image includes a short synthetic draft written for this screenshot. It was not sent. The demo notice remains visible. No real inbox, credentials, cookies or server settings are shown.

To reproduce a view, run `bun run --cwd apps/site dev`, open `/demo/?lang=en` or `/demo/?lang=ru`, and use the demo's theme and language controls. Its reset action clears demo mail data. Wait for responsive layout transitions to finish before capturing a mobile viewport.

These screenshots are project documentation assets under the repository's [MIT license](../../LICENSE). They do not change licenses of third-party software shown or included in the distribution.
