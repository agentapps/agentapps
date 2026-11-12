# Contributing to Agent Apps

Thanks for helping. This file says how a change gets from your machine into `main`. The rules every app
and every change follow are in [`AGENTS.md`](./AGENTS.md); the vocabulary is in
[`docs/glossary.md`](./docs/glossary.md).

## Before you start

- **Node 24 or 26** and pnpm. The [README](./README.md#install) has the setup; `./install.sh` does it in one go.
- Open an issue first for anything bigger than a bug fix or a new app, so we agree on the shape before
  you write it.

## Adding or changing an app

Apps live in `apps/<id>`. The `create-agent-app` skill in `.agents/skills/` walks you (or your coding
agent) through the whole process: whether an app is the right answer, researching the service's API,
designing tools an agent can use safely, scaffolding, tests, the live test and the PR.

```bash
node packages/create/dist/cli.js <id> --base-url <url> [--auth api-key --secrets KEY]   # scaffold
node packages/create/dist/cli.js check-app apps/<id>                                     # repo rules
KEY=... node packages/create/dist/cli.js health apps/<id>                                # real service
pnpm vitest run apps/<id>                                                                # tests
```

Two rules people trip on, both in `AGENTS.md`: tool annotations are declared, never inferred; and logos
come from the brand's official assets, never generated.

## Changing the packages

`packages/` holds the protocol, SDK, Station, Host, CLI, testing harness and scaffolder. A change to the
wire protocol or the SDK's public surface needs an issue first.

```bash
pnpm build && pnpm lint && pnpm test
```

## Pull requests

- One topic per PR. Conventional commit titles: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- Add a changeset for anything that changes a published package: `pnpm changeset`.
- Sign off your commits (`git commit -s`). The `Signed-off-by` line is your
  [Developer Certificate of Origin](https://developercertificate.org/): you wrote the change, or have
  the right to submit it, under the repository's MIT license. No separate CLA.
- CI must be green: lint, build and tests on Node 24 and 26.

## Questions

Open a discussion or an issue. For security reports, see [`SECURITY.md`](./SECURITY.md).
