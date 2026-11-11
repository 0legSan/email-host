# Third-party components

The [MIT license](LICENSE) covers Email Host's original code. Dependencies, fonts and container base images retain their own licenses. MIT does not replace their terms or grant rights to upstream trademarks.

## Convex backend

The installer bundles the unmodified Convex backend image with digest `sha256:467964cc6af57ba3e757e3e6cb1fa09a1c577803a19f03f0f42c9c4b134b070c`. Its producer revision label is `19431ea0dd90bc55ae58dbbd06d9aa045f97336f`.

That revision is licensed under **FSL-1.1-Apache-2.0**, copyright 2026 Convex, Inc. The license permits use and redistribution for its defined Permitted Purposes and restricts Competing Use. Do not treat this backend as presently licensed only under Apache-2.0. The future Apache grant takes effect two years after the relevant software version was made available.

Read the actual terms before redistributing a product built on this backend: https://github.com/convex/convex-backend/blob/19431ea0dd90bc55ae58dbbd06d9aa045f97336f/LICENSE.md

A copy is included as `CONVEX-LICENSE.md` in the installation archive and in `docs/third-party/` in the source repository. Keep the terms and upstream copyright notices when passing on the backend. Email Host provides a mail workspace rather than a replacement backend platform. This description does not expand the rights granted by Convex.

## Application dependencies and fonts

Public API and web images contain installed dependency inventories and supplied license texts at `/usr/share/licenses/third-party`. These inventories include build tools. An inventory entry does not mean that its package is present in browser JavaScript or the final image. The final web image contains built assets, not the build-stage `node_modules`.

Some packages declare their license in `package.json` or a README instead of a root LICENSE file. `SUPPLEMENTAL-NOTICES.txt` accompanies the release with recovered notices and terms; `supplemental-sources.json` records the exact upstream revisions or published package archives used. This supplement does not replace notices already inside the images.

| Component | Terms and source |
| --- | --- |
| Convex JavaScript client and CLI | Apache-2.0, https://github.com/convex/convex-js |
| Noto Sans Variable 5.2.10 | OFL-1.1, copyright 2022 The Noto Project Authors, https://github.com/fontsource/font-files/tree/main/fonts/variable/noto-sans |
| Nunito Sans Variable 5.2.7 | OFL-1.1, copyright 2016 The Nunito Sans Project Authors, https://github.com/fontsource/font-files/tree/main/fonts/variable/nunito-sans |
| web-push 3.6.7 | MPL-2.0, unchanged JavaScript source is present in the API image; published source https://registry.npmjs.org/web-push/-/web-push-3.6.7.tgz |
| lightningcss 1.33.0 | MPL-2.0, upstream source https://github.com/parcel-bundler/lightningcss/tree/v1.33.0 |

The two font copyright notices and full OFL text accompany the release as `NOTO-SANS-OFL.txt` and `NUNITO-SANS-OFL.txt`. The license applies to the font software; it does not relicense documents or screenshots made using the fonts. The full MPL is included as `MPL-2.0.txt`; preserve the license and source availability for its covered files when distributing them.

## Base images and source availability

Bun, Nginx, PostgreSQL, Caddy and the operating-system packages in their images have their own notices and source obligations. The original upstream images are bundled without modifying their software or removing their notices. Retagging an image does not put its contents under MIT.

`UPSTREAM-SOURCES.md` identifies the pinned components, source trees and package source channels. `BUN-LICENSE.md`, `NGINX-LICENSE.txt`, `POSTGRESQL-LICENSE.txt` and `CADDY-LICENSE.txt` accompany the installation. Additional notices inside upstream images remain applicable. Refer to the versioned release provenance for image content digests.

For questions about the source and notices distributed with Email Host, contact my@olegsan.ru. When reporting a missing notice, identify the release, architecture and component without including server secrets or mail content.
