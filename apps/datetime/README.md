# Date & Time

Tells the model the current date, time and timezone on every turn. The app registers one
conversation hook at `pre-turn` and no tools. Before each turn the host calls the hook with the
current instant, the user's timezone and the user's locale, and the hook returns one line of
context labelled "Current time", for example
`Thursday, 8 October 2026 at 10:42 (Europe/Madrid, UTC+02:00)`.

It calls no API and keeps nothing. The time comes from the host, not from the app's own clock.
When the host sends no timezone the app uses `UTC`, and when it sends no locale it uses `en-GB`.
The hook declares a budget of 40 tokens and a 50 ms deadline.

## Tools

None. The app contributes context through a hook instead:

| Hook point | What it adds | Writes? |
|---|---|---|
| `pre-turn` | One context line with the current date, time, timezone and UTC offset. | no |

The manifest asks for the `hooksContext` permission, which is what lets a hook add context to a
conversation.

## Setup

```bash
agentapps install app.datetime datetime
```

There is nothing to configure: no account, no key. `agentapps datetime tools` lists nothing,
because the app has no tools; it only acts in a host that runs conversation hooks.

## Terms of use

The app calls no outside service, so no service's terms apply.

## Logos

This app is Agent Apps' own and not an outside brand's, so there is no press kit: its logo
follows the format of the project's own apps (see `AGENTS.md`), and the project owner asked for it.

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the hexagon and the solid face of `apps/bash/assets/logo.svg`, unchanged, with a symbol drawn for this app on 2026-11-23 cut out of the face: a clock: the dial cut out, the hands left standing. In `#7C5CDB`. | see Source |
| assets/logo-mono.svg | the same drawing | `currentColor` in place of the colour |
