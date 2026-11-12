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

- [ ] Every tool declares all five annotations; `sensitive === !readOnlyHint`;
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

## 4. Publishing outside the monorepo

A standalone app is an npm package that users install into their station with
`{ "source": "npm:<package>" }` in `agentapps.json` and `agentapps sync`. Before the first
`npm publish` (only with the user's consent):

1. **Choose a name nobody else owns**, preferably scoped: `@<you>/agentapp-<id>`. The scaffold
   names the package after the app id, and a bare id may already belong to a stranger on npm;
   `agentapps sync` would then install their package. Check with `npm view <name>` (it must say
   "not found"), then set `name` in `package.json` (or scaffold with `--package-name`).
2. **Remove `"private": true`** from `package.json`; it is there so nothing is published by
   accident.
3. **Keep `files`** to what the app needs at runtime: `src`, `assets`, `agentapp.json`,
   `README.md` (the scaffold sets this). Check with `npm pack --dry-run`: no tests, no agent
   skill folders, no secrets.

There is no bundle (`.mcpb`) packaging for the new layout yet; publish to npm instead.
