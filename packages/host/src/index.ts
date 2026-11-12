/**
 * @agentapps/host — host side of the app station protocol.
 *
 * What a platform embeds to consume agent apps:
 * connect to a app station, open tenant sessions, route tool calls, answer
 * secret/auth requests, track health.
 *
 * @example
 * ```ts
 * import { AgentAppHost } from '@agentapps/host';
 *
 * const host = new AgentAppHost(transport, {
 *   host: { name: 'my-platform', version: '1.0.0' },
 *   requests: {
 *     onGetInstallationSecrets: async (sessionId) => db.getInstallationSecrets(sessionId),
 *   },
 * });
 *
 * const info = await host.initialize();
 * const session = await host.openSession({ installationId: 'inst_1', tenant: { userId: 'u1' } });
 * const tools = await session.listTools();
 * const result = await session.callTool('greet', { name: 'World' }, context);
 * await session.close();
 * await host.shutdown();
 * ```
 */

// UI types (re-exported from protocol)
export type {
  ComponentDeclaration,
  RendererDeclaration,
  RendererOutput,
  ScreenComponent,
  ScreenDeclaration,
  UIComponent,
} from '@agentapps/protocol';
// Telemetry (re-exported from @agentapps/protocol)
export {
  NOOP_TELEMETRY,
  NoopTelemetryProvider,
  PROTOCOL_VERSION,
  type SpanHandle,
  type TelemetryAttributes,
  type TelemetryProvider,
} from '@agentapps/protocol';
// Conversation hooks (docs/specs/hooks/conversation-hooks.md)
export {
  approximateTokens,
  CONTEXT_SAFETY_INSTRUCTION,
  type ContextContribution,
  type ContextRegion,
  type RegionAttribution,
  type RenderOptions,
  renderContextRegion,
} from './context-region.js';
export {
  type AttributedVeto,
  type ConversationRef,
  type HookApp,
  type HookCeilings,
  HookDispatcher,
  type HookDispatcherOptions,
  type HookLogEntry,
  type HookSession,
  type PreTurnOutcome,
  REFERENCE_CEILINGS,
  type ShapingOutcome,
  type TurnAttribution,
} from './hook-dispatcher.js';
// Host
export { AgentAppHost, type AgentAppHostConfig } from './host.js';
// Session
export {
  type AuthPromptHandler,
  HookTimeoutError,
  type SecretPromptHandler,
  Session,
  type UrlPromptHandler,
} from './session.js';
// Types
export type {
  AppInfo,
  Binding,
  BindingStore,
  ControllerHealthStatus,
  ControllerLimits,
  EventsGapListener,
  HealthStatus,
  HookResult,
  HostInfo,
  InitializeResult,
  LifecycleResult,
  RequestHandlers,
  SessionOpenOptions,
  SessionStatusListener,
  StationCapabilities,
  StationInfo,
  Tenant,
  ToolDefinition,
  ToolResult,
} from './types.js';
// Binding store
export { InMemoryBindingStore } from './types.js';
