# Contributing

Use an issue to describe a reproducible problem or propose a change. Keep examples fictional and redact server addresses and credentials where appropriate. Send security reports through [the private channel](SECURITY.md).

## Development

The monorepo uses Bun 1.3.5, TypeScript, React and self-hosted Convex. Install dependencies with `bun install --frozen-lockfile`. The marketing site and its fictional demo can run without a mail backend:

```sh
bun run --cwd apps/site dev
```

Run the affected package's lint and type checks before its build. For example:

```sh
bun run --cwd apps/site lint
bun run --cwd apps/site typecheck
bun run --cwd apps/site build
```

Use a separate development instance for real mail/backend work. Do not test migrations, new installers, or deployment scripts against an existing installation. Maintainer production commands are not contributor setup commands.

Keep pull requests focused. Explain the user-visible result, material risks, and checks you actually ran. Add tests for behavior that needs a reproducible check, such as preserving encryption keys during installer retries. Do not add tests that only repeat the implementation.

Original contributions are provided under this repository's [MIT license](LICENSE). Keep applicable third-party copyright and license notices when adding or modifying external code.
