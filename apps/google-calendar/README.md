# Google Calendar Agent App PoC

Proof-of-concept Agent App that integrates with **Google Calendar** using real **OAuth2** and the **Google Calendar API**. It demonstrates the full host-controller contract for authentication, secrets, and token refresh.

## Features

- **Real OAuth2 flow** with Google (authorization code + token exchange).
- **Localhost callback** by default, with `--manual-code` fallback for headless environments.
- **Secure token persistence** via `ctx.secrets.updateInstallation()` — never in environment variables.
- **Automatic token refresh** when the access token expires.
- **Tools**:
  - `list-events` — list upcoming events from Google Calendar.
  - `create-event` — create a new event in Google Calendar.

## Quick Start

1. Register a Google OAuth 2.0 client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and enable the Google Calendar API.
2. Configure the app in `agentapps.json` with system secrets via `secrets` or `AGENTAPPS_SECRET_*` env vars:

```bash
export AGENTAPPS_SECRET_CLIENT_ID="your-client-id"
export AGENTAPPS_SECRET_CLIENT_SECRET="your-client-secret"
```

3. Run the app from the workspace root:

```bash
# List tools
agentapps google-calendar tool

# List upcoming events
agentapps google-calendar tool list-events

# Create an event
agentapps google-calendar tool create-event '{"summary":"Demo","startTime":"2026-06-25T10:00:00Z","endTime":"2026-06-25T11:00:00Z"}'

# Force manual OAuth code entry (no localhost callback)
agentapps google-calendar tool list-events --manual-code
```

On first run, the CLI opens a browser for OAuth. After authorization, tokens are persisted to `.agentapps/installation-secrets.json` in the workspace.

## Project Structure

```
examples/google-calendar/
├── src/app.ts          # App factory + tools + OAuth logic
├── test/google-calendar.test.ts  # Integration tests with mocked Google APIs
├── agentapp.json       # App manifest
├── package.json
├── tsconfig.json
└── README.md
```

## Tests

```bash
pnpm test
```

Tests mock the Google OAuth token endpoint and Calendar API so they run without real credentials. They validate:

- Missing OAuth secrets produce a clear error.
- The OAuth flow triggers and persists `ACCESS_TOKEN`, `REFRESH_TOKEN`, and `expiresAt`.
- Existing valid tokens are reused without re-authentication.
- `list-events` and `create-event` work against mocked Google Calendar responses.
- Conformance with the Agent Apps protocol.

## Security Notes

Per the project security rules:

- **Secrets never go in `systemEnvironment`**. Only non-sensitive config via env vars.
- `systemSecrets` (`CLIENT_ID`, `CLIENT_SECRET`) and `installationSecrets` (`ACCESS_TOKEN`, `REFRESH_TOKEN`, `expiresAt`) are resolved exclusively through SDK callbacks (`get_system_secrets`, `get_installation_secrets`, `update_installation_secrets`).
