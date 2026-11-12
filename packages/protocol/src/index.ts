/**
 * @agentapps/protocol — Agent Apps Protocol v2.0.
 *
 * The standard everything else implements:
 * - Envelope shared by both planes.
 * - Control plane (host ↔ app station): handshake, sessions, health.
 * - Session plane (host ↔ instance, via app station): tool calls, streaming,
 *   events, secret/auth requests.
 * - Tool definitions and annotation model.
 * - Error model.
 * - Transport interface and in-process binding.
 * - App manifest schema and validation.
 * - File system (volume storage + sharing) requests.
 * - Lifecycle hooks (install, uninstall, session open/close).
 */

export * from './app-manifest.js';
export * from './auth.js';
export * from './control-plane.js';
export * from './envelope.js';
export * from './errors.js';
export * from './file-system.js';
export * from './hooks.js';
export type { HttpTransportOptions, SendError } from './http-transport.js';
export { HttpTransport } from './http-transport.js';
export * from './lifecycle.js';
export * from './session-plane.js';
export * from './stdio-transport.js';
export * from './telemetry.js';
export * from './tools.js';
export * from './transport.js';
