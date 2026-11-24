# Research Assistant

A demonstration app, not an integration. It shows an Agent App running as a child process over
the stdio transport, with several tools, progress reports, a health check and cancellation. It
calls no API: `search` returns made-up results built from the query, `summarize` picks sentences
from the text it is given, and notes live in the process's memory and are lost when it stops.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `search` | Returns mock search results for a query (3 by default, 10 at most), reporting progress on the way. It stops when the call is cancelled. | no |
| `summarize` | Reduces a text to a list of key points. | no |
| `save-note` | Saves a note (title, content, optional tags) in memory and returns its id. | yes |
| `list-notes` | Lists the notes saved since the app started. | no |

No tool reaches the network or the filesystem.

## Setup

The app's id is `app.research`; its directory is `apps/stdio-demo`.

```bash
agentapps install app.research research
agentapps research tools
agentapps research tool search query:"agent apps" limit:3
```

There is nothing to configure. The app is not listed in the repository's
`agentapps.example.json`, so add `{ "source": "./apps/stdio-demo" }` to your own
`agentapps.json` before installing it.

`pnpm --filter @agentapps/app.research dev` runs `test/demo.ts`, which starts the app as a child
process and drives it without a Station.

## Terms of use

The app calls no outside service, so no service's terms apply.

TODO: link the Agent Apps terms. The manifest's `terms` URL, `https://agentapps.tech/terms`,
answered 404 when it was checked on 2026-11-22.

## Logos

This app is Agent Apps' own and not an outside brand's, so there is no press kit: its logo
follows the format of the project's own apps (see `AGENTS.md`), and the project owner asked for it.

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the hexagon and the solid face of `apps/bash/assets/logo.svg`, unchanged, with a symbol drawn for this app on 2026-11-23 cut out of the face: two arrows, one each way, for what goes in and what comes out. In `#5B6B82`. | see Source |
| assets/logo-mono.svg | the same drawing | `currentColor` in place of the colour |
