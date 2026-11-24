# Compliance Filter

An example of an app that uses conversation hooks. Before each turn it scans the user's message
and blocks it when it finds personal data; after each turn it scans the agent's answer and logs
whether it carried any. It also has one tool to scan a text on request. It calls no outside
service: the scan is a handful of regular expressions that run inside the app.

It detects four patterns: a US Social Security number, a 16-digit card number, an email address
and a US phone number written as `(555) 123-4567`. This is deliberately simple. Do not rely on it
as a real compliance control.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `check-text` | Scans a text and returns the types of personal data found, with the values redacted. | no |

Hooks, which are not tools:

- `pre-turn`: vetoes a user message that matches a pattern, with the code `PII_DETECTED`. It has
  200 ms to answer.
- `post-turn`: logs whether the agent's answer matched a pattern. It does not change the answer.

The app asks for the `hooksVeto` and `hooksConversation` permissions.

## Setup

```bash
agentapps install app.compliance-filter compliance-filter
agentapps compliance-filter tools
agentapps compliance-filter tool check-text "text:Call me at (555) 123-4567"
```

There is nothing to configure.

## Terms of use

The app calls no outside service, so no service's terms apply.

TODO: the manifest's `terms` field points to <https://agentapps.tech/terms>, which answered 404
when this README was written. Link the Agent Apps terms here once the page exists.

## Logos

This app is Agent Apps' own and not an outside brand's, so there is no press kit: its logo
follows the format of the project's own apps (see `AGENTS.md`), and the project owner asked for it.

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the hexagon and the solid face of `apps/bash/assets/logo.svg`, unchanged, with a symbol drawn for this app on 2026-11-23 cut out of the face: a shield with a tick. In `#0E9384`. | see Source |
| assets/logo-mono.svg | the same drawing | `currentColor` in place of the colour |
