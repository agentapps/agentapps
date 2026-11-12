# @agentapps/create

> Scaffold, check and package an Agent App (`npm create @agentapps`).

## Create an app

```bash
npm create @agentapps my-app                       # REST API app, no auth
npm create @agentapps crm -- --auth api-key --secrets CRM_API_KEY --base-url https://api.crm.example/v2
npm create @agentapps google-ads -- --id app.google.ads --auth oauth2 --provider google \
  --scopes https://www.googleapis.com/auth/adwords --base-url https://googleads.googleapis.com
npm create @agentapps demo -- --template minimal   # one local tool, no network
pnpm create @agentapps my-app                      # pnpm works too
```

Inside the agentapps monorepo the same command (or `node packages/create/dist/cli.js <id> ...`)
writes `apps/<id>/` with workspace dependencies and lists it in `agentapps.example.json`; run
`pnpm install` afterwards so pnpm records it in the lockfile. Anywhere else it creates a
self-contained project in `./<id>`.

What you get:

- `agentapp.json` and the `createApp()` config in `src/app.ts`, generated from the same data
  (a generated test keeps them equal).
- One file per tool in `src/tools/`, each declaring all five annotations (`readOnlyHint`,
  `destructiveHint`, `idempotentHint`, `openWorldHint`, `sensitive`).
- A health check, a fetch client with timeouts and bounded retries (`api` template).
- `test/harness.ts` (the app in-process behind the real station controller),
  `test/manifest.test.ts` (schema, drift, tool list, annotations, logos) and
  `test/tools.test.ts`.
- A README with Setup, Terms of use and Logos sections.
- Outside the monorepo: an `AGENTS.md` and the create-agent-app skill for coding agents
  (`--agent claude,codex,...` or `--no-skill`), biome, and the `@agentapps/cli` devDependency
  for live tests (`npx agentapps`; never the unscoped `agentapps` npm package, which is
  unrelated). The package is `private` and named after the app id until you pick a scoped name
  (`--package-name @you/agentapp-x`) and publish.

### Templates

| Template | What it is |
|---|---|
| `api` (default) | A REST API wrapper: client, one example tool, health check. `--base-url`, `--auth none\|api-key\|oauth2`, `--secrets A,B` and `--system-secrets A,B` (api-key), `--provider`, `--scopes`, `--authorize-url`, `--token-url`, `--pkce` (oauth2), `--health-path`. |
| `minimal` | One read-only local tool and a health check. (`typescript` is an alias.) |
| `full` | Several local tools showing progress, streaming and cancellation. |

`--id app.<vendor>.<product>` sets a manifest id other than `app.<app-id>`; the directory stays
`<app-id>`. With `--auth oauth2` the client requires only `ACCESS_TOKEN`, leaves token refresh
to the host (`ctx.auth.refresh()` once on a `401`, then the request is replayed), and gives a
missing token, a dead refresh token and a missing OAuth client their own messages.

Run `create-agent-app --help` for every option.

## Check an app

```bash
npx create-agent-app check-app            # in the app directory
npx create-agent-app check-app --strict   # before shipping
create-agent-app check-app apps/x         # or point at it
```

`check-app` loads the app (through tsx) and checks the tools it really registers, the way a
host lists them, so helpers and shared annotation objects are fine. If the app cannot be
loaded that is an error, and it falls back to reading the source.

Errors (non-zero exit): manifest schema, a tool without all five annotations declared,
`sensitive` not equal to `!readOnlyHint`, a read-only tool marked destructive, a mono logo with
colours, a PNG logo under 1024x1024, a missing logo without a TODO in the README's Logos section, an empty Logos section, a README
without Logos or Terms of use sections, `agentapp.json` differing from `app.toManifest()`, and,
inside the monorepo, a missing `agentapps.example.json` entry or lockfile importer. Warnings:
TODO text, pending logos, no health check, hints that set installation secrets on the app id instead
of the installed alias (system secrets do belong on the app id). `--strict` turns TODO text in the manifest or README into errors (a logo TODO
in the Logos section that lists where you looked still passes): run it before shipping. The
bins `agentapps-check-app` and the older `agentapps-validate` run the same command.

## Run the health check against the real service

```bash
SERVICE_API_KEY=... create-agent-app health [dir]
```

User and system secrets are read from environment variables named like the manifest's
`auth.installationSecrets` and `auth.systemSecrets`; values are never printed. An OAuth app needs a
current `ACCESS_TOKEN`: there is no station to refresh it. Exits non-zero unless the app reports
`ready`.

## Dev mode

```bash
create-agent-app dev    # embedded controller, reloads on src/app.ts changes
```

`agentapps-pack` is experimental: it does not produce the MCPB format yet and is not part of
generated projects. Publish apps to npm instead (see the skill's `ship-it.md`).

## API

```ts
import { checkApp, health, scaffoldApp } from '@agentapps/create';

const { destDir } = await scaffoldApp({ projectName: 'weather', skipInstall: true, skipGit: true });
const result = await checkApp({ cwd: destDir, strict: true });
```
