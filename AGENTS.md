# Agent Apps — Development Guidelines

These are the rules for anyone working in this repository, people and coding agents alike.

## Creating or extending apps

Follow the create-agent-app skill: `.agents/skills/create-agent-app/SKILL.md`. It covers whether
to build an app at all, research, tool design and annotations, scaffolding, tests, the live test
and the PR, and its `references/monorepo.md` has this repo's specifics.

| Task | Command (from the repo root) |
|---|---|
| Scaffold an app into `apps/<id>` | `node packages/create/dist/cli.js <id> --base-url <url> [--auth api-key --secrets KEY]` |
| Check an app against these rules | `node packages/create/dist/cli.js check-app apps/<id>` |
| Run its health check against the real service | `KEY=... node packages/create/dist/cli.js health apps/<id>` |
| Test it | `pnpm vitest run apps/<id>` |

The skill's source of truth is `packages/create/skill/create-agent-app/` (it ships with
`@agentapps/create`). After editing it, run `node scripts/agent-skills/sync.mjs` to refresh the
copy in `.agents/skills/`; a test fails when they drift.

## Branding Assets Policy

Logos are a sensitive branding element. **Never generate logos automatically or with AI.**

- **`logo`** (branded, real colors) and **`logoMono`** (single-tint SVG) must be sourced from official brand resources: press kits, brand guidelines, or the service's official website.
- If official assets are not available, leave the placeholder path in the manifest and flag it as a TODO — do not create a substitute.
- Only generate or create logos if the user explicitly asks for it.
- When adding a new app, document where each logo was sourced (e.g. "GitHub Octicons press kit", "Notion brand guidelines page").

### Logo specifications

| Field | Format | Requirements |
|---|---|---|
| `logo` | SVG (preferred) or PNG | If PNG, minimum 1024×1024. Real brand colors per the brand's guidelines |
| `logoMono` | SVG only | Single color, no fills — the host recolors it freely (sidebar, dark mode, etc.) |

## Manifest Schema

Every app must pass `safeParseAppManifest()` from `@agentapps/protocol`. Required fields include:

- `id`, `version`, `name`, `description`, `tagline` (≤120 chars)
- `author` with `name` and `email`
- `logo`, `logoMono`, `terms` (URL)
- `category`, `entrypoint`, `runtime`

Check an app with `node packages/create/dist/cli.js check-app apps/<id>` (after `pnpm build`).

## Tool Annotations

Annotations are **declarative only**. There is no inference heuristic — `readOnlyHint`, `destructiveHint`, etc. must be explicitly set by the app author in the tool definition. Do not infer annotations from tool names.

## Code Comments

Always in English, even if surrounding code has legacy comments in other languages.

## Secrets

Always use the official CLI API to save secrets; never write `.secrets/` JSON files directly. Installation secrets (the tokens of one installation) belong to an installation: `agentapps config <alias> KEY:value`. `agentapps config <appId> KEY:value` sets system secrets shared by every installation (such as an OAuth client id and secret).

## Git

- Commits follow conventional commits (`feat:`, `fix:`, `perf:`, `refactor:`, `chore:`)
- Commit messages are always in English, subject and body
- Never push without explicit user consent
- No `Co-Authored-By` trailer
