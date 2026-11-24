# Hello

The sample Agent App: two tools that need no account and no key. Install it to check that the
CLI, a Station and an agent platform work together, or read `src/app.ts` to see the smallest
complete app.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `greet` | Greets a person by name, in `en`, `es`, `fr`, `de` or `ja`. | no |
| `countdown` | Counts down from a number (100 at most), reporting progress on each step. It stops when the call is cancelled. | no |

Neither tool reaches the network or keeps anything.

## Setup

```bash
agentapps install app.hello hello
agentapps hello tools
agentapps hello tool greet name:World
```

There is nothing to configure.

## Terms of use

The app calls no outside service, so no service's terms apply. The Agent Apps terms are at
<https://agentapps.tech/terms>.

## Logos

This app is Agent Apps' own and not an outside brand's, so there is no press kit: its logo
follows the format of the project's own apps (see `AGENTS.md`), and the project owner asked for it.

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the hexagon and the solid face of `apps/bash/assets/logo.svg`, unchanged, with a symbol drawn for this app on 2026-11-23 cut out of the face: a speech bubble. In `#E69A0C`. | see Source |
| assets/logo-mono.svg | the same drawing | `currentColor` in place of the colour |
