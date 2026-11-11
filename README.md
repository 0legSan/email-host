<p align="center">
  <img src="apps/web/public/logo.svg" alt="Email Host" width="280">
</p>

# Email Host

Self-hosted mail workspace for reading, searching, and sending email. Connect existing IMAP/SMTP accounts and work with them through a web interface or PWA.

[Website and fictional demo](https://emailhost.olegsan.tech/) · [Installation](docs/installation.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Project status

The public deployment and installer are being prepared for the first release. No supported public image/archive release is available yet. Do not treat a development build as a verified installation for other people's mail.

## Features

- Multiple mailboxes, account profiles and a unified mail list.
- Reading, search, composing and sending through existing mail providers.
- Russian and English interfaces, light/dark themes and a configurable accent color.
- Web/PWA access and offline access to previously downloaded mail. Offline availability depends on what this browser has saved.
- Owner-managed invitations for separate users of the same installation.

Email Host connects existing accounts. It is not an SMTP/IMAP server that issues new public email addresses.

## Install on your server

The first public release is designed for ready-made Docker images and an installer that asks for deployment mode and domain names. It supports a standalone server, existing Docker Traefik, or host Nginx. Users will not need Bun, Node.js or an application build on their server.

See [installation status, requirements and deployment modes](docs/installation.md). The public curl endpoint will be enabled after image/archive publication and installation verification.

## Try the demo or develop locally

The bilingual marketing site is in apps/site. Its /demo/ uses the actual mail interface with fictional local data and simulated sending, without a mail backend.

```sh
bun install --frozen-lockfile
bun run --cwd apps/site dev
```

See [site documentation](apps/site/README.md) and [contributor instructions](CONTRIBUTING.md).

## License

Email Host's original code is available under the [MIT License](LICENSE). Third-party components retain their own licenses. In particular, the separately distributed Convex backend has its own terms. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Maintainer operations

The maintainer's existing production deployment is separate from the public installation described here. Use the public deployment files for a new installation.
