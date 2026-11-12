# @agentapps/example-context7

## 2.0.0

### Major Changes

- Migrated from `mca.context7` (the legacy MCA) to Agent Apps SDK.
  - Replaced `the legacy MCA SDK` with `@agentapps/sdk`.
  - Switched from HTTP transport (`McaServer`) to stdio transport (`createApp`).
  - Adopted `registerXxxTool(app)` pattern.
  - Inlined `withRetry` / `withTimeout` helpers (no longer provided by SDK).
  - Secrets access via `ctx.secrets.getUser()` instead of `context.getUserSecrets()`.
