# Make

Lets an agent run and manage Make.com scenarios. One tool triggers a scenario by posting to its
webhook URL; the others use the Make account API v2 (`https://<region>.make.com/api/v2`) with an
API token to list, read, create, update, clone, start, stop, run and delete scenarios and to read
their blueprints.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `trigger-webhook` | Posts a payload to a Make webhook URL and returns the response. | yes, asks first |
| `list-scenarios` | Lists scenarios, optionally for one team, with `limit` and `offset` paging (100 per page at most). | no |
| `get-scenario` | Returns one scenario by id. | no |
| `get-scenario-blueprint` | Returns a scenario's blueprint. | no |
| `create-scenario` | Creates a scenario in a team from a blueprint. | yes, asks first |
| `update-scenario` | Changes a scenario's name, blueprint, scheduling or folder. | yes, asks first |
| `clone-scenario` | Clones a scenario, optionally with a new name or folder. | yes, asks first |
| `start-scenario` | Activates a scenario. | yes, asks first |
| `stop-scenario` | Pauses a scenario. | yes, asks first |
| `run-scenario` | Runs a scenario once, optionally with input data, and can wait for its outputs. | yes, asks first |
| `delete-scenario` | Deletes a scenario. Cannot be undone. | yes, asks first |

Limits:

- `trigger-webhook` only accepts `https://` URLs on a `*.make.com` host and the default port.
  Any other URL is refused.
- Only reads are retried on a transient error (429 or 5xx). A webhook call, a run or any other
  write is never retried, so a failed call may need to be repeated by hand.
- `create-scenario` may need a paid Make plan: the tool's own description says so.

## Setup

```bash
agentapps install app.make make
agentapps config make MAKE_API_TOKEN:<your token> MAKE_REGION:eu1
agentapps make tools
agentapps make tool list-scenarios teamId:<team id> limit:10
```

Both are installation secrets, and both must be set before any tool runs, `trigger-webhook`
included.

- `MAKE_API_TOKEN`: create it in your Make profile, under API access. The scenario tools need the
  token's scenario scopes.
- `MAKE_REGION`: the zone your account lives in, one of `eu1`, `eu2`, `us1`, `us2`. It is the
  first part of the host you see when you use Make, as in `eu1.make.com`.

The team id that `list-scenarios` and `create-scenario` take is in the team's URL in Make.

## Terms of use

Make's own terms apply to everything the app does on your behalf:
<https://www.make.com/en/terms-and-conditions>. TODO: the link answered 403 from a bot wall when
this README was written, so open it once to confirm it. No plan limit or price was checked for
this README.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Make's press
kit, brand guidelines or its own site). They have been in the repository since before this README
existed and their origin was not written down.
