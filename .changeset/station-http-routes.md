---
"@agentapps/station": minor
"@agentapps/cli": patch
---

Add HTTP routes for app manifest, launcher HTML, and static bundle serving

StationServer now exposes four new public GET routes:
- `GET /apps` — JSON catalog of all registered apps (id, version, name, manifestUrl, bundlesUrl)
- `GET /apps/:appId/manifest` — full manifest JSON for a specific app
- `GET /launcher` — generic HTML launcher page listing apps and their launcher screens
- `GET /apps/:appId/bundles/*` — static file serving from app source directory with path traversal prevention

AppEntry interface extended with optional `manifest` and `sourcePath` fields.
CLI `serve` command now passes the full manifest and source path to StationServer.
