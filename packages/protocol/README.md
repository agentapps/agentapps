# @agentapps/protocol

Agent Apps Protocol v2.0 — the standard the whole `@agentapps` ecosystem implements.

- **Envelope**: `{ id, type, timestamp, version, sessionId? }` shared by both planes.
- **Control plane** (host ↔ controller): `initialize`/`initialized` handshake with capability negotiation, `session_open`/`session_close` tenant sessions, bounded `controller_health`, `session_status` and `events_gap` notifications.
- **Session plane** (host ↔ app instance, proxied by the controller): tool calls and listing, health checks, cancellation, streaming (`tool_progress`, `tool_stream`), events, and secret/auth callbacks.
- **Error model**: typed codes with retryability classification.

Transport-agnostic: the same messages run over stdio, HTTP, WebSocket, or gRPC. Bundled transport bindings are included — `StdioTransport`, `HttpTransport`, and an in-process pair via `createInProcessTransportPair()`.
