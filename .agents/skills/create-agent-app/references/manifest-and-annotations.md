# Manifest and annotations cheat sheet

The manifest schema is `AppManifestSchema` in `@agentapps/protocol` (strict: unknown keys
fail), and tool annotations are `ToolAnnotationsSchema` in the same package. When this sheet and
the code disagree, the code wins. `create-agent-app check-app` runs the schema for you.

## agentapp.json

The scaffold writes this; you fill in the TODOs.

```json
{
  "id": "app.<app-id>",
  "name": "<Display Name>",
  "version": "1.0.0",
  "description": "<10-500 chars: what the app does, which API, notable limits>",
  "tagline": "<5-120 chars, for catalog cards>",
  "author": { "name": "<you or your team>", "email": "<contact>" },
  "license": "MIT",
  "logo": "assets/logo.svg",
  "logoMono": "assets/logo-mono.svg",
  "terms": "https://agentapps.tech/terms",
  "category": "productivity",
  "keywords": ["<service>", "<domain words>"],
  "entrypoint": { "type": "module", "path": "src/app.ts", "export": "factory" },
  "runtime": { "transport": "stdio", "command": "tsx", "args": ["src/app.ts"] },
  "capabilities": { "tools": true, "health": true },
  "auth": { "type": "api-key", "installationSecrets": ["<SERVICE>_API_KEY"] }
}
```

| Field | Rule |
|---|---|
| `id` | `app.` + lowercase segments: `app.confluence`. A vendor with several apps in the catalog gets `app.<vendor>.<product>` (`app.microsoft.excel`, `app.google.ads`): scaffold with `--id`, the directory stays `<vendor>-<product>`. |
| `version` | `x.y.z`. New apps start at `1.0.0`; bump minor for new tools. |
| `name` | max 50 chars. |
| `tagline` | required, 5-120 chars. |
| `logo`, `logoMono` | required paths; `logoMono` must be `.svg`. See `logos.md`. |
| `terms` | required URL: the Agent Apps terms. The *service's* terms of use go in the README. |
| `category` | free text; reuse an existing one (productivity, development, communication, analytics, devops, data, information, finance...). |
| `runtime` | stdio + `tsx src/app.ts`, the same in `createApp()`. No `platform` key on a stdio runtime. |
| `auth` | omit it (or `false`) for no auth; `api-key`; `oauth2` (needs `provider`, `authorizeUrl`, `tokenUrl`, at least one of `scopes`; `--auth oauth2` writes it); `github-app`. |
| `access` | When your protocol version supports it: `"authenticated"` for apps that touch user data or have `sensitive` tools; otherwise leave it out (defaults to `anonymous`). Set it in `createApp()` too. Where it is not supported, the strict schema rejects it. |

### Secrets

- `installationSecrets` belong to one installation (one alias): each user's own token.
  `systemSecrets` are shared by every installation of the app (an OAuth client id and secret, a
  developer app id).
- **In an `api-key` app, every declared installation secret is required.** The SDK refuses every tool
  call until all of them are set. There is no optional secret: give settings a documented
  sentinel value instead (`KUBECONFIG=default`, `KUBE_CONTEXT=current`, `ALLOWED_TARGETS=*`) and
  write the sentinel in the README and in the error message that asks for it. `oauth2` apps are
  different, see below.
- **The SDK enforces no system secret.** An app that needs one checks it itself and names the
  missing key with the command that sets it, on the app id:
  `agentapps config app.<id> KEY:value`. `--system-secrets` (api-key) generates that check and
  its tests; `check-app` accepts such a hint because it names a system secret.
- Name secrets `<SERVICE>_<THING>` (`CONFLUENCE_API_TOKEN`). Names containing KEY, TOKEN, SECRET,
  PASSWORD or PRIVATE are treated as secrets by the SDK and may not be passed as plain
  `runtime.env` values.
- Messages that ask for a installation secret point at `agentapps config <alias> KEY:value`; only
  system secrets go on the app id.

### OAuth2

`--auth oauth2 --provider <p> --scopes <a>,<b>` writes all of this (`google` and `microsoft`
fill in the endpoints; other providers add `--authorize-url` and `--token-url`):

- `auth`: `provider`, `authorizeUrl`, `tokenUrl`, least-privilege `scopes`, `pkce`,
  `systemSecrets` `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI` (the OAuth client, set once on the
  app id) and `installationSecrets` `ACCESS_TOKEN`, `REFRESH_TOKEN`, `EXPIRY_DATE`, which the host's
  OAuth flow writes.
- A client that requires only `ACCESS_TOKEN`. The SDK checks no OAuth installation secret, and the host
  does not write every declared one for every provider (some send no refresh token), so a client
  that requires them all breaks every tool right after a successful sign-in.
- **The host refreshes.** On a `401` the client calls `ctx.auth.refresh()` once and replays the
  request with the token it returns, also for a `POST` (the request was rejected before it was
  processed). The host keeps the client secret, stores the new tokens and refreshes ahead of
  expiry; the app never parses `EXPIRY_DATE`. Refreshing inside the app (client secret from
  `ctx.secrets.getSystem()`, new tokens saved with `ctx.secrets.updateInstallation()`) is only a
  fallback for a host without `refresh`; do not copy it from older apps.
- Four failures with distinct messages: no token (`[AUTH_REQUIRED]`, connect with
  `agentapps <alias> auth`), refresh token dead (`[AUTH_EXPIRED]`, `agentapps <alias> auth
  reauth`), OAuth client not configured (`[SYSTEM_CONFIG_MISSING]`,
  `agentapps config app.<id> CLIENT_ID:... CLIENT_SECRET:...`), and a `403` for a missing scope
  (name the scope; tell it apart from other `403`s by the provider's error body, the TODO in
  `describeError`).

#### When the provider does not fit the generic flow

The host's `oauth2` flow is the standard authorization-code grant with a refresh token. Some
providers differ: a short-lived token exchanged for a long-lived one and no refresh token, a
code exchange with other parameter names or a JSON body, authorize parameters that differ per
deployment. Check what your host supports first. If it cannot express the provider, use
`api-key` auth with a token the user creates in the provider's developer tools
(`<SERVICE>_ACCESS_TOKEN`): document in the README how to get it and when it expires, give an
expired or revoked token its own message, and record the choice and the reason in the change
description so the app can move to `oauth2` later.

## createApp() must equal agentapp.json

`src/app.ts` exports `app` (not only `factory`) so `test/manifest.test.ts` can compare
`app.toManifest()` with the parsed `agentapp.json`. Change both together; the test catches drift.

## Tool annotations

Every tool declares all of these, as booleans, explicitly. No inference from tool names.
`check-app` and the generated tests enforce it.

| Annotation | `true` when | Typical read tool | Typical write tool |
|---|---|---|---|
| `readOnlyHint` | the tool never changes anything anywhere | `true` | `false` |
| `destructiveHint` | the app cannot undo the change (delete, overwrite, revoke, purge, send), and starting or raising real spend (activating a paid campaign, raising a budget): money spent cannot be taken back. Creating, labelling or scaling is not destructive. | `false` | `false` (delete: `true`) |
| `idempotentHint` | repeating the same call has no extra effect (GET, set-to-value, delete-by-id, revoke) | `true` | create: `false`, set: `true` |
| `openWorldHint` | the tool talks to something outside the app process (a network API, a CLI) | `true` | `true` |
| `sensitive` | the call should pause for the user's approval by default: the tool changes something **outside the app's own data** in Agent Apps (another service, another person, the user's machine or files). `false` for a read-only tool, and for a tool that only changes the app's own Storage, Objects or Volume | `false` | `true` (own data only: `false`) |

A read-only tool is never destructive and never sensitive. The default Policy asks before a call
to a tool that is `destructiveHint` or `sensitive`, and allows the rest: three kinds of tool,
so choose with care.

| The tool | Annotations | By default |
|---|---|---|
| changes nothing | `readOnlyHint: true`, `sensitive: false` | runs |
| changes only the app's own data (a note in its Storage, a file in its Volume) | `readOnlyHint: false`, `sensitive: false` | runs |
| changes something outside, or cannot be undone | `sensitive: true`, and `destructiveHint: true` when irreversible | waits for approval |
 Optional extra fields: `stability`
(`experimental` / `stable` / `deprecated`), `deprecationMessage`, `irreversible`, `version`.

Annotations are static per tool. If one operation is harmless in one mode and dangerous in
another (HTTP GET vs any method), make two tools instead of one tool with a mode flag.

```ts
annotations: {
  readOnlyHint: false,
  // Reversible by scaling back; destructiveHint is for changes the app cannot undo.
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
  sensitive: true,
},
```

Add a comment when a choice is not obvious. Reviewers check annotations line by line.
