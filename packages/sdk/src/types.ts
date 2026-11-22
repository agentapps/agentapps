/**
 * @agentapps/sdk — public type definitions.
 *
 * These are the types app authors interact with when building an agent app
 * using `createApp()`. Internal implementation types live in app-instance.ts.
 */

import type {
  AppEntrypoint,
  AppPermissions,
  AppRequirement,
  AppRuntime,
  EffectivePermissions,
  ExecutionContext,
  HealthIssue,
  HookEntry,
  LifecycleEvent,
  ObjectInfo,
  ObjectVisibility,
  RendererOutput,
  ScreenComponent,
  ToolAnnotations,
  UserProfile,
} from '@agentapps/protocol';

export type {
  AppRuntime,
  ObjectInfo,
  ObjectVisibility,
  RendererOutput,
  ScreenComponent,
  UIComponent,
  UIDetailField,
  UITreeNode,
} from '@agentapps/protocol';

// ---------------------------------------------------------------------------
// App configuration
// ---------------------------------------------------------------------------

/** Configuration passed to `createApp()`. */
export interface AppConfig {
  /** App catalog id (e.g., 'app.hello'). */
  id: string;
  /** App version (semver). */
  version: string;
  /** Display name (max 50 chars). */
  name: string;
  /** Human-readable description (10-500 chars). */
  description: string;
  /** Short one-liner for catalog cards (max 120 chars). */
  tagline?: string;
  /** Author information. */
  author: { name: string; email: string; url?: string };
  /** Category for grouping in catalogs. */
  category: string;
  /** Search keywords. */
  keywords?: string[];
  /** Branded logo path (SVG or PNG ≥1024×1024). */
  logo?: string;
  /** Mono-tint SVG logo for host recoloring. */
  logoMono?: string;
  /** @deprecated Use `logo` instead. */
  icon?: string;
  /** Theme color in hex (e.g. "#E44332"). */
  color?: string;
  /** Cover / header image path. */
  image?: string;
  /** Preview screenshots for catalog. */
  screenshots?: string[];
  /** Homepage / documentation URL. */
  homepage?: string;
  /** Terms of service URL. */
  terms?: string;
  /** SPDX license identifier. */
  license?: string;
  /** Runtime configuration. */
  runtime: AppRuntime;
  /**
   * Mount the workspace volume directly into the container at /workspace.
   * When true, the station bind-mounts the workspace's volume directory so
   * the app can use Node's `fs` natively (POSIX access). Only for apps that
   * need real filesystem access (e.g. Bash, Filesystem).
   * Default: false — apps use `ctx.volume` SDK requests instead.
   */
  mountVolume?: boolean;
  /** Capabilities advertised by the app (protocol-level features). */
  capabilities?: AppCapabilitiesInput;
  /** Platform access permissions requested by the app, approved at install time. */
  permissions?: AppPermissions;
  /** App-to-app dependencies — interfaces this app requires, resolved by user binding. */
  requires?: AppRequirement[];
  /** Conversation lifecycle hooks this app registers. */
  hooks?: HookEntry[];
  /** Installation behavior. */
  installation?: AppInstallationInput;
  /** Authentication configuration. `false` disables auth. */
  auth?: AppAuthDefinition | false;
  /**
   * Entry point that produces the app factory.
   *
   * Accepts a plain string for ergonomics (normalized to
   * `{ type: 'module', path: <string>, export: 'default' }`) or the
   * structured protocol shape.
   */
  entrypoint?: AppEntrypoint | string;
  /**
   * Lifecycle hook invoked when a session subscribes to one or more events.
   *
   * The app receives a ToolContext bound to the subscribing session, so it can
   * start polling, check `ctx.hasSubscribers()`, or emit events immediately.
   */
  onSubscribe?: (ctx: ToolContext, eventTypes: string[]) => void | Promise<void>;

  // -------------------------------------------------------------------------
  // Session lifecycle hooks (v2.0 — install/uninstall/session open/close)
  // -------------------------------------------------------------------------

  /** Called once when the app is installed in a new workspace. */
  onInstall?: LifecycleHandler;
  /** Called when the app is uninstalled from a workspace. */
  onUninstall?: LifecycleHandler;
  /** Called each time a session is opened for this installation. */
  onSessionOpen?: (ctx: SessionContext) => void | Promise<void>;
  /** Called when a session is closed. */
  onSessionClose?: (ctx: SessionContext) => void | Promise<void>;
}

/** Capabilities as authored in `AppConfig` (all optional, protocol-level features only). */
export interface AppCapabilitiesInput {
  /** Exposes tools via the session plane. Default: true. */
  tools?: boolean;
  /** Emits and/or receives events. Default: false. */
  events?: boolean;
  /** Responds to health_check requests. Default: true. */
  health?: boolean;
  /** Supports progress, stream, and log messages. Default: false. */
  streaming?: boolean;
}

// ---------------------------------------------------------------------------

/** Options for `AgentApp.build()`. */
export interface BuildOptions {
  /** Directory where manifest.json and tools.json are written. */
  outDir?: string;
  /** Base path for resolving the entrypoint when a plain string is provided. */
  basePath?: string;
  /** Filename for the manifest. Defaults to `agentapp.json`. */
  manifestFileName?: 'agentapp.json' | 'manifest.json';
}

/** Installation behavior as authored in `AppConfig` (all optional). */
export interface AppInstallationInput {
  /** Whether only one installation of this app is allowed per host. Default: false. */
  singleton?: boolean;
  /** Whether the user must explicitly approve installation. Default: false. */
  requiresUserConsent?: boolean;
  /** Permissions declared by the app (host-defined semantics). Default: []. */
}

// ---------------------------------------------------------------------------
// Auth definitions
// ---------------------------------------------------------------------------

export type AppAuthDefinition = AppNoAuth | AppApiKeyAuth | AppOAuth2Auth | AppGitHubAppAuth;

export interface AppNoAuth {
  type: 'none';
}

export interface AppApiKeyAuth {
  type: 'api-key';
  systemSecrets?: string[];
  installationSecrets?: string[];
  /** Header name used to send the API key (defaults to 'Authorization'). */
  headerName?: string;
  /** Prefix prepended to the secret value (defaults to 'Bearer '). */
  headerPrefix?: string;
}

export interface AppOAuth2Auth {
  type: 'oauth2';
  provider: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  optionalScopes?: string[];
  scopeSeparator?: string;
  pkce?: boolean;
  systemSecrets?: string[];
  installationSecrets?: string[];
  extraFields?: Array<{
    name: string;
    label?: string;
    type?: 'text' | 'password';
    required?: boolean;
    placeholder?: string;
    hint?: string;
  }>;
}

export interface AppGitHubAppAuth {
  type: 'github-app';
  provider: 'github';
  appSlug: string;
  setupUrl: string;
  userOAuth?: boolean;
  tokenUrl?: string;
  permissions?: Record<string, 'read' | 'write' | 'admin'>;
  events?: string[];
  systemSecrets?: string[];
  installationSecrets?: string[];
}

// ---------------------------------------------------------------------------
// Event registration
// ---------------------------------------------------------------------------

/** Configuration for registering an event via `app.event()`. */
export interface EventConfig {
  /** Human-readable description shown to the model. */
  description: string;
}

/** @internal Registered event stored by the app builder. */
export interface RegisteredEvent {
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/** JSON Schema for tool parameters. */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

/**
 * Tool handler — receives parsed arguments and a context, returns a result.
 *
 * The return value is serialized as the `result` field in the `tool_result`
 * response. Return `undefined` / `void` for side-effect-only tools.
 *
 * Throw to signal failure: the error message becomes the `tool_result.error`.
 */
export type ToolHandler<TArgs = Record<string, unknown>> = (
  args: TArgs,
  context: ToolContext,
) => unknown | Promise<unknown>;

/** Configuration for registering a tool via `app.tool()`. */
export interface ToolConfig<TArgs = Record<string, unknown>> {
  /** Human-readable description shown to the model. */
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: ToolParameters;
  /** Optional MCP + platform annotations. */
  annotations?: ToolAnnotations;
  /** Handler function invoked when the tool is called. */
  handler: ToolHandler<TArgs>;
}

/** @internal Registered tool stored by the app builder. */
export interface RegisteredTool {
  name: string;
  description: string;
  parameters: ToolParameters;
  annotations?: ToolAnnotations;
  handler: ToolHandler;
}

// ---------------------------------------------------------------------------
// UI Surfaces — renderers, interfaces, screens (Phase 6)
// ---------------------------------------------------------------------------

/**
 * Renderer configuration for `app.renderer()`.
 *
 * A renderer is a UI piece embedded in chat context, bound to specific tools.
 * When a bound tool returns, the host renders its result with this renderer
 * instead of plain text.
 */
export interface RendererConfig {
  /** Human-readable description. */
  description?: string;
  /** Tools this renderer is bound to (by name). */
  boundTools: string[];
  /** Supported format variants the app can produce. */
  formats?: ('text' | 'html' | 'markdown')[];
  /** Iframe bundle URL for the escape hatch. */
  bundleUrl?: string;
  /**
   * Handler that turns a tool result into UI Components (plus optional text,
   * markdown or HTML variants for hosts that cannot draw components). When a
   * bound tool returns, the output travels in `tool_result.renderer`.
   * Best-effort: if the handler throws, the tool result is still returned.
   */
  render?: (result: unknown, ctx: ToolContext) => Promise<RendererOutput>;
}

/** @internal Registered renderer stored by the app builder. */
export interface RegisteredRenderer {
  /** Renderer name (unique within the app). */
  name: string;
  /** Human-readable description. */
  description?: string;
  /** Tools this renderer is bound to (by name). */
  boundTools: string[];
  /** Supported format variants. */
  formats?: ('text' | 'html' | 'markdown')[];
  /** Iframe bundle URL for the escape hatch. */
  bundleUrl?: string;
  /** Optional render handler — turns a tool result into UI Components. */
  render?: (result: unknown, ctx: ToolContext) => Promise<RendererOutput>;
}

/** App-defined UI Component configuration for `app.component()`. */
export interface ComponentConfig {
  /** Human-readable description. */
  description?: string;
  /** Component bundle URL (the host loads it in a sandboxed container). */
  bundleUrl: string;
  /** Props schema (JSON Schema). */
  propsSchema?: Record<string, unknown>;
}

/** Screen configuration for `app.screen()`. */
export interface ScreenConfig {
  /** Screen title shown in navigation. */
  title: string;
  /** Description of the screen's purpose. */
  description?: string;
  /** Icon identifier (platform-specific). */
  icon?: string;
  /** UI Components this screen is composed of; the host fills each from its `source.tool`. */
  components?: ScreenComponent[];
  /** Full-page bundle URL (alternative to composition). */
  bundleUrl?: string;
  /**
   * Props schema (JSON Schema) the host can pass to the screen's bundle.
   * Only meaningful when `bundleUrl` is set.
   */
  propsSchema?: Record<string, unknown>;
  /**
   * Marks this screen as an entry point (launcher).
   * When true, the host may surface this screen in its launcher / new-tab
   * picker so the user can open it directly. Screens without `launcher` are
   * only reachable via in-app navigation from other screens.
   * @default false
   */
  launcher?: boolean;
  /**
   * Optional visibility condition evaluated by the host before showing
   * the screen. Supports simple predicates prefixed with `!` for negation.
   * Examples: `'authenticated'`, `'!authenticated'`.
   * When omitted, the screen is always visible.
   */
  condition?: string;
}

// ---------------------------------------------------------------------------
// Context — tool handlers
// ---------------------------------------------------------------------------

/**
 * Secrets access via host requests (REQ-7).
 *
 * The SDK sends request messages over the session transport and awaits
 * the host's response. The app station proxies these without reading the
 * secret payloads.
 */
export interface SecretsAccess {
  /** Get system-level secrets (app-wide API keys, service accounts). */
  getSystem(): Promise<Record<string, string> | null>;
  /** Get installation secrets (OAuth tokens, per-user credentials). */
  getInstallation(): Promise<Record<string, string> | null>;
  /** Update installation secrets (after token refresh inside the app). */
  updateInstallation(secrets: Record<string, string>): Promise<void>;
}

/** Auth access via host requests. */
export interface AuthAccess {
  /** Get an OAuth authorization URL for the given provider. */
  getUrl(provider: string, scopes?: string[]): Promise<{ url: string; state: string }>;
  /** Check the current authentication status. */
  getStatus(): Promise<AuthStatusInfo>;
  /**
   * Refresh the access token using the host-stored refresh token.
   *
   * The host performs the token exchange and persists the new credentials,
   * so refresh logic lives in one place (no per-app client secrets, no races
   * between concurrent instances). Throws if the host cannot refresh.
   */
  refresh(): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }>;
}

/** Auth status information returned by `auth.getStatus()`. */
export interface AuthStatusInfo {
  authenticated: boolean;
  provider?: string;
  scopes?: string[];
  expiresAt?: string;
  authRequired?: boolean;
  authUrl?: string;
}

/**
 * Result of a successful OAuth authentication callback.
 */
export interface AuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Result of a successful secret request request.
 */
export interface SecretResult {
  value: string;
}

/**
 * User profile access via host requests (R11).
 *
 * Provides the authenticated user's profile. The host controls which
 * fields are returned based on the app's profile permission level:
 * - `profile.basic` → userId, displayName, locale, timezone
 * - `profile.full`  → all of basic + email, avatarUrl
 */
export interface UserProfileAccess {
  /**
   * Get the authenticated user's profile.
   *
   * @returns the user profile, or `null` if the host cannot resolve it.
   * @throws on permission denied or host error.
   */
  get(): Promise<UserProfile | null>;
}

/** A stored document: a JSON object. */
export type StorageDocument = Record<string, unknown>;

/** Options for {@link StorageCollection.query}. */
export interface StorageQueryOptions {
  /** Equality on top-level fields; every field must match. Omit for all documents. */
  filter?: Record<string, unknown>;
  /** Page size. The Host applies its default (100) and maximum (1000). */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string;
}

/** One page of {@link StorageCollection.query} results. */
export interface StorageQueryPage {
  documents: StorageDocument[];
  /** Present when more documents follow; pass it back as `cursor`. */
  nextCursor?: string;
}

/**
 * A named collection of documents in the Installation's Storage.
 *
 * Documents are JSON objects addressed by an id the app chooses. `put`
 * replaces, `update` merges top-level fields, `query` filters by equality
 * on top-level fields and pages with an opaque cursor.
 */
export interface StorageCollection {
  /** Store a document, replacing any document with the same id. */
  put(documentId: string, document: StorageDocument): Promise<void>;
  /** Read one document, or `null` when the id does not exist. */
  get(documentId: string): Promise<StorageDocument | null>;
  /** Query the collection; one page per call. */
  query(options?: StorageQueryOptions): Promise<StorageQueryPage>;
  /** Merge `patch` into an existing document. Returns the updated document, or `null` when not found. */
  update(documentId: string, patch: StorageDocument): Promise<StorageDocument | null>;
  /** Delete one document. Deleting a missing id succeeds. */
  delete(documentId: string): Promise<boolean>;
}

/**
 * Key-value sugar over the reserved collection `kv`: the key is the
 * document id and the value is stored as `{ key, value }`. `list` reads
 * every document of the collection and filters by prefix client-side, so it
 * costs a full scan; keep the `kv` collection small or use a real collection.
 */
export interface KeyValueStorage {
  /** Get a stored value by key. Returns `null` if not found. */
  get(key: string): Promise<unknown | null>;
  /** Set a value by key, replacing any previous value. */
  set(key: string, value: unknown): Promise<void>;
  /** Delete a value by key. */
  delete(key: string): Promise<boolean>;
  /** List stored keys, optionally filtered by a prefix. Full scan of `kv`. */
  list(prefix?: string): Promise<string[]>;
}

/**
 * Storage — the document store private to this Installation.
 *
 * The Host owns the backing store and scopes everything by installationId:
 * an app never sees another Installation's documents.
 *
 * @example
 * ```ts
 * const nodes = ctx.storage.collection('nodes');
 * await nodes.put('n42', { text: 'Buy milk', parentId: 'n1', done: false });
 * const { documents } = await nodes.query({ filter: { parentId: 'n1' } });
 * await nodes.update('n42', { done: true });
 * await ctx.storage.kv.set('installed', { at: Date.now() });
 * ```
 */
export interface DocumentStorage {
  /** The named collection; created on first write. */
  collection(name: string): StorageCollection;
  /** Key-value sugar over the reserved collection `kv`. */
  readonly kv: KeyValueStorage;
}

/**
 * Permissions access — read-only view of the app's effective permissions (R9 — 5.3).
 *
 * The effective set arrives as a snapshot at session open and is updated
 * live via `permissions_changed` events. Enforcement is always host-side;
 * this is informational so the app can degrade gracefully (e.g., grey out
 * unavailable features in a UI).
 */
export interface PermissionsAccess {
  /** Current effective permissions (approved permissions + restrictions). */
  effective(): EffectivePermissions | null;
  /** Register a listener for live permission changes. Returns an unsubscribe function. */
  onChange(listener: (permissions: EffectivePermissions) => void): () => void;
}

/** Handler for `permissions_changed` events (internal). */
export type PermissionsChangedHandler = (permissions: EffectivePermissions) => void;

/**
 * Context available to tool handlers.
 *
 * Provides access to the execution context (who called the tool), an
 * abort signal (triggered on cancel), secrets/auth via host requests,
 * and methods to emit events (log, progress, stream) to the host.
 */
export interface ToolContext {
  /**
   * The Host behind this session and what it declared it can do
   * (HOSTCAP-REQ-2); `undefined` until the Station has announced it.
   */
  readonly host: import('@agentapps/protocol').HostInfo | undefined;
  /** Execution context — who is calling (userId, workspaceId, etc.). */
  readonly execution: ExecutionContext;
  /** Abort signal — aborted when a `cancel` request arrives for this tool call. */
  readonly signal: AbortSignal;
  /** Secrets access via host requests. */
  readonly secrets: SecretsAccess;
  /** Read a single system secret by name. Returns `undefined` if not present. */
  systemSecret(name: string): Promise<string | undefined>;
  /** Read a single Installation secret by name. Returns `undefined` if not present. */
  installationSecret(name: string): Promise<string | undefined>;
  /** Auth access via host requests. */
  readonly auth: AuthAccess;
  /** User profile access via host requests (R11). */
  readonly user: UserProfileAccess;
  /** Permissions access — read-only view of the app's effective permissions (R9). */
  readonly permissions: PermissionsAccess;
  /** Storage — the Installation's document store. */
  readonly storage: DocumentStorage;
  /** Volume — the Workspace's shared file area, in API mode. */
  readonly volume: VolumeStorage;
  /** Objects — immutable blobs private to the Installation, each with a URL. */
  readonly objects: ObjectsAccess;
  /**
   * Call a tool on a bound app via an intent (R3).
   *
   * The host resolves the binding, opens a session to the target app,
   * calls the tool, and returns the result. Throws if the binding is
   * missing or the target tool fails.
   *
   * @param binding — local dependency name from the app's `requires` manifest.
   * @param tool — tool name within the bound target app.
   * @param args — tool arguments (optional).
   * @returns the target tool's result.
   */
  intent(binding: string, tool: string, args?: Record<string, unknown>): Promise<unknown>;
  /**
   * Subscribe to inbound events from a bound app or the host platform (R6 inbound).
   *
   * For binding events: `source = { kind: 'binding', binding: 'messenger' }`
   * For platform events: `source = { kind: 'platform', namespace: 'boards' }`
   *
   * The host resolves the source, sets up the subscription, and pushes
   * `inbound_event` messages to this session. Returns a subscription id
   * for later unsubscribe.
   */
  subscribeInbound(
    source: { kind: 'binding'; binding: string } | { kind: 'platform'; namespace: string },
    eventTypes: string[],
  ): Promise<string>;
  /**
   * Unsubscribe from a previously created inbound subscription.
   */
  unsubscribeInbound(subscriptionId: string): Promise<void>;
  /** Emit a log event to the host. */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void;
  /** Report progress for a long-running tool (0–100 or null for indeterminate). */
  progress(progress: number | null, status: string, eta?: number): void;
  /** Stream a text chunk to the host. */
  stream(chunk: string, done?: boolean): void;
  /**
   * Emit an app-specific event to all matching subscribers.
   */
  emit(event: string, payload: Record<string, unknown>): void;
  /**
   * Check whether there are active subscribers for a given event type.
   * Apps can use this to decide whether to start or stop expensive
   * resources (polling, WebSockets, background processes, etc.).
   */
  hasSubscribers(eventType: string): boolean;
  /**
   * List all event types that currently have active subscribers
   * (including wildcard '*' if any subscription covers all events).
   */
  activeSubscriptions(): string[];
  /**
   * Request OAuth authentication from the host.
   * The host will initiate an OAuth flow and return tokens when complete.
   */
  requestAuth(options: {
    provider: string;
    scopes?: string[];
    timeoutMs?: number;
  }): Promise<AuthResult>;
  /**
   * Request a secret value from the host (e.g., prompt the user).
   */
  requestSecret(options: {
    name: string;
    description?: string;
    timeoutMs?: number;
  }): Promise<SecretResult>;
  /**
   * Open a URL in the user's client.
   */
  openUrl(options: { url: string; title?: string }): Promise<void>;
}

/**
 * Context available to health check handlers.
 *
 * A subset of ToolContext: no execution context or abort signal (health
 * checks are synchronous probes), but secrets/auth are available so the
 * handler can verify credentials.
 */
export interface HealthContext {
  /**
   * The Host behind this session and what it declared it can do
   * (HOSTCAP-REQ-2); `undefined` until the Station has announced it.
   */
  readonly host: import('@agentapps/protocol').HostInfo | undefined;
  /** Secrets access via host requests. */
  readonly secrets: SecretsAccess;
  /** Auth access via host requests. */
  readonly auth: AuthAccess;
  /**
   * Storage access. Lets a health check verify that the host's persistence
   * layer is reachable (a common liveness probe).
   */
  readonly storage: DocumentStorage;
  /** Emit a log event to the host. */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}

// ---------------------------------------------------------------------------
// Inbound event handler (R6 inbound — 4.7, 4.8)
// ---------------------------------------------------------------------------

/** Payload delivered to an inbound event handler. */
export interface InboundEventPayload {
  /** Subscription id that matched this event. */
  subscriptionId: string;
  /** Source of the event. */
  source: { kind: 'binding'; binding: string } | { kind: 'platform'; namespace: string };
  /** Event type name. */
  eventType: string;
  /** Event data. */
  data: unknown;
}

/** Handler invoked when an inbound event is received. */
export type InboundEventHandler = (event: InboundEventPayload) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Conversation hooks: see hooks.ts (HOOK spec)
// ---------------------------------------------------------------------------

export type {
  ConversationAccess,
  ConversationPage,
  HookConfig,
  HookContext,
  HookHandler,
  RegisteredHook,
  ShapingHookResult,
} from './hooks.js';

// ---------------------------------------------------------------------------
// Lifecycle hooks (3.6)
// ---------------------------------------------------------------------------

/**
 * Context available to lifecycle hook handlers.
 *
 * Simpler than HookContext — no content or abort signal. Provides execution
 * context, secrets, auth, and logging for setup/teardown operations.
 */
export interface LifecycleContext {
  /**
   * The Host behind this session and what it declared it can do
   * (HOSTCAP-REQ-2); `undefined` until the Station has announced it.
   */
  readonly host: import('@agentapps/protocol').HostInfo | undefined;
  /** Which lifecycle event is being invoked. */
  readonly event: LifecycleEvent;
  /** Execution context — who is calling (userId, installationId, etc.). */
  readonly execution: ExecutionContext;
  /** Previous app version (only present for 'upgrade' events). */
  readonly previousVersion?: string;
  /** Secrets access via host requests. */
  readonly secrets: SecretsAccess;
  /** Auth access via host requests. */
  readonly auth: AuthAccess;
  /** Storage — the Installation's document store. */
  readonly storage: DocumentStorage;
  /** Volume — the Workspace's shared file area, in API mode. */
  readonly volume: VolumeStorage;
  /** Objects — immutable blobs private to the Installation, each with a URL. */
  readonly objects: ObjectsAccess;
  /** Emit a log event to the host. */
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}

/**
 * Lifecycle hook handler — receives lifecycle context, may throw on failure.
 *
 * Return void for success; throw an Error to signal failure (the error
 * message is sent back to the host as a lifecycle_response with success: false).
 */
export type LifecycleHandler = (context: LifecycleContext) => void | Promise<void>;

/** @internal Registered lifecycle handler stored by the app builder. */
export interface RegisteredLifecycleHandler {
  event: LifecycleEvent;
  handler: LifecycleHandler;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Result of a health check. */
export interface HealthResult {
  /** Overall status. */
  status: 'ready' | 'not_ready' | 'degraded';
  /** Human-readable message. */
  message?: string;
  /** Structured issues for UI display (auth required, token expired, etc.). */
  issues?: HealthIssue[];
}

/**
 * Health check handler.
 *
 * Called when the host sends a `health_check` request. The handler should
 * verify that external dependencies (API keys, OAuth tokens) are available
 * and return a status.
 */
export type HealthHandler = (context: HealthContext) => HealthResult | Promise<HealthResult>;

// ---------------------------------------------------------------------------
// Session lifecycle context (v2.0 — session open/close hooks)
// ---------------------------------------------------------------------------

/**
 * Context available to `onSessionOpen` and `onSessionClose` lifecycle hooks.
 *
 * Extends `LifecycleContext` with event emission capabilities, so the app
 * can emit events or check subscribers during session lifecycle.
 */
export interface SessionContext extends LifecycleContext {
  /** Emit an app-specific event to all matching subscribers. */
  emit(event: string, payload: Record<string, unknown>): void;
  /** Check whether there are active subscribers for a given event type. */
  hasSubscribers(eventType: string): boolean;
  /** List all event types that currently have active subscribers. */
  activeSubscriptions(): string[];
}

// ---------------------------------------------------------------------------
// Objects — immutable blobs private to the Installation
// ---------------------------------------------------------------------------

/** Options for {@link ObjectsAccess.put}. */
export interface ObjectPutOptions {
  /** MIME type of the content (required). */
  contentType: string;
  /** Suggested filename, kept as metadata. */
  filename?: string;
  /** `private` (default) or `public`. */
  visibility?: ObjectVisibility;
  /** Free-form string metadata. */
  metadata?: Record<string, string>;
}

/** An object's content together with its metadata. */
export interface ObjectContent extends ObjectInfo {
  data: Buffer;
}

/** A page of objects from {@link ObjectsAccess.list}. */
export interface ObjectPage {
  objects: ObjectInfo[];
  nextCursor?: string;
}

/**
 * Objects — upload immutable blobs and get URLs for them.
 *
 * Exposed as `ctx.objects`. Every method that takes an object accepts either
 * its id (`obj_…`) or the URL the platform returned for it.
 */
export interface ObjectsAccess {
  /** Upload a new object. Returns its metadata, including the URL. */
  put(data: Buffer | Uint8Array | string, options: ObjectPutOptions): Promise<ObjectInfo>;
  /** Read an object of the same Workspace. Returns `null` if it does not exist. */
  get(objectIdOrUrl: string): Promise<ObjectContent | null>;
  /** Delete one of the Installation's objects. Returns `true` if it existed. */
  delete(objectIdOrUrl: string): Promise<boolean>;
  /** List the Installation's objects, newest first. */
  list(options?: { limit?: number; cursor?: string }): Promise<ObjectPage>;
  /** Lend a private object to the outside through a signed link that expires. */
  link(
    objectIdOrUrl: string,
    options: { expiresIn: number },
  ): Promise<{ url: string; expiresAt: string }>;
}

// ---------------------------------------------------------------------------
// Volume storage — POSIX-style filesystem operations (v2.0 — REQ-8)
// ---------------------------------------------------------------------------

/**
 * Volume storage — POSIX-style filesystem operations against a mounted volume.
 *
 * Paths are relative to the volume root (no leading slash).
 * All operations are scoped by `installationId`.
 */
export interface VolumeStorage {
  /** List entries in a directory (VOL-REQ-3). */
  readDir(path: string): Promise<import('@agentapps/protocol').DirEntry[]>;
  /** Read a file as raw bytes. Returns `null` if the file doesn't exist (VOL-REQ-3). */
  readFile(path: string): Promise<Uint8Array | null>;
  /** Write bytes to a file. Creates parent directories as needed (VOL-REQ-3). */
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /** Delete a file or directory. For directories, set `recursive: true` (VOL-REQ-3). */
  delete(path: string, options?: { recursive?: boolean }): Promise<void>;
  /** Get detailed metadata for a file or directory. Returns `null` if not found (VOL-REQ-3). */
  stat(path: string): Promise<import('@agentapps/protocol').FileStat | null>;
  /** Create a directory and any missing parents (VOL-REQ-3). */
  mkdir(path: string): Promise<void>;
  /**
   * Volume in mount mode: the absolute path of the Workspace Volume when the
   * App declares `runtime.mountVolume` and holds the `volume` Permission;
   * `undefined` otherwise (VOL-REQ-5).
   */
  readonly mountPath: string | undefined;
  /**
   * Get a path for a temporary file within the volume.
   *
   * This is a pure path-construction helper — it does NOT create the file
   * or any directories. The path is scoped to the current session to avoid
   * collisions between concurrent tool calls.
   *
   * @param filename — name of the temp file (e.g. `output.json`).
   * @returns a path relative to the volume root (e.g. `tmp/{sessionId}/output.json`).
   */
  getTempPath(filename: string): string;
}
