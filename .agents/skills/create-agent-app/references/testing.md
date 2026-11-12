# Testing with mocks

Tests run with no network and no real credentials, under `test/` in the app.

## What the scaffold gives you

- `test/harness.ts`: the app runs in-process behind the real station `AppStation`, so tests take
  the same protocol path as the CLI and MCP clients. Helpers: `callTool(name, args)`,
  `listTools()`, `runHealthCheck()`, `mockFetch(...responses)`, `jsonResponse(body, status,
  headers)`, `requestOf(fetchMock, n)`, the mutable `installationSecrets` and `systemSecrets` (delete a
  key to test a missing-secret path), `secretUpdates` (what the app wrote with
  `ctx.secrets.updateInstallation()`), and `refresh` for `ctx.auth.refresh()`: `refresh.calls` counts
  the refreshes, and `refresh.next = null` makes the next one fail like a revoked refresh token.
  Any `fetch` a test did not queue fails with "unexpected fetch in test".
- `test/manifest.test.ts`: schema, `createApp()` equals `agentapp.json`, the exact tool list,
  all five annotations on every tool, the exact `sensitive` and destructive sets with
  `sensitive === !readOnlyHint`, and one check per logo file (a `todo` while it is missing).
  Keep `EXPECTED_TOOLS`, `SENSITIVE_TOOLS` and `DESTRUCTIVE_TOOLS` up to date.
- `test/tools.test.ts`: health, client and example-tool tests to replace with your own.

For an app that shells out to a CLI, mock `node:child_process` (`vi.hoisted` + `vi.mock`) with a
fake that returns canned output per argument list, and assert the exact arguments.

## What to add

Per tool, at least:

1. One happy path asserting **the outgoing request** (URL, query, method, the headers that
   matter, body) and **the returned shape**.
2. Its error paths: the API's error status, bad arguments rejected before any request (assert
   `fetch` was not called), and missing secrets for apps with auth.
3. For `oauth2` apps (the scaffold has these; keep them passing): a `401` refreshes once and
   replays with the new token, a second `401` stops, a failed refresh asks to reconnect, and a
   missing OAuth client names the config command.

App-wide:

4. Health: `ready`, `not_ready` with `MISSING_SECRET` (apps with auth), `degraded` when the
   service is unreachable. The scaffold covers these; keep them passing.
5. The client: timeout message, network error names the host, error body capped, no secret in
   any message, retries only where allowed.
6. Size: a mocked oversized response gives a result under 50,000 characters, with
   `limitApplied` / `hasMore` for lists, or a clear error naming what to shrink for bounded
   inputs such as time series.

## Mocks that do not lie

Live runs of earlier apps found 12 bugs that the mocked suites had passed. Most came from mocks
nicer than the real API. So:

- Build mock bodies from **real response shapes** saved during research: replace every value
  with synthetic data but keep the real types (numeric ids stay numbers), HTML entities,
  relative links, nulls, missing keys and empty arrays.
- Pass arguments the way the CLI will: number-like values as numbers.
- A real value that JavaScript cannot represent exactly (an integer above 2^53, like some
  version counters) cannot be kept in a mock either; use a smaller synthetic value of the same
  type, or a string if the API sends one. To test that a tool rejects such a number the way the
  CLI would send it, write `Number('7012345678901234567')`: biome's `noPrecisionLoss` rejects
  the bare literal.
- When the live test finds a bug, first write a mocked test that fails on the current code,
  then fix it. Group them in a `describe('live-test regressions')` with one line each on what
  the live run saw.
- Never commit captured customer or personal data.

## Commands

```bash
npm test                      # the app's tests (monorepo: pnpm vitest run apps/<id>)
npm run typecheck             # tsc on src/, then on test/ (test/tsconfig.json)
npx biome check .             # lint and format (biome check --write . to fix)
create-agent-app check-app    # schema, annotations, logos, README sections, wiring
```

Vitest does not type-check, so `npm run typecheck` is what catches type errors in the tests.
