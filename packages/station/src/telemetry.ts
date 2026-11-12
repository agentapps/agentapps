/**
 * Telemetry re-exports for @agentapps/station.
 *
 * The canonical definitions live in @agentapps/protocol. This module
 * re-exports them so that app station consumers can import from either
 * package.
 */

export {
  NOOP_TELEMETRY,
  NoopTelemetryProvider,
  type SpanHandle,
  type TelemetryAttributes,
  type TelemetryProvider,
} from '@agentapps/protocol';
