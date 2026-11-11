# Upstream source references

Checked on 2026-11-11. These references accompany the unmodified upstream components in Email Host beta. Image content digests and the selected architecture are recorded separately in each release provenance. Source references are not a replacement for keeping applicable licenses and copyright notices.

| Distributed component | Source and build information |
| --- | --- |
| Convex backend, digest `sha256:467964cc6af57ba3e757e3e6cb1fa09a1c577803a19f03f0f42c9c4b134b070c` | Producer revision `19431ea0dd90bc55ae58dbbd06d9aa045f97336f`, https://github.com/convex/convex-backend/tree/19431ea0dd90bc55ae58dbbd06d9aa045f97336f and https://github.com/convex/convex-backend/archive/19431ea0dd90bc55ae58dbbd06d9aa045f97336f.tar.gz |
| PostgreSQL 17.10, parent image digest `sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193` | https://github.com/postgres/postgres/tree/REL_17_10 and https://ftp.postgresql.org/pub/source/v17.10/ ; container build scripts https://github.com/docker-library/postgres |
| Caddy 2.10.2 | https://github.com/caddyserver/caddy/tree/v2.10.2 ; container build scripts https://github.com/caddyserver/caddy-docker |
| Nginx 1.30.6 | https://github.com/nginx/nginx/tree/release-1.30.6 and https://nginx.org/download/ ; container build scripts https://github.com/nginx/docker-nginx |
| Bun 1.3.5 | https://github.com/oven-sh/bun/tree/bun-v1.3.5 ; third-party dependency sources and build scripts are in that source tree |
| web-push 3.6.7 | Exact published JavaScript source https://registry.npmjs.org/web-push/-/web-push-3.6.7.tgz ; repository https://github.com/web-push-libs/web-push/tree/v3.6.7 |
| lightningcss 1.33.0 in the API image dependency inventory | https://github.com/parcel-bundler/lightningcss/tree/v1.33.0 and https://github.com/parcel-bundler/lightningcss/archive/refs/tags/v1.33.0.tar.gz |
| lightningcss 1.32.0 in the web build inventory | https://github.com/parcel-bundler/lightningcss/tree/v1.32.0 ; build tools are not copied into the final web image |

The source form of unmodified JavaScript dependencies is also present in the API image under `/app/node_modules`. Its inventory records installed names and versions. The browser image contains the final built web assets and a dependency license inventory. It does not contain native Sharp/libvips build binaries from its discarded build stage.

Alpine Linux package sources and build recipes are available through https://gitlab.alpinelinux.org/alpine/aports and https://distfiles.alpinelinux.org/distfiles/ . Ubuntu source packages are available through https://archive.ubuntu.com/ubuntu/pool/ and https://launchpad.net/ubuntu/+source . Debian source packages are available through https://deb.debian.org/debian/pool/ and https://sources.debian.org/ . Use the image's `/etc/os-release` and package database to select its exact distribution and package versions. Alpine uses `/lib/apk/db/installed`; Debian and Ubuntu use `/var/lib/dpkg/status`. Retain applicable source availability and other obligations if you redistribute these system packages.

The release's own application source is published at https://github.com/0legSan/email-host . Supplemental package notices use commit-specific upstream URLs or exact npm tarball versions, recorded in `supplemental-sources.json`. The font license copies come from the actual installed Fontsource versions, recorded in `license-files.json`.
