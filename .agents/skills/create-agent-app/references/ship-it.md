# Ship it: final checks, commits, change description

If you are in the agentapps monorepo, `monorepo.md` adds its own checks and PR rules on top of
this page.

## 1. Final checks (all green)

```bash
npm test
npm run typecheck
npx biome check .
npx create-agent-app check-app --strict   # exit 0
```

`--strict` also fails on TODO text left in the manifest or README; a logo TODO in the Logos section that lists where you looked still passes.

- [ ] Every tool declares all five annotations; `sensitive` on every tool with an effect outside the app's own data, never on a read-only one;
      `destructiveHint` only on irreversible tools (check-app and the tests enforce this).
- [ ] `agentapp.json` passes the schema and equals `createApp()` (the tests).
- [ ] Logos from an official source with provenance in the README, or placeholder + TODO.
- [ ] README: what the app does, the tool table, how to get each secret and the exact
      `agentapps config <alias> KEY:value` lines, sentinel values, the service's terms of use,
      logo provenance. No TODO left except a logo TODO you mention in the description.
- [ ] Comments and docs in English. No secrets, tokens, customer data or personal data in code,
      tests, fixtures, logs or the description.
- [ ] `access: "authenticated"` declared if the app touches user data or has sensitive tools and
      your protocol version supports it; otherwise say in the description that it is pending.
- [ ] Live test done (or the reason it was not), cleanup verified.

## 2. Commits

- Conventional commits: `feat(<id>): add <Name> app for the <API>`, `test(<id>): ...`,
  `fix(<id>): ...` for live-test fixes, `docs(<id>): ...`.
- One logical change per commit. Never commit a secret; if one slipped in, tell the user so they
  can revoke it (rewriting history does not make a pushed secret safe).

## 3. Change description (PR, merge request or release note)

Push, open a PR or publish only when the user says so. Never merge your own change.

Keep it short and plain, under ~25 lines:

```
<one sentence: what this change does, in plain words>

Depends on #N.            (only if it builds on another open change)

## What changes
- 3 to 6 short bullets, one idea each, no internal codes, no file:line references,
  no jargon a newcomer would not know.

## How to try it
- the 1 to 3 commands someone runs to see it work.

## Tested
- one line: what was run (tests, check-app, live service, fresh containers) and that it passed.

## Not done yet
- only if something is really pending (a logo TODO, writes not tested live, access field).
```

No tables unless a tool list really needs one. No long design explanations: link the decision
note instead. No secrets, no personal data.

Example:

```
Adds a Countries app that looks up country facts from the free REST Countries API.

## What changes
- New app `app.rest-countries` with 2 read-only tools: search countries, get one country.
- No account or key needed.

## How to try it
- agentapps install app.rest-countries countries
- agentapps countries tool get-country code:ES

## Tested
- Unit tests, check-app, typecheck, live calls against the real API: pass.

## Not done yet
- No official logo exists yet; placeholder paths and a TODO in the README.
```

## 4. Using a standalone app outside the monorepo

Publishing your own app for others to install by id is not supported yet. `agentapps install
<appId> <alias>` only looks in the official catalog (the `@agentapps` scope on npm), and an
`npm:` source is downloaded without its dependencies, so the package a scaffold produces would
not load from one. Do not tell the user to `npm publish` the app.

Until third-party publishing exists, a standalone app is used as a **local source**: a path in
the workspace's `agentapps.json`, relative to that file.

```json
{ "apps": [{ "source": "./my-app" }] }
```

```bash
agentapps --config ./agentapps.json install app.my-app my-app
agentapps --config ./agentapps.json my-app tools
```

To share it, share the source (a git repository). To get it into the catalog, contribute it to
the agentapps repository. Keep `"private": true` in `package.json`; it is there so nothing is
published by accident.
