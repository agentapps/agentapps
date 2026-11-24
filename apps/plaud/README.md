# PLAUD

Lets an agent read a PLAUD library: list and search voice recordings, read a recording's
transcript and AI summary, and get a link to its audio. The app talks to Plaud's own MCP server
(`https://mcp.plaud.ai/mcp`) with an OAuth token that has the `recordings:read` scope. Every tool
is read-only: the app cannot create, change or delete anything in PLAUD.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-notes` | Lists recordings with their metadata, most recent first (50 by default, 200 at most). | no |
| `get-note` | Returns one recording in full: the transcript as one text, the AI summary and metadata. | no |
| `get-transcript` | Returns one recording's transcript as segments, with timing when PLAUD has it. | no |
| `search-notes` | Searches recordings by keyword, date range or both. At least one filter is required. | no |
| `list-tags` | Lists the tags and folders of the library. | no |
| `get-current-user` | Returns the connected PLAUD user (id, email, name). | no |
| `download-recording` | Returns a URL to a recording's audio file. It does not return the audio itself. | no |

Limits:

- `get-note` returns the whole transcript. For a long recording use `get-transcript`; `get-note`
  adds a warning when the transcript is over 100,000 characters.

## Setup

```bash
agentapps install app.plaud plaud
agentapps config app.plaud CLIENT_ID:<your OAuth client id>
agentapps plaud auth
agentapps plaud tools
agentapps plaud tool list-notes limit:5
```

`CLIENT_ID` is a system secret: one OAuth client for every installation of the app. The sign-in
uses PKCE, so there is no client secret. Register the Station's redirect URI,
`{station URL}/auth/callback`, with that client. TODO: say how to register an OAuth client with
Plaud's MCP server; the app's code does not record it.

`agentapps plaud auth` opens PLAUD's sign-in and stores `ACCESS_TOKEN`, `REFRESH_TOKEN` and
`EXPIRY_DATE` for the installation. The host refreshes the token.

## Terms of use

Plaud's own terms apply to everything the app reads on your behalf:
<https://www.plaud.ai/policies/terms-of-service>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.png | Plaud media kit, <https://www.plaud.ai/pages/plaud-media-kit-download>, "Logo & Sub Brand.zip", the black mark on a white rounded square (3489x3489) | none (renamed) |
| assets/logo-mono.svg | same kit, the black mark on a transparent background (PNG, 3488x3488) | traced into a vector with potrace (threshold 128, turdSize 50, optTolerance 0.2), because the kit has no vector file. Asked for by the project owner. |

The kit's page says "For editorial use only".
