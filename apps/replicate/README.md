# Replicate

Lets an agent run AI models hosted on Replicate through its HTTP API
(`https://api.replicate.com/v1`): find a model and its input parameters, start a prediction,
poll for the result and cancel it. A run is always asynchronous: `run` returns a prediction id
at once, and the agent calls `get-prediction` until the status is `succeeded` or `failed`.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-models` | Finds models: by collection, by a search query, or the full input and output schema of one model (`owner/name`). | no |
| `run` | Starts a prediction on a model with the given input and returns its id. | yes, asks first |
| `get-prediction` | Returns a prediction's status and, once it succeeded, its output (for example an image or video URL). | no |
| `cancel-prediction` | Cancels a running or queued prediction. | yes, asks first |
| `list-predictions` | Lists recent predictions with their status. | no |

Limits:

- The app does not wait for a prediction and does not download its output: it returns what
  Replicate returns.
- Requests are not retried.

## Setup

```bash
agentapps install app.replicate replicate
agentapps config app.replicate API_TOKEN:<your token>
agentapps replicate tools
agentapps replicate tool list-models query:flux
```

`API_TOKEN` is a system secret: every installation of the app uses the same token. Create it at
<https://replicate.com/account/api-tokens>.

## Terms of use

Replicate's own terms apply to everything the app does on your behalf:
<https://replicate.com/terms>. Predictions are billed by Replicate to the account that owns the
token, and each model has its own license.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Replicate's
press kit, brand guidelines or its own site). They have been in the repository since before
this README existed and their origin was not written down.
