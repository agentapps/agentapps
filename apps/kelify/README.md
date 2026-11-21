# Kelify AI Property Search

Lets an agent search real estate listings by talking to Kelify's conversational search API
(`https://api.kelify.com`). The agent opens a conversation, sends messages in natural language
and gets back an answer with matching properties: price, address, rooms, size, photos and a
link. A conversation keeps its context, so follow-up questions refine the same search.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `create-conversation` | Opens a new search conversation and returns its id. | yes, sensitive |
| `send-message` | Sends a message (up to 2000 characters) to a conversation and returns the answer with the properties found. | yes, sensitive |
| `get-conversation` | Returns a conversation's messages, results and usage. | no |

Limits:

- Answers are not streamed: `send-message` returns when the whole answer is ready, within a
  30 second deadline.
- Only reads are retried on a transient error. Creating a conversation or sending a message is
  never retried, so a failed call may need to be repeated by hand.

## Setup

```bash
agentapps install app.kelify kelify
agentapps config app.kelify KELIFY_API_KEY:<your key>
agentapps kelify tools
agentapps kelify tool create-conversation
```

`KELIFY_API_KEY` is a system secret: one key for every installation of the app. Ask Kelify for
one. The app reads it from the Station on each call and never stores it.

## Terms of use

Kelify's own terms apply to everything the app does on your behalf:
<https://kelify.com/legal/terms>. TODO: note here any limit on usage or commercial use that
matters to someone installing the app.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Kelify's press
kit, brand guidelines or its own site). They have been in the repository since before this
README existed and their origin was not written down.
