# Install a beta on your server

The installer uses ready images and a short terminal wizard. Read the release notes and [detailed installation status](../installation.md) for the architectures and environments verified for your version. This beta does not yet provide a verified general upgrade or backup restoration procedure.

## Prepare the server

- Use a Linux server with a runtime bundle available for its architecture. Automatic Docker installation uses the official Docker apt repository on Debian/Ubuntu. Other systems need a working Docker Engine and Compose plugin prepared separately.
- Create three distinct DNS names for the application, Convex backend and Convex HTTP actions. Point their A records to this server. Only publish AAAA records if the server's IPv6 route also works.
- Ensure the selected proxy can serve HTTPS for every name. Standalone uses ports 80 and 443. Existing Traefik/Nginx keeps control of its own certificates and other routes.
- Check outbound access to your mail provider, including any hosting restrictions on SMTP.
- Use a terminal with administrator access. The script reads its answers from the terminal even when downloaded through a pipe.

For example, use `mail.example.com`, `convex.mail.example.com`, and `convex-site.mail.example.com`. These example names are not credentials or real endpoints to copy unchanged.

## Choose a mode

```sh
# Empty server, Caddy obtains HTTPS
curl -fsSL https://emailhost.olegsan.tech/install/service-standalone | sudo bash

# Existing Traefik in Docker
curl -fsSL https://emailhost.olegsan.tech/install/service-traefik | sudo bash

# Nginx running on the host
curl -fsSL https://emailhost.olegsan.tech/install/service-nginx | sudo bash
```

The general `/install/service` endpoint asks which mode to use. All paths load the same [installer](../../deploy/public/install.sh). Downloaded scripts run as administrator; review the entry script and common installer before executing them if you need to inspect the changes first.

The wizard asks for the domain names, proposes the two service names from the main name, and shows a plan before you confirm. It generates new secrets, downloads a versioned image bundle, verifies SHA-256 and image identities, initializes the backend, and starts the services. Your server does not build the application or need Bun/Node.js.

Traefik mode reuses an existing Docker network, HTTPS entrypoint and certificate configuration. If detection is ambiguous, the wizard asks you to confirm the relevant setting. It can use an existing ACME resolver or already configured certificates.

Host Nginx mode exposes application ports only on `127.0.0.1`. It writes a separate Nginx configuration and next steps. Review and connect that new configuration using your existing certificate procedure, validate with `nginx -t`, and repeat the installer after HTTPS is ready. Until then it returns an incomplete result rather than declaring a successful public installation. Arbitrary containerized Nginx layouts and Swarm are outside this automatic path.

## First sign-in

The initial login is `owner@<application-domain>`. It is an application identifier, so it does not need an existing mailbox for email verification. The wizard prints the location of its private credentials file, normally `/opt/email-host/credentials.txt`. Read it privately on your server and keep it out of support messages and screenshots.

After signing in, connect a real mailbox through Settings. Use the mail provider's IMAP/SMTP values and authentication requirements. Check receiving and sending for your own provider. The fictional demo cannot perform this check.

## Continue after a failed step

Keep the installation directory, `.env`, keys and volumes. Correct the reported problem, such as DNS or certificate routing, and rerun the saved installer:

```sh
sudo bash /opt/email-host/install.sh
```

Use your chosen directory if you changed the default. Existing configuration and secrets are reused. Do not remove keys or persistent volumes to make a retry appear fresh. The log is private, normally `/opt/email-host/install.log`; redact it before sharing an error report.

A retry does not change an existing installation's release, domains or proxy mode. It is not an application update. If another project or unrecognized data already uses the intended resources, investigate that conflict instead of deleting it.

## Data and maintenance

Protect encrypted copies of the configuration and keys together with persistent PostgreSQL/Convex data outside this server. Images alone do not restore mail or settings. The loss of `MAIL_CREDENTIAL_SECRET` prevents decrypting saved mail-provider credentials.

Do not run `docker compose down -v` for an update; it deletes volumes. There is no verified general backup restoration, upgrade or rollback procedure in this beta. The [FAQ](faq.md), [security reporting guide](../../SECURITY.md), and [third-party notices](../../THIRD_PARTY_NOTICES.md) cover the remaining common questions.
