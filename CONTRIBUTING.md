# Contributing

Start with an issue describing the problem, the expected result, and the environment where you can reproduce it. Use fictional examples and remove credentials, mail content, session cookies, and private server addresses. Report vulnerabilities through the [private security channel](SECURITY.md).

## Run the interface locally

Use Bun 1.3.5, as declared in `package.json`. From the repository root:

```sh
bun install --frozen-lockfile
bun run --cwd apps/site dev
```

Open `http://127.0.0.1:4176/demo/?lang=en` or `http://127.0.0.1:4176/demo/?lang=ru`. This runs the actual mail interface with local fictional data and simulated sending. It needs no Docker, API, or Convex backend. Changes to the shared mail components appear in this demo.

The site dev server uses port 4176. Reuse an existing server for the same checkout when possible. See [site documentation](apps/site/README.md) for the demo adapters and limitations.

## Find the code

Read the [architecture map](docs/public/architecture.md) and [glossary](glossary.md). `apps/web` owns application behavior, `packages/mail-design` owns mail presentation, and `packages/mail-agent` owns backend mail services. The website and demo are in `apps/site`.

For API, synchronization, authentication, or schema work, use a separate disposable installation with synthetic data. The [public deployment](deploy/public) is the starting point. Configure the development browser for that instance's Convex URL; do not point a development build or new installer at an existing user's database.

A demo check cannot verify real IMAP/SMTP, JWT authorization, or backend persistence. Test those against your isolated backend and name exactly what was exercised.

## Check a change

Run the affected package's lint and type checks before its build. For a demo or shared mail UI change:

```sh
bun run --cwd apps/site lint
bun run --cwd apps/site typecheck
bun run --cwd apps/site build
```

For web or API changes, use the same commands with `apps/web` or `apps/api`. Shared packages have their own `lint` and `typecheck` scripts. Run the checks for affected consumers too. The frontend architecture check is available as:

```sh
bun run check:frontend-architecture
```

Installer and packaging checks include:

```sh
bash -n deploy/public/install.sh
node --test deploy/public/bootstrap.test.mjs scripts/package-public-images.test.mjs
```

Add tests when they protect reproducible behavior or a meaningful invariant, such as preserving encryption keys during installer retries. Avoid tests that simply repeat the implementation. A successful build alone does not prove the user flow works; verify it in the relevant runtime.

For UI changes, check both languages, light/dark themes, keyboard use, and the affected mobile/desktop layout. Use the fictional demo for screenshots. State any checks you could not perform.

## Open a pull request

Keep the change focused. Explain the concrete problem, resulting behavior, and validation you ran. Describe any schema, deployment, compatibility, or data risks. Do not include `.env`, keys, database dumps, real email, generated release bundles, or unrelated formatting.

Before publishing a release, review the included file list, run a secret scan, inspect binary images, and preserve third-party notices. The [release builder](scripts/build-public-release.sh) prepares local artifacts; it does not upload them. Installation retries are not an upgrade or restore procedure.

Original contributions use this repository's [MIT license](LICENSE). Preserve applicable notices for third-party code and assets. The separately distributed Convex backend has its own terms, described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
