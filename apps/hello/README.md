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

TODO: Hello has no logo. `assets/logo.svg` and `assets/logo-mono.svg` are named in the manifest
and do not exist; there is no brand to source them from, and logos are never generated.
