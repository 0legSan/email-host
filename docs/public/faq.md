# Questions before installing

## Is this a mail server?

Email Host is a web mail client that runs on your server. You bring existing IMAP/SMTP accounts. Their providers still receive and send mail; Email Host connects to them and stores the data needed for its interface and synchronization.

## Can I try it without installing anything?

Yes. Open the [English demo](https://emailhost.olegsan.tech/demo/?lang=en) or [Russian demo](https://emailhost.olegsan.tech/demo/?lang=ru). It uses the real interface with fictional local data. No real messages are sent, no real mailbox is connected, and the demo is not a backend performance benchmark.

## What hardware and architectures were checked?

The release provides Linux amd64 and arm64 bundles. The isolated Ubuntu 24.04 Docker lab ran ARM64 natively and AMD64 executables under emulation on an ARM host. Its application Docker daemon had a 2800 MiB memory limit and 3 CPUs; the separate wizard runner had 768 MiB and 2 CPUs. Those limits describe the test environment, not a supported minimum or capacity benchmark for real mailboxes. Native AMD64 host boot, mailbox sizes and long-running workloads remain unverified. Allow additional disk space for mail, database growth and backups.

One runtime bundle is about 470 to 485 MiB compressed, depending on architecture. The installer downloads only the matching bundle. Docker expands its layers, so the download size is not the application's total disk requirement.

## Why does the installer ask for three domains?

The application, self-hosted Convex backend and Convex HTTP actions use separate public origins. Point all three DNS names to the installation server. The wizard proposes the two service names from the application name. Every name needs working HTTPS. See [the setup guide](installation.en.md).

## Does the owner login need to be an existing mailbox?

No. The generated `owner@<application-domain>` is an application login. The installer generates its password and prints the path of a private server file containing it. You connect actual mailboxes after signing in.

## Do I need to build the app or use a container registry?

No application build is needed on the installation server. The installer downloads versioned image archives from the project website, verifies them, and runs `docker load`. Names such as `ghcr.io/0legsan/email-host-api` inside the loaded archive are local image identifiers; they do not mean your server must download the image from GHCR.

## Which proxy mode should I use?

| Existing server                          | Mode                  |
| ---------------------------------------- | --------------------- |
| Empty server with ports 80/443 available | Standalone with Caddy |
| Traefik in Docker                        | Existing Traefik mode |
| Nginx running directly on the host       | Host Nginx mode       |

Traefik reuses an existing network and HTTPS settings. Nginx mode creates a separate configuration and instructions for connecting it to your TLS setup. The wizard does not guess arbitrary proxy layouts. Containerized Nginx and Docker Swarm are outside the automatic first-release path.

## Can I run the installer again after an error?

Yes, use the same installation directory and configuration. The installer is designed to continue without changing existing secrets. Do not delete `.env` or generate replacement encryption keys to force a retry. If the problem is DNS or HTTPS, fix it and rerun the installer. Switching versions, domains or proxy modes is a separate operation, not a retry.

## Does a repeated install update the app?

No. There is no verified general upgrade, rollback or backup restoration procedure in this beta. Keep encrypted copies of configuration and keys, and protect persistent database/runtime volumes. A container image alone is not a data backup. Never use `docker compose down -v` as an update command because it deletes data volumes.

## Does offline access keep all my mail?

Only previously downloaded data in that browser is available offline. A cached row in the message list does not guarantee that its complete body was saved. Another device or a cleared browser may have a different cache. Offline storage is not a backup of the server.

## What about provider passwords and OAuth?

OAuth connection is disabled in this version. Connect accounts through IMAP and SMTP. You need access to the provider's IMAP and SMTP services. Follow its authentication requirements and use an app password when required. A provider's normal website login does not automatically grant access to mail protocols. Check your host's outbound SMTP restrictions as well.

## Is it ready for critical mail?

This is an early beta. Use an isolated installation first, read the [current verification scope](../installation.md), and test your own provider's reading and sending. Installation checks do not establish IMAP/SMTP compatibility for every provider, server reboot behavior, recovery readiness, or an availability guarantee.

## Is the whole distribution MIT?

MIT covers Email Host's original code. The separate Convex backend uses FSL-1.1-Apache-2.0, and other dependencies and base images retain their own licenses. Read [third-party notices](../../THIRD_PARTY_NOTICES.md) before redistributing or operating a modified distribution.

## How do other people get access?

The owner creates an invitation link with an expiry. A new user registers their own application login and connects their own mailboxes. An invitation does not automatically share the owner's mail. The public demo does not create real invitations.

## Where should I report a bug or vulnerability?

Use [GitHub issues](https://github.com/0legSan/email-host/issues) for reproducible bugs and questions. Include the release, architecture, proxy mode and a redacted error message. Do not post credentials or real mail. Report vulnerabilities through [SECURITY.md](../../SECURITY.md).
