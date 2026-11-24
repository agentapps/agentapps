# Perplexity AI

Lets an agent ask Perplexity a question and get an answer written from web results, with the
URLs of its sources. It calls the Perplexity chat completions API
(`https://api.perplexity.ai/chat/completions`) with an API key. The models it accepts are
`sonar` (the default), `sonar-pro` and `sonar-reasoning`. Answers are not streamed, and no call
is retried.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `search` | Answers one question from the web and returns the answer and its source URLs. | no |
| `chat` | Continues a conversation given as a list of `system`, `user` and `assistant` messages, and returns the answer and its source URLs. | no |

Neither tool changes anything, but each call uses credit of the API key.

## Setup

```bash
agentapps install app.perplexity perplexity
agentapps config app.perplexity APIKEY:<your key>
agentapps perplexity tools
agentapps perplexity tool search query:"What changed in the latest Node.js release?"
```

`APIKEY` is a system secret: one key for every installation of the app, so every user's calls
are billed to it. Create it in your Perplexity account's API settings
(<https://perplexity.ai/settings/api>).

## Terms of use

Perplexity's API terms apply to everything the app does on your behalf:
<https://www.perplexity.ai/hub/legal/perplexity-api-terms-of-service>. TODO: note here the
prices and rate limits that matter to someone installing the app; none was checked for this
README.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Perplexity's
press kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
