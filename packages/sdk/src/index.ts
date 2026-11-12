/**
 * @agentapps/sdk — Agent App authoring SDK.
 *
 * Public API for building agent apps:
 * - `createApp()` — create an app builder
 * - `.tool()` — register tools (description, parameters, handler)
 * - `.health()` — register a health check handler
 * - `.toFactory()` — produce a factory function for the app station
 * - `.toManifest()` — generate the protocol v2.0 manifest
 * - `.toTools()` — generate the protocol v2.0 tools array
 * - `.build()` — write `agentapp.json` and `tools.json` to disk
 *
 * @example
 * ```ts
 * import { createApp } from '@agentapps/sdk';
 *
 * const app = createApp({
 *   id: 'app.hello',
 *   version: '1.0.0',
 *   name: 'Hello World',
 *   description: 'A minimal Agent App that greets people.',
 *   author: { name: 'Your Name', email: 'you@example.com' },
 *   category: 'utility',
 *   runtime: { transport: 'stdio', command: 'node', args: ['./dist/index.js'] },
 * });
 *
 * app.tool('greet', {
 *   description: 'Greets someone by name',
 *   parameters: {
 *     type: 'object',
 *     properties: { name: { type: 'string' } },
 *     required: ['name'],
 *   },
 *   handler: async (args) => ({ greeting: `Hello, ${args.name}!` }),
 * });
 *
 * export default app.toFactory();
 * ```
 */

// ---------------------------------------------------------------------------
// Protocol re-exports
// ---------------------------------------------------------------------------

export { PROTOCOL_VERSION } from '@agentapps/protocol';

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

export { AgentApp, type AppFactory, createApp, type InstanceEnvironment } from './app.js';
export { HostUnsupportedError } from './app-instance.js';

// ---------------------------------------------------------------------------
// API error classification
// ---------------------------------------------------------------------------

export type { ClassifiedApiError } from './api-errors.js';
export { classifyError, classifyHttpError, parseRetryAfter } from './api-errors.js';

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

export type { ApiAccessOptions } from './health.js';
export { HealthCheckBuilder } from './health.js';

// ---------------------------------------------------------------------------
// Helpers — pollers
// ---------------------------------------------------------------------------

export type { Poller, PollerOptions } from './helpers.js';
export { createPoller } from './helpers.js';

// ---------------------------------------------------------------------------
// Public type definitions
// ---------------------------------------------------------------------------

export type {
  AppApiKeyAuth,
  AppAuthDefinition,
  AppCapabilitiesInput,
  AppConfig,
  AppGitHubAppAuth,
  AppInstallationInput,
  AppNoAuth,
  AppOAuth2Auth,
  AuthAccess,
  AuthResult,
  AuthStatusInfo,
  BuildOptions,
  ComponentConfig,
  ConversationAccess,
  ConversationPage,
  DocumentStorage,
  EventConfig,
  HealthContext,
  HealthHandler,
  HealthResult,
  HookConfig,
  HookContext,
  HookHandler,
  InboundEventHandler,
  InboundEventPayload,
  KeyValueStorage,
  LifecycleContext,
  LifecycleHandler,
  ObjectContent,
  ObjectPage,
  ObjectPutOptions,
  ObjectsAccess,
  PermissionsAccess,
  RendererConfig,
  RendererOutput,
  ScreenComponent,
  ScreenConfig,
  SecretResult,
  SecretsAccess,
  SessionContext,
  ShapingHookResult,
  StorageCollection,
  StorageDocument,
  StorageQueryOptions,
  StorageQueryPage,
  ToolConfig,
  ToolContext,
  ToolHandler,
  ToolParameters,
  UIComponent,
  UIDetailField,
  UITreeNode,
  UserProfileAccess,
  VolumeStorage,
} from './types.js';
