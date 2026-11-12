/**
 * @agentapps/host — public type definitions.
 *
 * Types for platform integrators who consume agent apps via their app stations.
 */

import type {
  AppPermissions,
  EffectivePermissions,
  ObjectInfo,
  ObjectVisibility,
  ToolAnnotations,
  UserProfile,
} from '@agentapps/protocol';

// ---------------------------------------------------------------------------
// Host configuration
// ---------------------------------------------------------------------------

/** Host identity sent during the initialize handshake. */
export interface HostInfo {
  /** Host platform name (e.g. 'tada', 'my-agent-platform'). */
  name: string;
  /** Host version. */
  version: string;
}

// ---------------------------------------------------------------------------
// Initialize result
// ---------------------------------------------------------------------------

/** App info returned from the app station after initialization. */
export interface AppInfo {
  id: string;
  version: string;
}

/** AppStation info returned after initialization. */
export interface StationInfo {
  version: string;
}

/** Capabilities advertised by the app station. */
export interface StationCapabilities {
  directConnection: boolean;
  asyncOpen: boolean;
  push: boolean;
  extensions: string[];
}

/** Limits advertised by the app station. */
export interface ControllerLimits {
  openTimeoutMs: number;
  maxInflightPerSession: number;
}

/** Full result of a successful initialize handshake. */
export interface InitializeResult {
  negotiatedVersion: string;
  app: AppInfo;
  station: StationInfo;
  capabilities: StationCapabilities;
  limits: ControllerLimits;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/** Tenant identity for session_open. */
export interface Tenant {
  userId: string;
  workspaceId?: string;
}

/** Options for opening a session. */
export interface SessionOpenOptions {
  installationId: string;
  tenant: Tenant;
  /**
   * Effective permissions for this installation (R9 — 5.1).
   * When provided, the host automatically pushes a `permissions_changed`
   * event to the instance after session open (initial snapshot).
   */
  effectivePermissions?: EffectivePermissions;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** Tool definition as returned by list_tools. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

// ---------------------------------------------------------------------------
// Tool result
// ---------------------------------------------------------------------------

/** Result of a tool call. */
export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  duration: number;
  /** The app's Renderer output for this result, when one is bound to the tool. */
  renderer?: import('@agentapps/protocol').RendererOutput;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Health status of an instance. */
export interface HealthStatus {
  status: string;
  message?: string;
  issues?: Array<{
    code: string;
    message: string;
    severity: 'error' | 'warning';
    action?: { type: 'link' | 'oauth'; url: string; label: string };
  }>;
  uptime?: number;
  version?: string;
}

// ---------------------------------------------------------------------------
// AppStation health
// ---------------------------------------------------------------------------

/** Aggregated app station health status. */
export interface ControllerHealthStatus {
  status: 'ready' | 'degraded';
  counts: {
    total: number;
    ready: number;
    degraded: number;
    crashed: number;
    starting: number;
  };
  unhealthy: Array<{
    instanceId: string;
    installationId: string;
    status: string;
    uptime: number;
    lastUsed: string;
  }>;
  instances?: Array<{
    instanceId: string;
    installationId: string;
    status: string;
    uptime: number;
    lastUsed: string;
  }>;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/**
 * Request handler registry — the host provides these to answer
 * secret/auth requests from app instances.
 *
 * Each handler is optional. If absent, the host sends an error response
 * back to the instance.
 */
export interface RequestHandlers {
  /** Resolve system-level secrets for an app. */
  onGetSystemSecrets?: (
    sessionId: string,
    requestId: string,
  ) => Promise<Record<string, string> | null>;

  /** Resolve installation secrets for a session. */
  onGetInstallationSecrets?: (
    sessionId: string,
    requestId: string,
  ) => Promise<Record<string, string> | null>;

  /** Persist updated installation secrets. Return true on success. */
  onUpdateInstallationSecrets?: (
    sessionId: string,
    requestId: string,
    secrets: Record<string, string>,
  ) => Promise<boolean>;

  /** Generate an OAuth URL for the given provider/scopes. */
  onAuthUrl?: (
    sessionId: string,
    requestId: string,
    provider: string,
    scopes?: string[],
  ) => Promise<{ url: string; state: string }>;

  /** Resolve current auth status for a session. */
  onAuthStatus?: (
    sessionId: string,
    requestId: string,
  ) => Promise<{
    authenticated: boolean;
    provider?: string;
    scopes?: string[];
    expiresAt?: string;
    authRequired?: boolean;
    authUrl?: string;
  }>;

  /**
   * Exchange a stored refresh token for a new access token.
   *
   * The host performs the server-side OAuth token exchange, persists the
   * updated credentials, and returns the new tokens to the instance.
   */
  onRefreshToken?: (
    sessionId: string,
    requestId: string,
  ) => Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
  }>;

  /** Open a URL in the user's default client. */
  onOpenUrl?: (sessionId: string, requestId: string, url: string, title?: string) => Promise<void>;

  /** Request a secret value from the user interactively. */
  onRequestSecret?: (
    sessionId: string,
    requestId: string,
    name: string,
    description?: string,
  ) => Promise<string | null>;

  /**
   * Validate whether an app's declared permissions are approved for this installation.
   *
   * Called during session_open before the session is established. If the handler
   * returns a non-empty array of denied permissions, the session is rejected with
   * PERMISSION_DENIED. If absent, all permissions are assumed approved.
   */
  onValidatePermissions?: (
    installationId: string,
    permissions: AppPermissions,
  ) => Promise<{ denied: string[]; reason: string } | null>;

  /**
   * Resolve the authenticated user's profile for an app instance (R11).
   *
   * The host filters the returned fields based on the app's profile permission
   * level (basic vs. full). If absent, the instance receives `null`.
   */
  onGetUserProfile?: (sessionId: string, requestId: string) => Promise<UserProfile | null>;

  /**
   * Route an intent call to a bound target app (R3).
   *
   * The host resolves the binding, opens a session to the target app's
   * app station, calls the tool, and returns the result. If not provided,
   * intent calls fail with 'No intent handler'.
   */
  onIntentCall?: (
    sessionId: string,
    requestId: string,
    binding: string,
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<{
    success: boolean;
    result?: unknown;
    error?: { code: string; message: string; details?: unknown };
    duration: number;
  }>;

  /**
   * Handle an inbound event subscription request (R6 inbound).
   *
   * The host resolves the source (binding → target app, or platform namespace),
   * sets up the subscription, and returns a subscription id. The host is then
   * responsible for pushing `inbound_event` messages when matching events fire.
   */
  onInboundSubscribe?: (
    sessionId: string,
    requestId: string,
    source: Record<string, unknown>,
    eventTypes: string[],
  ) => Promise<{
    success: boolean;
    subscriptionId?: string;
    error?: { code: string; message: string };
  }>;

  /**
   * Answer an instance's `conversation_read` (HOOK-REQ-27); wire it to
   * `HookDispatcher.readConversation`. Without it the read is refused.
   */
  onConversationRead?: (
    sessionId: string,
    request: { conversationId: string; cursor?: string; limit?: number },
  ) => Promise<{
    turns: import('@agentapps/protocol').ConversationTurn[];
    nextCursor?: string;
    error?: { code: string; message: string };
  }>;

  /**
   * Handle an inbound event unsubscribe request.
   */
  onInboundUnsubscribe?: (
    sessionId: string,
    requestId: string,
    subscriptionId: string,
  ) => Promise<boolean>;

  // -------------------------------------------------------------------------
  // Storage — document store private to the Installation
  // (storage_put / storage_get / storage_query / storage_update / storage_delete)
  // -------------------------------------------------------------------------

  /** Store a document, replacing any document with the same id. Return `true` on success. */
  onStoragePut?: (
    sessionId: string,
    installationId: string,
    collection: string,
    documentId: string,
    document: Record<string, unknown>,
  ) => Promise<boolean>;

  /** Read one document, or `null` when the id does not exist. */
  onStorageGet?: (
    sessionId: string,
    installationId: string,
    collection: string,
    documentId: string,
  ) => Promise<Record<string, unknown> | null>;

  /**
   * Query a collection: equality on top-level fields, every field must match;
   * one page per call with an opaque cursor.
   */
  onStorageQuery?: (
    sessionId: string,
    installationId: string,
    collection: string,
    query: { filter?: Record<string, unknown>; limit?: number; cursor?: string },
  ) => Promise<{ documents: Record<string, unknown>[]; nextCursor?: string }>;

  /** Merge `patch` into an existing document. Return the updated document, or `null` when not found. */
  onStorageUpdate?: (
    sessionId: string,
    installationId: string,
    collection: string,
    documentId: string,
    patch: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;

  /** Delete one document. Deleting a missing id succeeds. */
  onStorageDelete?: (
    sessionId: string,
    installationId: string,
    collection: string,
    documentId: string,
  ) => Promise<boolean>;

  /**
   * Objects — immutable blobs private to an Installation (object_put).
   * Returns the stored object's metadata, URL included.
   */
  onObjectPut?: (
    sessionId: string,
    installationId: string,
    object: {
      data: Buffer;
      contentType: string;
      filename?: string;
      visibility: ObjectVisibility;
      metadata?: Record<string, string>;
    },
  ) => Promise<ObjectInfo>;

  /** Read an object of the same Workspace (object_get). `null` when it does not exist. */
  onObjectGet?: (
    sessionId: string,
    installationId: string,
    objectId: string,
  ) => Promise<(ObjectInfo & { data: Buffer }) | null>;

  /** Delete one of the Installation's objects (object_delete). `true` if it existed. */
  onObjectDelete?: (
    sessionId: string,
    installationId: string,
    objectId: string,
  ) => Promise<boolean>;

  /** List the Installation's objects, newest first (object_list). */
  onObjectList?: (
    sessionId: string,
    installationId: string,
    options: { limit?: number; cursor?: string },
  ) => Promise<{ objects: ObjectInfo[]; nextCursor?: string }>;

  /** Signed temporary link to a private object (object_link). `null` when it does not exist. */
  onObjectLink?: (
    sessionId: string,
    installationId: string,
    objectId: string,
    expiresIn: number,
  ) => Promise<{ url: string; expiresAt: string } | null>;

  /**
   * Volume request handler (file_volume_*).
   *
   * Receives the raw request message and returns the response message.
   * The host runtime delegates every `file_volume_*` request type to this
   * handler. If absent, those requests get an error response.
   *
   * Spec: Agent Apps Protocol v2.0 — REQ-8 (file system).
   */
  onFileRequest?: (
    sessionId: string,
    msg: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;

  /**
   * Check whether a tool call is permitted by the user's permission policy (R9 — 5.4).
   *
   * Called before every `tool_call` and `intent_call` dispatch.
   * Return `null` if allowed, or a `PermissionDeniedDetails` object to block.
   * If absent, all calls are allowed.
   */
  onCheckPermission?: (
    sessionId: string,
    installationId: string,
    action: {
      type: 'tool_call' | 'intent_call';
      name: string;
      args?: Record<string, unknown>;
    },
  ) => Promise<{
    layer: 'permission' | 'user-permission' | 'binding';
    permission?: string;
    reason: string;
  } | null>;
}

// ---------------------------------------------------------------------------
// Binding store (intents — R3, Phase 4)
// ---------------------------------------------------------------------------

/** Binding record: maps a consumer's named dependency to a target installation. */
export interface Binding {
  bindingName: string;
  targetInstallationId: string;
}

/**
 * Binding store interface — the host provides an implementation to persist
 * and resolve intent bindings. In-memory for dev/tests, database for production.
 */
export interface BindingStore {
  /** Resolve a binding. Returns the target installationId, or null if not bound. */
  resolve(consumerInstallationId: string, bindingName: string): string | null;

  /** Set a binding. */
  bind(consumerInstallationId: string, bindingName: string, targetInstallationId: string): void;

  /** Remove a binding. */
  unbind(consumerInstallationId: string, bindingName: string): void;

  /** List all bindings for a consumer. */
  listBindings(consumerInstallationId: string): Binding[];
}

/**
 * In-memory binding store — suitable for tests and local development.
 */
export class InMemoryBindingStore implements BindingStore {
  private readonly bindings = new Map<string, string>();

  private key(consumerInstallationId: string, bindingName: string): string {
    return `${consumerInstallationId}:${bindingName}`;
  }

  resolve(consumerInstallationId: string, bindingName: string): string | null {
    return this.bindings.get(this.key(consumerInstallationId, bindingName)) ?? null;
  }

  bind(consumerInstallationId: string, bindingName: string, targetInstallationId: string): void {
    this.bindings.set(this.key(consumerInstallationId, bindingName), targetInstallationId);
  }

  unbind(consumerInstallationId: string, bindingName: string): void {
    this.bindings.delete(this.key(consumerInstallationId, bindingName));
  }

  listBindings(consumerInstallationId: string): Binding[] {
    const prefix = `${consumerInstallationId}:`;
    const result: Binding[] = [];
    for (const [key, targetInstallationId] of this.bindings) {
      if (key.startsWith(prefix)) {
        result.push({
          bindingName: key.slice(prefix.length),
          targetInstallationId,
        });
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Hook result (one app's answer to a shaping hook, unvalidated)
// ---------------------------------------------------------------------------

/** What one app answered to a shaping hook; the dispatcher validates each part. */
export interface HookResult {
  context?: unknown[];
  veto?: unknown;
  message?: unknown;
}

// ---------------------------------------------------------------------------
// Lifecycle result (installation lifecycle hooks — 3.6)
// ---------------------------------------------------------------------------

/** Result of a lifecycle hook invocation. */
export interface LifecycleResult {
  /** Whether the lifecycle handler completed successfully. */
  success: boolean;
  /** Error message if !success. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

/** Listener for session status notifications from the app station. */
export type SessionStatusListener = (sessionId: string, status: string) => void;

/** Listener for events_gap notifications from the app station. */
export type EventsGapListener = (droppedCount: number, oldestDroppedAt: string) => void;
