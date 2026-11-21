---
name: create-agent-app
description: Create, extend or review an Agent App (an integration built with the open @agentapps SDK) end to end - decide whether an app is the right answer at all, research the service's API, design tools an agent can use safely (explicit annotations, sensitive writes, bounded output), scaffold with create-agent-app, implement, test with mocks, run check-app, live-test safely and ship. Use it whenever someone asks to create, add, build, scaffold or extend an agent app, app, integration or connector for a service or API ("create an app for Stripe", "add a Notion integration", "build an agent app for our internal API", "new integration for X", "add tools to the Jira app", "crear una app para X", "añade una integración con X", "haz una app de X"), even if they do not say "skill" or "agent app".
license: MIT (adapted parts Apache-2.0, see NOTICE.md)
---

# Create an Agent App

This skill turns "make an app for X" into an app that follows the Agent Apps rules, has tests,
was called live at least once, and arrives as a small, reviewable change. Most rules here exist
because a live run broke something that the mocked tests had passed.

Work through the steps in order. Each step names the reference to read when you reach it; do not
load them all up front. Anything that can be checked by a command is checked by
`create-agent-app check-app`: run it rather than remembering the rules.

## Where you are

- **Agentapps monorepo** (the directory tree has `pnpm-workspace.yaml`, `apps/` and
  `packages/create/`): if `references/monorepo.md` exists next to this file, read it now. It
  adds the repo's install, wiring, review and PR rules.
- **Your own project** (made with `npm create @agentapps`, or any project depending on
  `@agentapps/sdk`): read the project's `AGENTS.md` if there is one.

In the steps below, `create-agent-app` means `npx create-agent-app` in a standalone project, or
`node packages/create/dist/cli.js` in the monorepo.

## Checkpoints: when to stop and ask

Some decisions belong to a human. Who you are working for decides how hard each stop is.

| Decision | A person is in the conversation | You run on your own (no one answers) |
|---|---|---|
| Whether to build an app at all (step 1) | Ask | Stop; recommend, do not build |
| The tool list and annotations (step 4) | Show it; continue unless they object | **Stop until a human approves it.** If every tool is read-only you may continue, and list the tool table as "pending approval" in the change description |
| Credentials: which account, which secret | Ask them to provide it (environment variable or file) | **Stop.** Never create accounts or keys yourself |
| Logos (step 6) | Official source or TODO | Official source or TODO. Never generated |
| Any live call that writes (step 9) | Only in a sandbox they named | **Stop until approved**; otherwise read-only |
| Push, open a PR, publish a package | Only when they say so | Never on your own |

A written task brief counts as the human's answer for what it decides explicitly: an approved
tool list with its writes, approved live writes, consent to push or open a PR, a judgement that
an official MCP server is not enough. Proceed on those, and record each decision and that the
brief made it in the change description. What the brief leaves open is still a stop.

When you cannot ask, take the conservative option, write it down as an assumption, and carry on
with the parts that do not need the answer.

## 1. Should this be an app?

Check before building anything. Read `references/when-not-to-build.md` if any of these might be
true: the service is already covered (list the existing apps), the vendor ships an official MCP
server that already does the job, the work belongs in an existing app, there is no API, or the
service's terms forbid automated access. If an official MCP server is enough, offer to wire it
instead and explain the trade-off.

## 2. Capture intent

Find out, from the conversation first and the user second:

1. Which service, and which product of it (Jira and Confluence are different apps).
2. What an agent should be able to do: the 5-15 jobs, not the whole API.
3. How it authenticates: none, API key or token, OAuth, or a local CLI or daemon.
4. Whether there is a sandbox (test workspace, free tier, throwaway account) for the live test,
   and which writes the user allows there.

## 3. Research the service

Read the official API docs, not blog posts. Write down, with links:

- Base URL(s), API version, auth model (where each credential comes from, which scopes).
- Rate limits and pagination style (cursor, offset, link headers).
- The terms of use: commercial use, attribution, limits on automated access or bulk
  downloads, and anything every request must carry (a `User-Agent` with contact details, an app
  name header). Put required headers in the client and the limits in the tools (page caps).
- Response sizes: which endpoints can return more than ~50,000 characters of JSON.
- One real response per endpoint you will use (from the docs' examples or a read-only call),
  to build honest test mocks later. Replace personal values with synthetic ones. Keep research
  calls to a handful, especially on free services.

Some reference pages are too big or too script-heavy for a page-fetch tool, which then returns
only the navigation (field references of large APIs run to hundreds of kilobytes). Download
them with `curl` and search the HTML with `grep` instead.

Then decide the boundaries: one app per product. Read `references/app-boundaries.md` if the
service overlaps an existing app, has several products or hosts, or offers two kinds of
credential.

## 4. Design the tools (the core of the work)

Write the tool table before any code: name, one-line purpose, parameters, and the five
annotations plus `sensitive` for each tool. Read `references/tool-design.md` and
`references/manifest-and-annotations.md` now. In short:

- Every tool declares `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` and
  `sensitive` explicitly. Nothing is inferred from the tool name.
- `sensitive` is `true` exactly for tools that are not read-only.
- `destructiveHint` means irreversible (delete, overwrite, revoke, send, and starting or raising
  real spend: money spent cannot be taken back), not just "writes".
- Results stay well under 50,000 characters; write tools return a short summary.
- Errors say what went wrong and what to do next.

This is a checkpoint (see the table above).

## 5. Scaffold

```bash
create-agent-app <app-id> --name "<Display Name>" --base-url https://api.example.com \
  [--auth api-key --secrets SERVICE_API_KEY [--system-secrets SERVICE_APP_ID]] \
  [--auth oauth2 --provider google --scopes <scope>,<scope>] \
  [--id app.<vendor>.<product>] [--category <category>] [--health-path /me]
```

This generates the manifest and the `createApp()` config from the same data, a fetch client
(timeouts, bounded retries, errors that name the host), one example tool, a health check, the
test harness and manifest tests, and a README with Setup, Terms of use and Logos sections.
`create-agent-app --help` lists every option; `--template minimal` is for apps with no network.

`<app-id>` is the directory and the example alias; the manifest id is `app.<app-id>` unless
`--id` sets another (a vendor with several apps uses `app.<vendor>.<product>`). For OAuth,
`--auth oauth2` writes the auth block, a client whose token refresh belongs to the host, and
tests for each auth failure; `google` and `microsoft` fill in the endpoints, other providers add
`--authorize-url` and `--token-url`. Read the OAuth and secrets notes in
`references/manifest-and-annotations.md` before changing that code, and its section on providers
that do not fit the generic flow.

Point `--health-path` (or the TODO in `src/app.ts`) at a real cheap request with every query
parameter it needs: many report endpoints answer `400` to a bare path.

## 6. Logos

Read `references/logos.md`. Official sources only. **Search first**, also when you run on your
own: the press kit, the brand page, the official site and its source repository. If you cannot
find an official `logo` or mono `logoMono`, keep the placeholder path and write a TODO in the
README's Logos section that lists where you looked. A TODO without that list is not done. Never
draw, trace, recolour by guesswork or generate a logo.

## 7. Implement

- Replace the example tool. One file per tool in `src/tools/`, registered from
  `src/tools/index.ts`; update `EXPECTED_TOOLS`, `SENSITIVE_TOOLS` and `DESTRUCTIVE_TOOLS` in
  `test/manifest.test.ts`. Tools that differ only in a preset can share a registration helper
  in `src/lib/`, with a small file per tool that calls it.
- Send the credential in `src/lib/client.ts` the way the service expects (the TODO there). For
  a service with several hosts, pass a fixed `baseUrl` per tool, never one taken from arguments.
  The client's other TODOs are per service too: how arrays go into the query string, errors
  sent with status 200 in an envelope, and `idempotent: true` for a POST that only reads.
- Validate IDs before they go into a URL path, and accept numbers for ID-like parameters: the
  `agentapps` CLI turns any number-like value into a number.
- Keep `agentapp.json` and the `createApp()` config identical; a test checks it. Edit both by
  hand when you change the description, tagline, keywords or version.
- The `access` field: `check-app` knows whether your protocol version supports it. When it
  does and the app has `sensitive` tools, it warns until you declare `access: "authenticated"`
  in both places (also declare it for read-only apps that read a user's private data). When it
  does not, leave the field out: the schema would reject it.

## 8. Test with mocks

Read `references/testing.md`. Per tool, assert the outgoing request (URL, method, body) and the
returned shape, plus the error paths, with mock bodies built from the real responses you saved.

```bash
npm test                                   # the app's tests
npm run typecheck                          # src/ and test/
npx biome check .                          # lint and format (--write to fix)
create-agent-app check-app [<app-dir>]     # schema, annotations, logos, README, wiring
```

All four must pass (`check-app` exit 0). `check-app` loads the app and checks the tools it
really registers, so share annotation objects or register tools through helpers as you like.
Read its warnings too. In the monorepo, `references/monorepo.md` maps these commands to the
repo's.

## 9. Live test

Read `references/live-testing.md` before calling the real service. The rules that matter most:
run the health check first (`create-agent-app health`, secrets from environment variables),
install the app under an alias with the `agentapps` CLI (`npx @agentapps/cli` in a scaffolded
project; never the unscoped `agentapps` npm package) and set installation secrets on that alias
(`agentapps config <alias> KEY:value`), prove you are in the sandbox with a read before any
write, write only what was approved, clean up and verify it is gone, and never print a secret.
Turn each bug the live run finds into a mocked test that fails without the fix.

## 10. Ship it

Read `references/ship-it.md`: the final checks (including `check-app --strict`, which fails on
TODO text left in the manifest or README; a logo TODO in the Logos section that lists where you looked still passes), the commit shape, a short, plain change description, and what to change before
publishing to npm. Push, open a PR or publish only with the user's consent.

## Common mistakes

Each of these cost a live-test round before. `references/common-mistakes.md` has the evidence.

1. Setting installation secrets with `agentapps config app.<id> ...`. That writes system secrets; the app
   never sees them. Use the installed alias: `agentapps config <alias> KEY:value`.
2. Optional secrets in an `api-key` app. The SDK refuses every tool call until all its declared
   installation secrets are set; give non-credential settings a documented sentinel value
   (`KUBE_CONTEXT=current`). The reverse holds for `oauth2`: the SDK checks no installation secret and the
   host does not write every declared one, so the client requires `ACCESS_TOKEN` only.
3. A tool that can run past the host's 60 s budget (10 s for health) without its own shorter
   deadline and a clear error.
4. Results over 50,000 characters, which the SDK truncates into a string the agent cannot parse.
5. Mocks that are nicer than the API (string ids where it sends numbers, no HTML entities, no
   relative links): the tests pass and the live run fails.
6. Copying an old app instead of scaffolding: many older manifests fail the current schema.

## For maintainers of this skill

`evals/` holds realistic prompts with checkable expectations, and `evals/README.md` explains how
to run them on demand with and without the skill. `NOTICE.md` records what was adapted from
Anthropic's `skill-creator` (Apache-2.0).
