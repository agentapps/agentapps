# Hunter

Lets an agent find and check professional email addresses with Hunter: list the addresses known
for a company domain, guess one person's address from their name and domain, and verify whether
an address is deliverable. It calls the Hunter API v2 (`https://api.hunter.io/v2`) with an API
key.

Limits: the three tools only read, but searches and verifications count against the quota of the
Hunter account that owns the key. `domain-search` returns at most 100 addresses per call. A
verification that Hunter is still processing is polled within the retry budget and may end as
"pending": call the tool again later.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `domain-search` | Finds the email addresses of a company domain, with the domain's pattern, names, positions and confidence. | no |
| `email-finder` | Guesses one person's email address from their first name, last name and domain. | no |
| `email-verifier` | Checks whether an email address is deliverable and returns a status, a result and a 0-100 score. | no |

## Setup

```bash
agentapps install app.hunter hunter
agentapps config hunter HUNTER_API_KEY:<your key>
agentapps hunter tools
agentapps hunter tool domain-search domain:stripe.com limit:5
```

`HUNTER_API_KEY` is an installation secret: each installation uses its own key. Create it in
your Hunter account, in the API section of the dashboard. The app reads it from the Station on
each call and never stores it.

## Terms of use

Hunter's own terms apply to everything the app does on your behalf:
<https://hunter.io/terms-of-service>. They also set what the addresses found may be used for.
The quotas of the Hunter plan apply; this README does not list them.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | the logo in the header of <https://hunter.io>, supplied by the project owner on 2026-11-23 (one path: the animal and the name, in `#FA5320`) | the animal alone: the last two shapes of that path, unchanged, with the name's shapes left out and the `viewBox` set to a square round the animal. Asked for by the project owner. |
| assets/logo-mono.svg | the same | the same, with `currentColor` in place of the colour |

Hunter's [press kit](https://hunter.io/press) has only the animal with the name, and no vector.
