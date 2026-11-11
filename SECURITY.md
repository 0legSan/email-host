# Security

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/0legSan/email-host/security/advisories/new).

Do not post credentials, session tokens, email contents, or an exploitable vulnerability in a public issue. Include the affected version, deployment mode, expected behavior, and minimal reproduction with fictional data. A response time is not guaranteed.

Until a first supported release is published, this repository is development software. A successful build does not establish that a deployment is safe for storing other people's mail.

## Deployment responsibilities

Keep PostgreSQL and administrative endpoints private. Use HTTPS for public application and Convex endpoints. Protect installation configuration and backups: they contain credentials or the keys needed to decrypt stored mailbox credentials. Share a sanitized configuration when asking for help.

The owner of each installation controls its user accounts, backups, updates, mail provider access, and applicable data protection obligations. Email Host's MIT license does not replace these obligations.
