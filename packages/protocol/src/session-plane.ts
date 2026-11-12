/**
 * Agent Apps Protocol v2.0 — session plane.
 *
 * The session-plane message families (tool calls, streaming, events,
 * secret/auth requests), scoped to a session. The app station proxies
 * these verbatim between host and instance.
 *
 * Spec: Agent Apps Protocol v2.0 — REQ-6, REQ-7.
 */

import { z } from 'zod';
import { AppPermissionsSchema, RendererOutputSchema } from './app-manifest.js';
import {
  createEnvelope,
  type ExecutionContext,
  ExecutionContextSchema,
  PROTOCOL_VERSION,
  type SessionMessageBase,
  SessionMessageBaseSchema,
} from './envelope.js';
import { type ProtocolError, ProtocolErrorSchema } from './errors.js';
import {
  ConversationReadRequestSchema,
  ConversationReadResultSchema,
  HookAckSchema,
  HookNotifySchema,
  type HookRequest,
  HookRequestSchema,
  type HookResponse,
  HookResponseSchema,
} from './hooks.js';
import { ToolDefinitionSchema } from './tools.js';

export {
  type ExecutionContext,
  ExecutionContextSchema,
  type SessionMessageBase,
  SessionMessageBaseSchema,
} from './envelope.js';

// --------------------------------------------------------------------------
// Health schemas (session-level, instance health)
// --------------------------------------------------------------------------

export const HealthStatusSchema = z.enum(['ready', 'not_ready', 'degraded']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const HealthIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
  action: z
    .object({
      type: z.enum(['link', 'oauth']),
      url: z.string(),
      label: z.string(),
    })
    .optional(),
});

export type HealthIssue = z.infer<typeof HealthIssueSchema>;

// ============================================================================
// HOST → INSTANCE REQUESTS (via app station)
// ============================================================================

/** Execute a tool. */
export const ToolCallRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('tool_call'),
  /** Tool to execute. */
  tool: z.string(),
  /** Tool arguments. */
  arguments: z.record(z.string(), z.unknown()),
  /** Execution context — who is calling. */
  context: ExecutionContextSchema,
});
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;

/** List available tools. */
export const ListToolsRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('list_tools'),
});
export type ListToolsRequest = z.infer<typeof ListToolsRequestSchema>;

/** Check instance health (credential-level, per-session). */
export const HealthCheckRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('health_check'),
});
export type HealthCheckRequest = z.infer<typeof HealthCheckRequestSchema>;

/** Graceful shutdown request. */
export const ShutdownRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('shutdown'),
  /** Timeout in ms before force kill. */
  gracePeriod: z.number(),
});
export type ShutdownRequest = z.infer<typeof ShutdownRequestSchema>;

/** Cancel an in-flight request. */
export const CancelRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('cancel'),
  /** Request id to cancel. */
  requestId: z.string(),
  /** Reason for cancellation. */
  reason: z.string().optional(),
});
export type CancelRequest = z.infer<typeof CancelRequestSchema>;

/** Subscribe to events. */
export const SubscribeRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('subscribe'),
  /** Subscription type (app-specific). */
  subscription: z.string(),
  /** Subscription parameters. */
  params: z.record(z.string(), z.unknown()),
  /** Channel to receive events. */
  channelId: z.string(),
});
export type SubscribeRequest = z.infer<typeof SubscribeRequestSchema>;

/** Unsubscribe from events. */
export const UnsubscribeRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('unsubscribe'),
  /** Subscription id to remove. */
  subscriptionId: z.string(),
});
export type UnsubscribeRequest = z.infer<typeof UnsubscribeRequestSchema>;

// ============================================================================
// CONVERSATION HOOKS: schemas live in hooks.ts (HOOK spec); the unions below
// include them.
// ============================================================================

// ============================================================================
// INSTALLATION LIFECYCLE HOOKS (host → instance request, instance → host response)
//
// Fired at installation lifecycle points: install, uninstall, upgrade.
// These are session-plane messages — the host opens a session and sends
// the lifecycle request through it. The app station proxies verbatim.
// Unlike conversation hooks, these carry no annotations or veto; handlers
// return a simple success/error acknowledgement.
//
// Spec: session plane item 3.6
// ============================================================================

/** Lifecycle event types. */
export const LifecycleEventSchema = z.enum(['install', 'uninstall', 'upgrade']);
export type LifecycleEvent = z.infer<typeof LifecycleEventSchema>;

/** Host → Instance: invoke a lifecycle hook. */
export const LifecycleRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('lifecycle_request'),
  /** Which lifecycle event is being invoked. */
  event: LifecycleEventSchema,
  /** Execution context — who/where. */
  context: ExecutionContextSchema,
  /** Previous version (only present for 'upgrade' events). */
  previousVersion: z.string().optional(),
});
export type LifecycleRequest = z.infer<typeof LifecycleRequestSchema>;

/** Instance → Host: lifecycle hook response. */
export const LifecycleResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('lifecycle_response'),
  /** Whether the lifecycle handler completed successfully. */
  success: z.boolean(),
  /** Error message if !success. */
  error: z.string().optional(),
});
export type LifecycleResponse = z.infer<typeof LifecycleResponseSchema>;

/** Union of all session-plane requests (host → instance). */
export const SessionRequestSchema = z.discriminatedUnion('type', [
  ToolCallRequestSchema,
  ListToolsRequestSchema,
  HealthCheckRequestSchema,
  ShutdownRequestSchema,
  CancelRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
  HookRequestSchema,
  HookNotifySchema,
  LifecycleRequestSchema,
]);
export type SessionRequest = z.infer<typeof SessionRequestSchema>;

// ============================================================================
// INSTANCE → HOST RESPONSES (via app station)
// ============================================================================

/** Tool execution result. */
export const ToolResultResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('tool_result'),
  /** Whether the tool executed successfully. */
  success: z.boolean(),
  /** Tool output (if success). */
  result: z.unknown().optional(),
  /**
   * Typed structured content visible to the model (MCP spec §structuredContent).
   * Separate from `result` which may be legacy text. The host exposes
   * `structuredContent` to the model and `_meta` (in result) only to the UI.
   */
  structuredContent: z.unknown().optional(),
  /** Attachments (images, files) generated by the tool. */
  attachments: z
    .array(
      z.object({
        url: z.string(),
        mime: z.string(),
        filename: z.string().optional(),
      }),
    )
    .optional(),
  /**
   * Renderer output for the host UI (Phase 6).
   *
   * When the tool's bound renderer is declared in the manifest, the host
   * uses this payload instead of plain text. Contains declarative components
   * and/or pre-rendered format variants.
   */
  renderer: RendererOutputSchema.optional(),
  /** Error details (if !success). */
  error: ProtocolErrorSchema.optional(),
  /** Execution time in milliseconds. */
  duration: z.number(),
});
export type ToolResultResponse = z.infer<typeof ToolResultResponseSchema>;

/** Available tools list. */
export const ToolsListResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('tools_list'),
  tools: z.array(ToolDefinitionSchema),
});
export type ToolsListResponse = z.infer<typeof ToolsListResponseSchema>;

/** Instance health status response. */
export const HealthStatusResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('health_status'),
  status: HealthStatusSchema,
  /** Human-readable message. */
  message: z.string().optional(),
  /** Structured issues for UI display. */
  issues: z.array(HealthIssueSchema).optional(),
  /** Uptime in seconds. */
  uptime: z.number().optional(),
  /** App version. */
  version: z.string().optional(),
  /** Memory usage in bytes. */
  memoryUsage: z.number().optional(),
});
export type HealthStatusResponse = z.infer<typeof HealthStatusResponseSchema>;

/** Shutdown acknowledged. */
export const ShutdownAckResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('shutdown_ack'),
});
export type ShutdownAckResponse = z.infer<typeof ShutdownAckResponseSchema>;

/** Cancellation result. */
export const CancelResultResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('cancel_result'),
  /** Original request id. */
  requestId: z.string(),
  /** Whether cancellation was successful. */
  cancelled: z.boolean(),
  /** If not cancelled, why. */
  reason: z.string().optional(),
});
export type CancelResultResponse = z.infer<typeof CancelResultResponseSchema>;

/** Subscription created. */
export const SubscribeResultResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('subscribe_result'),
  /** Subscription id for management. */
  subscriptionId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
export type SubscribeResultResponse = z.infer<typeof SubscribeResultResponseSchema>;

/** Subscription removed. */
export const UnsubscribeResultResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('unsubscribe_result'),
  subscriptionId: z.string(),
  success: z.boolean(),
});
export type UnsubscribeResultResponse = z.infer<typeof UnsubscribeResultResponseSchema>;

/** Session-plane error response. */
export const SessionErrorResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('error'),
  error: ProtocolErrorSchema,
});
export type SessionErrorResponse = z.infer<typeof SessionErrorResponseSchema>;

/** Union of all session-plane responses (instance → host). */
export const SessionResponseSchema = z.discriminatedUnion('type', [
  ToolResultResponseSchema,
  ToolsListResponseSchema,
  HealthStatusResponseSchema,
  ShutdownAckResponseSchema,
  CancelResultResponseSchema,
  SubscribeResultResponseSchema,
  UnsubscribeResultResponseSchema,
  SessionErrorResponseSchema,
  HookResponseSchema,
  HookAckSchema,
  LifecycleResponseSchema,
]);
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

// ============================================================================
// INSTANCE → HOST EVENTS (unsolicited, via app station)
// ============================================================================

/** Log message from instance. */
export const LogEventSchema = SessionMessageBaseSchema.extend({
  type: z.literal('log'),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  data: z.unknown().optional(),
});
export type LogEvent = z.infer<typeof LogEventSchema>;

/** Progress update for a long-running tool. */
export const ToolProgressEventSchema = SessionMessageBaseSchema.extend({
  type: z.literal('tool_progress'),
  /** Original request id. */
  requestId: z.string(),
  /** Progress percentage (0–100), or null if indeterminate. */
  progress: z.number().nullable(),
  /** Current status message. */
  status: z.string(),
  /** Estimated time remaining in ms. */
  eta: z.number().optional(),
  /** Partial result. */
  partial: z.unknown().optional(),
});
export type ToolProgressEvent = z.infer<typeof ToolProgressEventSchema>;

/** Streaming text output chunk. */
export const ToolStreamEventSchema = SessionMessageBaseSchema.extend({
  type: z.literal('tool_stream'),
  /** Original request id. */
  requestId: z.string(),
  /** Stream chunk. */
  chunk: z.string(),
  /** Is this the final chunk? */
  done: z.boolean(),
});
export type ToolStreamEvent = z.infer<typeof ToolStreamEventSchema>;

/** Event from a subscription (buffered across disconnects — REQ-12). */
export const SubscriptionEventSchema = SessionMessageBaseSchema.extend({
  type: z.literal('subscription_event'),
  subscriptionId: z.string(),
  /** Event type (app-specific). */
  event: z.string(),
  /** Event payload. */
  data: z.unknown(),
});
export type SubscriptionEvent = z.infer<typeof SubscriptionEventSchema>;

/** Union of all instance → host events (unsolicited). */
export const SessionEventSchema = z.discriminatedUnion('type', [
  LogEventSchema,
  ToolProgressEventSchema,
  ToolStreamEventSchema,
  SubscriptionEventSchema,
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;

// ============================================================================
// HOST → INSTANCE PUSHED EVENTS
// ============================================================================

/** New credentials available (after host-side refresh). */
export const CredentialsUpdatedEventSchema = SessionMessageBaseSchema.extend({
  type: z.literal('credentials_updated'),
  credentials: z.record(z.string(), z.string()),
});
export type CredentialsUpdatedEvent = z.infer<typeof CredentialsUpdatedEventSchema>;

// --- Inbound event (forward-declared here so HostPushedEventSchema can reference it) ---

/** Source discriminator for inbound subscriptions. */
export const InboundSourceSchema = z.discriminatedUnion('kind', [
  /** Events from a bound app, resolved via the binding name. */
  z.object({ kind: z.literal('binding'), binding: z.string().min(1) }),
  /** Events from the host platform, scoped to a namespace. */
  z.object({ kind: z.literal('platform'), namespace: z.string().min(1) }),
]);
export type InboundSource = z.infer<typeof InboundSourceSchema>;

/** Host → Instance: pushed inbound event (unsolicited after subscription). */
export const InboundEventSchema = SessionMessageBaseSchema.extend({
  type: z.literal('inbound_event'),
  /** Subscription that matched this event. */
  subscriptionId: z.string(),
  /** Source of the event. */
  source: InboundSourceSchema,
  /** Event type name. */
  eventType: z.string(),
  /** Event payload. */
  data: z.unknown(),
});
export type InboundEvent = z.infer<typeof InboundEventSchema>;

// --- Permissions snapshot & change notifications (R9) ---

/**
 * Effective permissions the app currently holds.
 *
 * Mirrors the AppPermissions shape but reflects only what the user/admin
 * approved, plus optional scope restrictions. Enforcement is always
 * host-side; this is informational so the app can degrade gracefully.
 */
export const EffectivePermissionsSchema = z.object({
  /** Approved permissions (subset of what the manifest declared). */
  permissions: AppPermissionsSchema,
  /**
   * Optional scope restrictions imposed by the user.
   * Keys are permission names, values are provider-specific.
   * Example: { 'network:egress': ['api.github.com', 'repo-y'] }
   */
  restrictions: z.record(z.string(), z.unknown()).optional(),
});
export type EffectivePermissions = z.infer<typeof EffectivePermissionsSchema>;

/** Host → Instance: permissions changed (initial snapshot or live update). */
export const PermissionsChangedEventSchema = SessionMessageBaseSchema.extend({
  type: z.literal('permissions_changed'),
  /** Current effective permissions after the change. */
  permissions: EffectivePermissionsSchema,
});
export type PermissionsChangedEvent = z.infer<typeof PermissionsChangedEventSchema>;

/** Union of host-pushed events (host → instance). */
export const HostPushedEventSchema = z.discriminatedUnion('type', [
  CredentialsUpdatedEventSchema,
  InboundEventSchema,
  PermissionsChangedEventSchema,
]);
export type HostPushedEvent = z.infer<typeof HostPushedEventSchema>;

// ============================================================================
// INSTANCE → HOST CALLBACKS (reverse direction, via app station — REQ-7)
//
// These replace the v1.0 `callbackUrl` HTTP pattern: the instance sends
// requests to the host over the session connection, and the host responds.
// The app station proxies them carrying the sessionId so the host resolves
// the tenant. The app station MUST NOT read or persist secret payloads.
// ============================================================================

/** Get system-level secrets. */
export const GetSystemSecretsRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('get_system_secrets'),
  requestId: z.string(),
});
export type GetSystemSecretsRequest = z.infer<typeof GetSystemSecretsRequestSchema>;

/** System secrets result (host → instance). */
export const SystemSecretsResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('system_secrets'),
  requestId: z.string(),
  secrets: z.record(z.string(), z.string()).nullable(),
  error: z.string().optional(),
});
export type SystemSecretsResult = z.infer<typeof SystemSecretsResultSchema>;

/** Get installation secrets. */
export const GetInstallationSecretsRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('get_installation_secrets'),
  requestId: z.string(),
});
export type GetInstallationSecretsRequest = z.infer<typeof GetInstallationSecretsRequestSchema>;

/** Installation secrets result (host → instance). */
export const InstallationSecretsResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('installation_secrets'),
  requestId: z.string(),
  secrets: z.record(z.string(), z.string()).nullable(),
  error: z.string().optional(),
});
export type InstallationSecretsResult = z.infer<typeof InstallationSecretsResultSchema>;

/** Update installation secrets (after token refresh inside the instance). */
export const UpdateInstallationSecretsRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('update_installation_secrets'),
  requestId: z.string(),
  secrets: z.record(z.string(), z.string()),
});
export type UpdateInstallationSecretsRequest = z.infer<
  typeof UpdateInstallationSecretsRequestSchema
>;

/** Update installation secrets result (host → instance). */
export const UpdateInstallationSecretsResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('update_installation_secrets_response'),
  requestId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
export type UpdateInstallationSecretsResult = z.infer<typeof UpdateInstallationSecretsResultSchema>;

/** Get OAuth authorization URL. */
export const AuthUrlRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('auth_url'),
  requestId: z.string(),
  provider: z.string(),
  scopes: z.array(z.string()).optional(),
});
export type AuthUrlRequest = z.infer<typeof AuthUrlRequestSchema>;

/** OAuth URL result (host → instance). */
export const AuthUrlResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('auth_url_result'),
  requestId: z.string(),
  url: z.string(),
  state: z.string(),
});
export type AuthUrlResult = z.infer<typeof AuthUrlResultSchema>;

/** Check auth status. */
export const AuthStatusRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('auth_status'),
  requestId: z.string(),
});
export type AuthStatusCallback = z.infer<typeof AuthStatusRequestSchema>;

/** Auth status result (host → instance). */
export const AuthStatusResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('auth_status_result'),
  requestId: z.string(),
  authenticated: z.boolean(),
  provider: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().optional(),
  authRequired: z.boolean().optional(),
  authUrl: z.string().optional(),
});
export type AuthStatusResult = z.infer<typeof AuthStatusResultSchema>;

/** Request a token refresh using the host-stored refresh token. */
export const RefreshTokenRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('refresh_token'),
  requestId: z.string(),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

/** Token refresh result (host → instance). */
export const RefreshTokenResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('refresh_token_response'),
  requestId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  error: z.string().optional(),
});
export type RefreshTokenResult = z.infer<typeof RefreshTokenResultSchema>;

// ============================================================================
// INTENTS (instance → host request — R3, Phase 4)
//
// The consumer instance sends an intent_call to the host. The host resolves
// the binding, opens a session to the target, calls the tool, and returns
// the result via intent_result. The app station proxies these as requests
// (sessionId validated per REQ-7).
// ============================================================================

/** Instance → Host: call a tool on a bound app via an intent. */
export const IntentCallRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('intent_call'),
  requestId: z.string(),
  /** Local binding name from the consumer's `requires` manifest field. */
  binding: z.string().min(1),
  /** Tool name within the bound target app. */
  tool: z.string().min(1),
  /** Tool arguments. */
  arguments: z.record(z.string(), z.unknown()).default({}),
});
export type IntentCallRequest = z.infer<typeof IntentCallRequestSchema>;

/** Host → Instance: intent call result (mirrors tool_result shape). */
export const IntentResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('intent_result'),
  requestId: z.string(),
  success: z.boolean(),
  result: z.unknown().optional(),
  error: ProtocolErrorSchema.optional(),
  /** Target tool execution time in ms. */
  duration: z.number().default(0),
});
export type IntentResult = z.infer<typeof IntentResultSchema>;

// ============================================================================
// INBOUND EVENT SUBSCRIPTIONS — requests (instance → host — R6 inbound)
//
// InboundSourceSchema, InboundEventSchema are declared above (in HOST →
// INSTANCE PUSHED EVENTS) so HostPushedEventSchema can reference them.
// Subscribe/unsubscribe callbacks live here with the other callbacks.
// ============================================================================

/** Instance → Host: subscribe to inbound events. */
export const InboundSubscribeRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('inbound_subscribe'),
  requestId: z.string(),
  /** Where events come from. */
  source: InboundSourceSchema,
  /** Event types to subscribe to (e.g. ['message_received', '*']). */
  eventTypes: z.array(z.string().min(1)).min(1),
});
export type InboundSubscribeRequest = z.infer<typeof InboundSubscribeRequestSchema>;

/** Host → Instance: inbound subscription result. */
export const InboundSubscribeResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('inbound_subscribe_result'),
  requestId: z.string(),
  success: z.boolean(),
  /** Opaque subscription id for later unsubscribe. */
  subscriptionId: z.string().optional(),
  error: ProtocolErrorSchema.optional(),
});
export type InboundSubscribeResult = z.infer<typeof InboundSubscribeResultSchema>;

/** Instance → Host: unsubscribe from inbound events. */
export const InboundUnsubscribeRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('inbound_unsubscribe'),
  requestId: z.string(),
  subscriptionId: z.string(),
});
export type InboundUnsubscribeRequest = z.infer<typeof InboundUnsubscribeRequestSchema>;

/** Host → Instance: unsubscribe result. */
export const InboundUnsubscribeResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('inbound_unsubscribe_result'),
  requestId: z.string(),
  success: z.boolean(),
});
export type InboundUnsubscribeResult = z.infer<typeof InboundUnsubscribeResultSchema>;

// ============================================================================
// USER PROFILE (instance → host — R11)
// ============================================================================

/** Instance → Host: get the authenticated user's profile (gated by profile permission). */
export const GetUserProfileRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('get_user_profile'),
  requestId: z.string(),
});
export type GetUserProfileRequest = z.infer<typeof GetUserProfileRequestSchema>;

/** User profile shape returned by the host. */
export const UserProfileSchema = z.object({
  /** Opaque user identifier. */
  userId: z.string(),
  /** Display name. */
  displayName: z.string(),
  /** User locale (e.g. 'en-US', 'es-ES'). */
  locale: z.string().optional(),
  /** User timezone (IANA, e.g. 'Europe/Madrid'). */
  timezone: z.string().optional(),
  /** Email (only present when app holds profile.full permission). */
  email: z.string().optional(),
  /** Avatar URL (only present when app holds profile.full permission). */
  avatarUrl: z.string().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/** Host → Instance: user profile result. */
export const UserProfileResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('user_profile_result'),
  requestId: z.string(),
  profile: UserProfileSchema.nullable(),
  error: z.string().optional(),
});
export type UserProfileResult = z.infer<typeof UserProfileResultSchema>;

// ============================================================================
// OBJECTS — immutable binary blobs private to an Installation (Request)
//
// An Object is a file the app uploads once and gets a URL for. It never
// changes: a new version is a new object. Objects are private by default
// (served only to signed-in humans of the Workspace, to Apps of the same
// Workspace through object_get, or through a temporary signed link) or public
// (permanent URL, anyone who holds it).
// ============================================================================

export const ObjectVisibilitySchema = z.enum(['private', 'public']);
export type ObjectVisibility = z.infer<typeof ObjectVisibilitySchema>;

/** Metadata of a stored Object, as returned by put, get and list. */
export const ObjectInfoSchema = z.object({
  objectId: z.string(),
  url: z.string(),
  size: z.number().int().nonnegative(),
  contentType: z.string(),
  visibility: ObjectVisibilitySchema,
  /** ISO 8601 creation timestamp. */
  createdAt: z.string(),
  filename: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type ObjectInfo = z.infer<typeof ObjectInfoSchema>;

/** Instance → Host: upload an immutable object. */
export const ObjectPutRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_put'),
  requestId: z.string(),
  /** Base64-encoded content. */
  data: z.string(),
  contentType: z.string().min(1),
  filename: z.string().optional(),
  /** Default: private. */
  visibility: ObjectVisibilitySchema.optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});
export type ObjectPutRequest = z.infer<typeof ObjectPutRequestSchema>;

/** Host → Instance: object put result. */
export const ObjectPutResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_put_result'),
  requestId: z.string(),
  success: z.boolean(),
  objectId: z.string().optional(),
  url: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
  visibility: ObjectVisibilitySchema.optional(),
  createdAt: z.string().optional(),
  error: z.string().optional(),
});
export type ObjectPutResult = z.infer<typeof ObjectPutResultSchema>;

/** Instance → Host: read an object of the same Workspace by id. */
export const ObjectGetRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_get'),
  requestId: z.string(),
  objectId: z.string().min(1),
});
export type ObjectGetRequest = z.infer<typeof ObjectGetRequestSchema>;

/** Host → Instance: object get result. */
export const ObjectGetResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_get_result'),
  requestId: z.string(),
  success: z.boolean(),
  /** Base64-encoded content. */
  data: z.string().optional(),
  objectId: z.string().optional(),
  url: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
  visibility: ObjectVisibilitySchema.optional(),
  createdAt: z.string().optional(),
  filename: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  error: z.string().optional(),
});
export type ObjectGetResult = z.infer<typeof ObjectGetResultSchema>;

/** Instance → Host: delete one of the Installation's objects. */
export const ObjectDeleteRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_delete'),
  requestId: z.string(),
  objectId: z.string().min(1),
});
export type ObjectDeleteRequest = z.infer<typeof ObjectDeleteRequestSchema>;

/** Host → Instance: object delete result. */
export const ObjectDeleteResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_delete_result'),
  requestId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
export type ObjectDeleteResult = z.infer<typeof ObjectDeleteResultSchema>;

/** Instance → Host: list the Installation's objects, newest first. */
export const ObjectListRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_list'),
  requestId: z.string(),
  limit: z.number().int().positive().optional(),
  cursor: z.string().optional(),
});
export type ObjectListRequest = z.infer<typeof ObjectListRequestSchema>;

/** Host → Instance: object list result. */
export const ObjectListResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_list_result'),
  requestId: z.string(),
  success: z.boolean(),
  objects: z.array(ObjectInfoSchema).optional(),
  nextCursor: z.string().optional(),
  error: z.string().optional(),
});
export type ObjectListResult = z.infer<typeof ObjectListResultSchema>;

/** Instance → Host: lend a private object to the outside through a signed link. */
export const ObjectLinkRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_link'),
  requestId: z.string(),
  objectId: z.string().min(1),
  /** Link lifetime in seconds. */
  expiresIn: z.number().int().positive(),
});
export type ObjectLinkRequest = z.infer<typeof ObjectLinkRequestSchema>;

/** Host → Instance: object link result. */
export const ObjectLinkResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('object_link_result'),
  requestId: z.string(),
  success: z.boolean(),
  url: z.string().optional(),
  /** ISO 8601 expiry timestamp. */
  expiresAt: z.string().optional(),
  error: z.string().optional(),
});
export type ObjectLinkResult = z.infer<typeof ObjectLinkResultSchema>;

/** Request types of the Objects family (instance → host). */
export const OBJECT_REQUEST_TYPES = new Set([
  'object_put',
  'object_get',
  'object_delete',
  'object_list',
  'object_link',
]);

// ============================================================================
// CALLBACKS (v2.0 unified request/response — auth, secrets, URL)
// ============================================================================

/** Instance → Host: request a request (auth, secret, URL). */
export const PromptRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('prompt'),
  promptType: z.enum(['auth', 'secret', 'url']),
  promptId: z.string(),
  // For auth
  provider: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  // For secret
  secretName: z.string().optional(),
  description: z.string().optional(),
  // For URL
  url: z.string().optional(),
  title: z.string().optional(),
  // Common
  timeoutMs: z.number().optional(),
});
export type PromptRequest = z.infer<typeof PromptRequestSchema>;

/** Host → Instance: request result. */
export const PromptResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('prompt_result'),
  promptId: z.string(),
  success: z.boolean(),
  // For auth success
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  expiresAt: z.string().optional(),
  // For secret success
  secretValue: z.string().optional(),
  // For URL
  opened: z.boolean().optional(),
  // For failure
  error: z.string().optional(),
  cancelled: z.boolean().optional(),
});
export type PromptResult = z.infer<typeof PromptResultSchema>;

// ============================================================================
// STORAGE — document store private to an Installation (Request)
//
// Named collections of JSON documents with an id, queried by field and
// updated partially. The instance asks the Host over the session; the Host
// owns the backing store (MongoDB, files, memory) and scopes every operation
// by installationId. Key-value access is SDK sugar over a reserved collection,
// not a protocol concept. Wire shapes match the Teros backend field for field.
// ============================================================================

/** Query filter: equality on top-level fields; every field must match. */
export const StorageFilterSchema = z.record(z.string(), z.unknown());
export type StorageFilter = z.infer<typeof StorageFilterSchema>;

/** A stored document. */
export const StorageDocumentSchema = z.record(z.string(), z.unknown());
export type StorageDocument = z.infer<typeof StorageDocumentSchema>;

/** Instance → Host: store a document, replacing any document with the same id. */
export const StoragePutRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_put'),
  requestId: z.string(),
  collection: z.string().min(1),
  documentId: z.string().min(1),
  document: StorageDocumentSchema,
});
export type StoragePutRequest = z.infer<typeof StoragePutRequestSchema>;

/** Host → Instance: put result. */
export const StoragePutResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_put_response'),
  requestId: z.string(),
  success: z.boolean(),
  documentId: z.string().optional(),
  error: z.string().optional(),
});
export type StoragePutResult = z.infer<typeof StoragePutResultSchema>;

/** Instance → Host: read one document by id. */
export const StorageGetRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_get'),
  requestId: z.string(),
  collection: z.string().min(1),
  documentId: z.string().min(1),
});
export type StorageGetRequest = z.infer<typeof StorageGetRequestSchema>;

/** Host → Instance: get result. `document` is null when the id does not exist. */
export const StorageGetResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_get_response'),
  requestId: z.string(),
  success: z.boolean(),
  document: StorageDocumentSchema.nullable(),
  error: z.string().optional(),
});
export type StorageGetResult = z.infer<typeof StorageGetResultSchema>;

/** Instance → Host: query a collection. */
export const StorageQueryRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_query'),
  requestId: z.string(),
  collection: z.string().min(1),
  /** Documents matching every field are returned. Omit for all documents. */
  filter: StorageFilterSchema.optional(),
  /** Page size (host default 100, host maximum 1000). */
  limit: z.number().int().positive().optional(),
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor: z.string().optional(),
});
export type StorageQueryRequest = z.infer<typeof StorageQueryRequestSchema>;

/** Host → Instance: one page of query results. */
export const StorageQueryResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_query_response'),
  requestId: z.string(),
  success: z.boolean(),
  documents: z.array(StorageDocumentSchema),
  /** Present when more documents follow. */
  nextCursor: z.string().optional(),
  error: z.string().optional(),
});
export type StorageQueryResult = z.infer<typeof StorageQueryResultSchema>;

/** Instance → Host: merge `patch` into an existing document. */
export const StorageUpdateRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_update'),
  requestId: z.string(),
  collection: z.string().min(1),
  documentId: z.string().min(1),
  /** Fields to set; other fields keep their values. */
  patch: StorageDocumentSchema,
});
export type StorageUpdateRequest = z.infer<typeof StorageUpdateRequestSchema>;

/** Host → Instance: update result. `document` is the updated document, null when not found. */
export const StorageUpdateResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_update_response'),
  requestId: z.string(),
  success: z.boolean(),
  document: StorageDocumentSchema.nullable(),
  error: z.string().optional(),
});
export type StorageUpdateResult = z.infer<typeof StorageUpdateResultSchema>;

/** Instance → Host: delete one document by id. Deleting a missing id succeeds. */
export const StorageDeleteRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_delete'),
  requestId: z.string(),
  collection: z.string().min(1),
  documentId: z.string().min(1),
});
export type StorageDeleteRequest = z.infer<typeof StorageDeleteRequestSchema>;

/** Host → Instance: delete result. */
export const StorageDeleteResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('storage_delete_response'),
  requestId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});
export type StorageDeleteResult = z.infer<typeof StorageDeleteResultSchema>;

/** The five Storage request types, for Hosts and Stations that route them. */
export const STORAGE_REQUEST_TYPES = new Set([
  'storage_put',
  'storage_get',
  'storage_query',
  'storage_update',
  'storage_delete',
]);

/** Union of request requests (instance → host via app station). */
export const InstanceRequestSchema = z.discriminatedUnion('type', [
  GetSystemSecretsRequestSchema,
  GetInstallationSecretsRequestSchema,
  UpdateInstallationSecretsRequestSchema,
  AuthUrlRequestSchema,
  AuthStatusRequestSchema,
  RefreshTokenRequestSchema,
  PromptRequestSchema,
  GetUserProfileRequestSchema,
  IntentCallRequestSchema,
  InboundSubscribeRequestSchema,
  InboundUnsubscribeRequestSchema,
  StoragePutRequestSchema,
  StorageGetRequestSchema,
  StorageQueryRequestSchema,
  StorageUpdateRequestSchema,
  StorageDeleteRequestSchema,
  ObjectPutRequestSchema,
  ObjectGetRequestSchema,
  ObjectDeleteRequestSchema,
  ObjectListRequestSchema,
  ObjectLinkRequestSchema,
  ConversationReadRequestSchema,
]);
export type InstanceRequest = z.infer<typeof InstanceRequestSchema>;

/** Union of request responses (host → instance via app station). */
export const InstanceRequestResponseSchema = z.discriminatedUnion('type', [
  SystemSecretsResultSchema,
  InstallationSecretsResultSchema,
  UpdateInstallationSecretsResultSchema,
  AuthUrlResultSchema,
  AuthStatusResultSchema,
  RefreshTokenResultSchema,
  PromptResultSchema,
  UserProfileResultSchema,
  IntentResultSchema,
  InboundSubscribeResultSchema,
  InboundUnsubscribeResultSchema,
  StoragePutResultSchema,
  StorageGetResultSchema,
  StorageQueryResultSchema,
  StorageUpdateResultSchema,
  StorageDeleteResultSchema,
  ObjectPutResultSchema,
  ObjectGetResultSchema,
  ObjectDeleteResultSchema,
  ObjectListResultSchema,
  ObjectLinkResultSchema,
  ConversationReadResultSchema,
]);
export type InstanceRequestResponse = z.infer<typeof InstanceRequestResponseSchema>;

// ============================================================================
// HELPERS
// ============================================================================

/** Create a session-plane envelope with the given type and sessionId. */
export function createSessionEnvelope(type: string, sessionId: string): SessionMessageBase {
  return createEnvelope(type, sessionId) as SessionMessageBase;
}

/** Create a tool_call request. */
export function createToolCallRequest(
  sessionId: string,
  tool: string,
  args: Record<string, unknown>,
  context: ExecutionContext,
): ToolCallRequest {
  return {
    ...createSessionEnvelope('tool_call', sessionId),
    type: 'tool_call' as const,
    tool,
    arguments: args,
    context,
  };
}

/** Create a tool_result response (uses the request's id for correlation). */
export function createToolResultResponse(
  requestId: string,
  sessionId: string,
  success: boolean,
  result?: unknown,
  error?: ProtocolError,
  duration = 0,
): ToolResultResponse {
  return {
    id: requestId,
    type: 'tool_result' as const,
    timestamp: new Date().toISOString(),
    version: PROTOCOL_VERSION,
    sessionId,
    success,
    result,
    error,
    duration,
  };
}

/** Create a session-plane error response. */
export function createSessionErrorResponse(
  requestId: string,
  sessionId: string,
  code: string,
  message: string,
  details?: unknown,
): SessionErrorResponse {
  return {
    id: requestId,
    type: 'error' as const,
    timestamp: new Date().toISOString(),
    version: PROTOCOL_VERSION,
    sessionId,
    error: { code, message, details },
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/** Is this a session-plane request (host → instance)? */
export function isSessionRequest(data: unknown): data is SessionRequest {
  return SessionRequestSchema.safeParse(data).success;
}

/** Is this a session-plane response (instance → host)? */
export function isSessionResponse(data: unknown): data is SessionResponse {
  return SessionResponseSchema.safeParse(data).success;
}

/** Is this an instance event (unsolicited, instance → host)? */
export function isSessionEvent(data: unknown): data is SessionEvent {
  return SessionEventSchema.safeParse(data).success;
}

/** Is this a request request (instance → host via app station)? */
export function isInstanceRequest(data: unknown): data is InstanceRequest {
  return InstanceRequestSchema.safeParse(data).success;
}

/** Is this a request response (host → instance via app station)? */
export function isInstanceRequestResponse(data: unknown): data is InstanceRequestResponse {
  return InstanceRequestResponseSchema.safeParse(data).success;
}

/** Is this a unified request request (type === 'prompt')? */
export function isRequestMessage(data: unknown): data is PromptRequest {
  return PromptRequestSchema.safeParse(data).success;
}

/** Is this a unified request result (type === 'prompt_result')? */
export function isCallbackResult(data: unknown): data is PromptResult {
  return PromptResultSchema.safeParse(data).success;
}

/** Is this a tool_call specifically? */
export function isToolCallRequest(data: unknown): data is ToolCallRequest {
  return ToolCallRequestSchema.safeParse(data).success;
}

/** Is this a tool_result specifically? */
export function isToolResultResponse(data: unknown): data is ToolResultResponse {
  return ToolResultResponseSchema.safeParse(data).success;
}

/** Is this a health_status specifically? */
export function isHealthStatusResponse(data: unknown): data is HealthStatusResponse {
  return HealthStatusResponseSchema.safeParse(data).success;
}

/** Is this a hook_request specifically? */
export function isHookRequest(data: unknown): data is HookRequest {
  return HookRequestSchema.safeParse(data).success;
}

/** Is this a hook_response specifically? */
export function isHookResponse(data: unknown): data is HookResponse {
  return HookResponseSchema.safeParse(data).success;
}

/** Is this a lifecycle_request specifically? */
export function isLifecycleRequest(data: unknown): data is LifecycleRequest {
  return LifecycleRequestSchema.safeParse(data).success;
}

/** Is this a lifecycle_response specifically? */
export function isLifecycleResponse(data: unknown): data is LifecycleResponse {
  return LifecycleResponseSchema.safeParse(data).success;
}

// ---------------------------------------------------------------------------
// Storage type guards
// ---------------------------------------------------------------------------

/** Is this a Storage request (put/get/query/update/delete)? */
export function isStorageCallbackRequest(
  data: unknown,
): data is
  | StoragePutRequest
  | StorageGetRequest
  | StorageQueryRequest
  | StorageUpdateRequest
  | StorageDeleteRequest {
  return (
    StoragePutRequestSchema.safeParse(data).success ||
    StorageGetRequestSchema.safeParse(data).success ||
    StorageQueryRequestSchema.safeParse(data).success ||
    StorageUpdateRequestSchema.safeParse(data).success ||
    StorageDeleteRequestSchema.safeParse(data).success
  );
}

/** Is this a Storage response (put/get/query/update/delete)? */
export function isStorageCallbackResponse(
  data: unknown,
): data is
  | StoragePutResult
  | StorageGetResult
  | StorageQueryResult
  | StorageUpdateResult
  | StorageDeleteResult {
  return (
    StoragePutResultSchema.safeParse(data).success ||
    StorageGetResultSchema.safeParse(data).success ||
    StorageQueryResultSchema.safeParse(data).success ||
    StorageUpdateResultSchema.safeParse(data).success ||
    StorageDeleteResultSchema.safeParse(data).success
  );
}
