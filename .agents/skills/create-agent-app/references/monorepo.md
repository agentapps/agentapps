# In the agentapps monorepo

This file exists only in the monorepo copies of the skill. It adds the repo's own rules to the
steps in `SKILL.md`. The repo's `AGENTS.md` has the general rules (logos, annotations, secrets,
git); this page has what you need while building an app.

## Setup (once per checkout)

```bash
pnpm install --frozen-lockfile && pnpm build
```

On Node 26 the install hangs or fails in the Playwright postinstall; use
`pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild` instead (and
`pnpm install --ignore-scripts` without `--frozen-lockfile` when the lockfile must change).

## Commands, monorepo style

| SKILL.md says | Run here |
|---|---|
| `create-agent-app <id> ...` | `node packages/create/dist/cli.js <id> ...` from the repo root. It detects the monorepo, writes `apps/<id>/` with workspace dependencies and adds `{ "source": "./apps/<id>" }` to `agentapps.example.json`, right after the entry that sorts just before it, so apps built in parallel do not conflict there. |
| `npm test` | `pnpm vitest run apps/<id>` |
| `npm run typecheck` | `pnpm --filter @agentapps/example-<id> typecheck` (tsc on `src/`, then on `test/`) |
| `npx biome check .` | `pnpm exec biome check apps/<id>` |
| `create-agent-app check-app` | `node packages/create/dist/cli.js check-app apps/<id>` (also checks the `agentapps.example.json` entry and the lockfile importer; add `--strict` before the PR) |
| `create-agent-app health` | `node packages/create/dist/cli.js health apps/<id>` |
| `agentapps ...` | `node packages/cli/dist/bin.js ...`, the CLI built from this checkout (a globally installed `agentapps` may point at another checkout) |

After scaffolding, run `pnpm install` so pnpm writes the app's `apps/<id>:` importer into
`pnpm-lock.yaml`. Never edit the lockfile by hand. A new app always changes the lockfile this
way (`check-app` and `--frozen-lockfile` need the importer): that is expected and adds no
dependency. pnpm may also rewrite one existing snapshot key the first time an importer with a
new peer combination appears (the `@vitest/mocker` entry); keep that hunk as pnpm wrote it. Before the PR, `pnpm install --lockfile-only`
must leave no diff. Two PRs that add importers next to each other conflict: keep both blocks in
alphabetical order and run pnpm again.

## House conventions

- Author `{ "name": "Pablo Lopez Torres", "email": "pablolopeztorres@gmail.com" }`, license MIT, `terms`
  `https://agentapps.tech/terms` (the scaffold sets these in repo mode).
- Package name `@agentapps/example-<id>`, private, `workspace:*` dependencies (the scaffold).
- Ids: `app.google.<product>` and `app.microsoft.<product>` for those vendors' apps (directory
  `google-<product>`; scaffold with `--id app.google.<product>`), `app.<service>` otherwise.
- OAuth: start from `--auth oauth2`; its client is the model. The existing OAuth apps predate
  `ctx.auth.refresh()`: `apps/microsoft-excel` refreshes inside the app with the client secret,
  and `apps/google-analytics` also uses `googleapis` and parses `EXPIRY_DATE` as milliseconds
  (the host writes an ISO date). Do not copy their token handling.
- The best hand-written reference app is `apps/microsoft-excel` (spec:
  `docs/specs/microsoft-365/`). Many older apps predate the current schema: do not copy them.
- Decision notes for non-obvious boundaries go in `docs/specs/<app>/`.
- The `access` field: check `packages/protocol/src/app-manifest.ts` for it before using it.

## Live test

Use the CLI from this checkout with a scratch config (see `live-testing.md`):

```bash
aa() { node "$PWD/packages/cli/dist/bin.js" --config "$SCRATCH/agentapps.json" "$@"; }
```

Run it from the repo root so `$PWD` resolves. Back up and restore `~/.agentapps/config.json`
around the run: a CLI started from a worktree rewrites its `workspace` entry.

## Fresh-container install check

Commit first: the script archives `HEAD`, so a file you forgot to add fails here.

```bash
scripts/agent-skills/create-agent-app/scripts/fresh-container-check.sh <app-dir> [<alias>] [<read-tool> key:value ...]
```

`<app-dir>` is the directory under `apps/`; the script reads the app id from its
`agentapp.json`, so `google-ads` with id `app.google.ads` works. `IMAGES=ubuntu:24.04` runs one
image only. macOS has no `timeout` command, so do not wrap Docker checks in one; OrbStack's
Docker works.

It runs on `ubuntu:24.04` and `debian:stable-slim` pulled fresh, with nothing mounted: as root it
only creates a normal user and installs curl, git and certificates; as that user it installs
Node with nvm and pnpm through corepack as the README says, then a frozen install, build, the
app's tests, `check-app`, `agentapps apps / info / install / tools` and one read-only call if
given (no secrets go into the container). Every image must print `RESULT: PASS`. If Docker is
not available, say so in the PR instead of skipping silently.

## Full checks before the PR

```bash
pnpm install --frozen-lockfile        # Node 26: add --ignore-scripts && pnpm rebuild esbuild
pnpm build && pnpm lint && pnpm test
node packages/create/dist/cli.js check-app --strict apps/<id>
```

## Git and PR

- Branch `feat/<id>` off the branch the user names. Conventional commits, no `Co-Authored-By`
  trailer, comments in English.
- Never push without the user's consent; never merge your own PR.
- Never run a bare `git stash` (the stash is shared between worktrees); use a WIP commit.
- App-only PRs (`@agentapps/example-*`) need no changeset; a PR that touches `packages/` does
  (`pnpm changeset`).
- The PR description follows the short template in `ship-it.md`; base it on the branch the user
  names and put `Depends on #N.` on its own line when stacked.
