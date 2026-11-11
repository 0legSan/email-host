# Working on Email Host

Read the [project glossary](glossary.md), [architecture map](docs/public/architecture.md), and [contributor guide](CONTRIBUTING.md) before changing the relevant area. Follow the user's language and task scope.

## Code and checks

- Read affected files and callers before editing. Use `rg` for text/path searches. Preserve unrelated local work.
- Keep changes focused. Do not add dependencies, a new abstraction, or a broad refactor without a concrete need in the task.
- Use Bun 1.3.5 and the checked-in lockfiles. Package commands in `package.json` are the source of truth.
- Run the affected package's lint and typecheck before its build. Check affected consumers of shared packages.
- Add tests for reproducible behavior or meaningful invariants. A build does not prove a user scenario; verify the relevant runtime and state what was not tested.
- Keep manually maintained source files at or below 1000 physical lines. Do not compress or move unrelated code to satisfy the limit.
- Comment reasons and non-obvious invariants. Avoid narrating code that names its own behavior.

## Where to work

| Area                                                           | Owner in the tree                                  |
| -------------------------------------------------------------- | -------------------------------------------------- |
| Browser behavior, routes, data/offline/PWA integration         | `apps/web`                                         |
| Shared mail views, compose/settings presentation, locale/theme | `packages/mail-design`                             |
| Shared controls and rich-text editing                          | `packages/ui`, `packages/editor-ui`                |
| Mail services, HTTP routes, authentication, IMAP/SMTP          | `packages/mail-agent`                              |
| Schema and Convex queries/operations                           | `convex`                                           |
| Website and fictional demo adapters                            | `apps/site`                                        |
| New public installation and image packaging                    | `deploy/public`, `scripts/build-public-release.sh` |

The quickest UI environment is `bun run --cwd apps/site dev`, then `/demo/` on port 4176. It needs no backend. Reuse a suitable existing server for the same checkout. Do not replace the demo's isolated transport with a real user's backend.

## Data and deployment boundaries

- Never publish `.env`, keys, provider credentials, session tokens, real email, database exports or unredacted logs/screenshots.
- Use synthetic data and separate instances for installer, backend, migration and recovery checks. Production is not a test fixture.
- Do not change schema, deploy functions, import owner data, push commits or change a live server unless the user explicitly requested that action.
- Do not run an owner import against a running service. Imports require a verified empty isolated target before API workers start.
- Preserve encryption keys and persistent volumes during retries. Repeating the installer is not an upgrade or restore operation.
- Do not delete unknown files/containers/volumes or overwrite local changes to bypass a failure. Understand the state first. New branches, worktrees and repository copies require explicit user consent.
- Image build/release preparation is local. Publication is a separate action. Use versioned artifacts and retain an explicit rollback path when changing a deployment.

## UI and documentation

Use the existing components, tokens and SVG icon system. Preserve responsive behavior, direct-angle controls, light/dark themes, both languages and keyboard use. Check the affected flow in the real browser. Demo screenshots show fictional data and should keep that provenance clear.

Keep the glossary and architecture map current when a change affects a documented concept or boundary. Preserve agreed meanings; ask before redefining a domain term. Explain the result, validation and remaining uncertainty in change reports.

Original code is MIT. Third-party components keep their own licenses, including the separate Convex backend's terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Report security issues through [SECURITY.md](SECURITY.md).
