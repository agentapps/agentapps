# Common mistakes, with the evidence

Each item happened while building earlier apps (Confluence, Kubernetes, Tailscale, a Tailscale
network app, Open-Meteo, and six marketing apps: Search Console, Google Ads, YouTube Analytics,
LinkedIn Ads, Meta Ads, TikTok Ads) or during their live and end-to-end runs. Many are now caught by
`create-agent-app check-app` or the generated tests; the rest need judgement.

## Manifest and secrets

| Mistake | What happened | Fix |
|---|---|---|
| Copied an old manifest | A third of the older manifests in the catalog fail the current schema (missing `tagline`, `logo`, `entrypoint`; `runtime.platform` on stdio). | Scaffold with `create-agent-app`; `check-app` runs the schema. |
| `createApp()` and `agentapp.json` disagree | One older app declared `tsx src/app.ts` in one and `node dist/app.js` in the other. | Same data in both; the generated drift test. |
| `access` used where the protocol does not support it | The strict schema rejects the key; `createApp({ access })` fails type-checking. | Check support first (SKILL.md step 7). |
| `agentapps config app.<id> KEY:value` for a installation secret | Writes system secrets; the app reads installation secrets only; "does not declare any system secrets". Even shipped error messages said `config app.<id>`. | `agentapps config <alias> KEY:value`, in messages and the README. `check-app` warns (not for system secrets, which do go on the app id). |
| Optional or alternative secrets in an api-key app | Every declared installation secret is required before any tool runs; an OAuth-or-token design would have forced token users to fill in OAuth fields. | One secret recognised by shape, or a sentinel value. |
| Requiring every OAuth installation secret | The api-key "all secrets required" check, copied into an OAuth client, would fail every tool right after a successful sign-in: the station never writes `EMAIL`. | Require `ACCESS_TOKEN` only (the `--auth oauth2` client). |
| Copying an older app's OAuth refresh | It refreshed inside the app with the client secret and parsed `EXPIRY_DATE` as milliseconds, while the host writes an ISO date. | `ctx.auth.refresh()` on a `401`, as the scaffold does; never parse `EXPIRY_DATE`. |
| `agentapps auth <alias>` in messages | The command is `agentapps <alias> auth`; found only by reading `agentapps --help`. | Copy commands from `--help`, not from memory. |
| Unchecked system secrets | The SDK does not enforce them: the TikTok app had to check its developer app id and secret by hand, and the old test harness never answered the request, so the test hung until its timeout. | Check them in the client and name `agentapps config app.<id> KEY:value` (`--system-secrets`); the harness answers them now. |
| Undocumented sentinel values | A tester typed `KUBE_CONTEXT:default`; the right value was `current`, and kubectl looked for a context literally named "default". | Write sentinels in the README, the error message and the health issue. |
| Secrets printed | A created key ended up in a tester's own output. | Print names, prefixes and lengths only; search logs before sharing. |

## Tool behaviour

| Mistake | What happened | Fix |
|---|---|---|
| String-only ID parameters | The CLI turned `deviceId:<digits>` into a number; every device tool failed with "A required identifier is missing". The mocks always used strings. | Accept `string \| number`; reject unsafe integers. |
| Trusting quotes on the CLI | `'name:"08001"'` arrived as `8001` and the search returned a place on another continent. | Only a JSON object argument keeps strings; say so in the parameter description. |
| No own timeout | A wait with `timeoutSeconds:180` died at the host's generic 60 s timeout; a CLI hung 150 s on an unreachable server. | One 30 s HTTP deadline (the scaffold), 45/50 s for subprocesses, 5 s for health; cap waits and return `done: false`. |
| Results over 50k chars | Getting 57-92k-character pages and listing 250 spaces came back as a truncated string. | Size-budget lists, chunk bodies, bound time ranges. |
| Write tools echoing the body | A 70k echo truncated away the new page's id. | Return `{ success, id, url }` only. |
| Raw API output | Relative links, `&amp;` in excerpts, Java exception class names, ids instead of names. | Clean results (see `tool-design.md`). |
| Bare network errors | An unresolvable site URL produced `fetch failed`. | Name the host and the cause (the scaffold does). |
| Encoded list separators | Commas sent as `%2C` made the API's error name the whole list instead of the bad item. | Check how the API wants lists; test the exact query string. |
| Telling users to pass input with `--json` | It is the CLI's output flag. | Inline JSON object or `-` for stdin. |
| Policy refusals look like crashes | Every thrown error is reported as `INTERNAL_ERROR`. | A message that explains itself, with a bracketed code. |
| One tool with a dangerous mode | Annotations are static, so a tool that is read-only in one mode lies in the other. | Two tools. |
| API quirks not handled | A CLI exits 0 with "unable to retrieve container logs"; drafts reject a version bump; comment endpoints return roots only; durations like "in 0s". | Find them in the live test; a mocked regression test for each. |
| Search lag reported as a bug | A search index missed new content for 20-40 s. | Say it in the tool description. |
| Trusting OS hostnames | `localhost` resolved to a phone whose hostname was "localhost". | Resolve canonical names and IPs only. |
| Async cleanup on exit | The CLI exits right after shutdown; async cleanup was cut off; session close may run twice. | Synchronous cleanup on exit and signals; idempotent close. |

## Testing

| Mistake | What happened | Fix |
|---|---|---|
| Mocks nicer than the API | 12 bugs across three apps passed the mocked suites and failed live. | Mock bodies from real response shapes with synthetic values; a regression test per live bug. |
| An unexpected request in a test | An unqueued `fetch` mock returned `undefined`: "Cannot read properties of undefined (reading 'ok')". | The scaffold's harness fails such calls with "unexpected fetch in test". |
| Assuming typecheck covers tests | `tsc -p` with `include: ["src"]` never sees `test/`. | See `testing.md`. |
| Cleanup assumed, not verified | | GET 404 / search 0 / empty list after cleanup, written in the report. |
| Using a shared CLI state | The CLI pointed at another workspace; running it from a new place rewrote `~/.agentapps/config.json`. | Scratch `--config`; back up and restore the global config. |
| `AA="agentapps --config ..."; $AA apps` | zsh does not split the variable: "no such file or directory". | A shell function (`live-testing.md`). |
