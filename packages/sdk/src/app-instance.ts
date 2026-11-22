/**
 * @agentapps/sdk — app instance runtime.
 *
 * An AppInstance is created each time the app station spawns an instance
 * (i.e., each call to the factory returned by `app.toFactory()`). It
 * owns the message dispatch loop: handling protocol requests, routing
 * to tool handlers, managing cancellation, and proxying secret/auth
 * requests to the host.
 *
 * Not exported publicly — consumers use `createApp()`.
 */

import {
  ContextBlockSchema,
  createSessionEnvelope,
  type DirEntry,
  type EffectivePermissions,
  ErrorCode,
  type ExecutionContext,
  type FileStat,
  generateMessageId,
  type HookHost,
  HookMessageSchema,
  type HookPoint,
  HookVetoSchema,
  type HostInfo,
  MAX_CONTEXT_BLOCKS,
  type MessageBase,
  type RendererOutput,
  type Transport,
} from '@agentapps/protocol';
import type { ConversationAccess, ConversationPage, ShapingHookResult } from './hooks.js';
import type {
  AppConfig,
  AuthAccess,
  AuthStatusInfo,
  DocumentStorage,
  HealthContext,
  HealthHandler,
  HookContext,
  KeyValueStorage,
  LifecycleContext,
  ObjectContent,
  ObjectInfo,
  ObjectPage,
  ObjectPutOptions,
  ObjectsAccess,
  RegisteredEvent,
  RegisteredHook,
  RegisteredLifecycleHandler,
  RegisteredRenderer,
  RegisteredTool,
  SecretsAccess,
  SessionContext,
  StorageCollection,
  StorageDocument,
  StorageQueryOptions,
  StorageQueryPage,
  ToolContext,
  UserProfileAccess,
  VolumeStorage,
} from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hard ceiling for serialised tool results.
 *
 * Any tool result whose JSON representation exceeds this limit is truncated
 * before being sent back to the host. This is a safety net — individual tools
 * should implement their own pagination / streaming for large payloads rather
 * than relying on this fallback.
 *
 * When truncation occurs a warning is emitted so app developers notice and
 * add proper pagination to their tool.
 */
const MAX_TOOL_RESULT_CHARS = 50_000;

/**
 * Message types that are host→instance *requests* (not request responses).
 * These carry a `requestId` field but must NOT be intercepted by the legacy
 * request resolution path — they should fall through to the type-based
 * dispatcher instead. (C-1 code review fix)
 */
const REQUEST_TYPES = new Set([
  'tool_call',
  'hook_request',
  'hook_notify',
  'lifecycle_request',
  'list_tools',
  'health_check',
  'subscribe',
  'unsubscribe',
  'cancel',
  'shutdown',
]);

/**
 * Throw if a host request response carries an error. The host reports a failed
 * request as `prompt_result { success: false, error }`; a normal storage
 * response has no `error` field, and a plain `success: false` (e.g. deleting a
 * missing key) is a valid result, not an error — so we key off `error` alone.
 */
/**
 * Thrown when the Host behind the session declared it does not support the
 * feature a Request needs (HOSTCAP-REQ-3). Never retried.
 *
 * @spec HOSTCAP-REQ-3
 */
export class HostUnsupportedError extends Error {
  readonly code = 'NOT_SUPPORTED';
  constructor(
    readonly operation: string,
    message: string,
  ) {
    super(`${operation}: ${message}`);
    this.name = 'HostUnsupportedError';
  }
}

function throwOnRequestError(resp: Record<string, unknown>, operation: string): void {
  const err = resp.error;
  if (err === undefined || err === null) return;
  const message =
    typeof err === 'string' ? err : ((err as { message?: string }).message ?? String(err));
  throw new Error(`${operation} failed: ${message}`);
}

// ---------------------------------------------------------------------------
// Tool-result truncation helper
// ---------------------------------------------------------------------------

/**
 * Serialise a tool result and, if the JSON exceeds {@link MAX_TOOL_RESULT_CHARS},
 * truncate it with a human-readable notice so that:
 *  1. The host never receives an unbounded payload.
 *  2. App developers get a clear signal to add pagination.
 *
 * Returns the (possibly truncated) value ready to be embedded in the protocol
 * message.  When truncation occurs the original JSON is cut and a diagnostic
 * trailer is appended.
 */
function truncateToolResult(
  result: unknown,
  toolName: string,
  appId: string,
): { value: unknown; truncated: boolean } {
  let json: string;
  try {
    json = JSON.stringify(result);
  } catch {
    // Non-serialisable result — let the transport layer deal with it.
    return { value: result, truncated: false };
  }

  if (json.length <= MAX_TOOL_RESULT_CHARS) {
    return { value: result, truncated: false };
  }

  const originalLength = json.length;
  const notice =
    `\n\n[TRUNCATED BY SDK] Tool "${toolName}" (${appId}) returned ` +
    `${originalLength.toLocaleString()} chars, exceeding the ` +
    `${MAX_TOOL_RESULT_CHARS.toLocaleString()} char limit. ` +
    `Implement pagination or limit the result size in your tool handler.`;

  const truncated = json.slice(0, MAX_TOOL_RESULT_CHARS) + notice;

  // Return as a plain string so the host can display it directly.
  return { value: truncated, truncated: true };
}

// ---------------------------------------------------------------------------
// AppInstance
// ---------------------------------------------------------------------------

/**
 * Accept either an object id (`obj_…`) or the URL the platform returned for
 * it (`…/objects/<id>`), and return the id.
 */
export function resolveObjectId(objectIdOrUrl: string): string {
  if (!/^https?:\/\//.test(objectIdOrUrl)) return objectIdOrUrl;
  try {
    const parts = new URL(objectIdOrUrl).pathname.split('/').filter(Boolean);
    const i = parts.indexOf('objects');
    if (i >= 0 && parts[i + 1]) return parts[i + 1];
  } catch {
    // fall through
  }
  throw new Error(`Not an object id or object URL: ${objectIdOrUrl}`);
}

export class AppInstance {
  /** Pending host request responses, keyed by requestId. */
  private readonly pendingRequests = new Map<
    string,
    { resolve: (msg: Record<string, unknown>) => void; reject: (err: Error) => void }
  >();

  /** In-flight tool executions, keyed by request id. */
  private readonly inflight = new Map<string, AbortController>();
  /** Notify keys already acknowledged in this instance's lifetime (HOOK-REQ-8). */
  private readonly notifiedKeys = new Set<string>();

  /** Active event subscriptions, keyed by subscriptionId. */
  private readonly subscriptions = new Map<string, { eventTypes: string[]; sessionId: string }>();

  /** Inbound event handlers (for binding and platform events). */
  private readonly inboundEventHandlers = new Set<
    (event: {
      subscriptionId: string;
      source: Record<string, unknown>;
      eventType: string;
      data: unknown;
    }) => void
  >();

  /** Current effective permissions snapshot (R9 — 5.3). */
  private currentPermissions: EffectivePermissions | null = null;

  /** Listeners for permission changes. */
  private readonly permissionsListeners = new Set<(permissions: EffectivePermissions) => void>();

  /** Instance start time (for uptime reporting). */
  private readonly startTime = Date.now();

  /** The Host behind each session, from the Station's session_opened (HOSTCAP-REQ-2). */
  private readonly sessionHosts = new Map<string, HostInfo>();
  /** Sessions whose required installation secrets have been verified present. */
  private readonly verifiedUserSecretSessions = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly tools: ReadonlyMap<string, RegisteredTool>,
    private readonly events: ReadonlyMap<string, RegisteredEvent>,
    private readonly healthHandler: HealthHandler | null,
    private readonly transport: Transport,
    private readonly hooks: ReadonlyMap<string, RegisteredHook> = new Map(),
    private readonly lifecycleHandlers: ReadonlyMap<string, RegisteredLifecycleHandler> = new Map(),
    private readonly renderers: ReadonlyMap<string, RegisteredRenderer> = new Map(),
    /** Volume in mount mode, when the Station provided one (VOL-REQ-5). */
    private readonly volumeMountPath: string | undefined = undefined,
  ) {
    transport.onMessage((msg) => {
      this.dispatch(msg as Record<string, unknown>).catch(() => {
        // Errors are already reported to the host via protocol messages.
        // Swallowing here prevents transport-level crashes.
      });
    });
  }

  // =========================================================================
  // Message dispatch
  // =========================================================================

  /**
   * Inject a protocol message into the instance.
   *
   * Public entry point used by runtimes (HTTP, stdio, in-process) to deliver
   * messages from the app station/host. Prefer this over the legacy
   * `handleMessage` name, which is now private.
   */
  async dispatch(msg: Record<string, unknown>): Promise<void> {
    return this.handleMessage(msg);
  }

  /** Internal message router — kept private so runtimes use `dispatch`. */
  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    // 1. Check if this is a prompt_result (new unified request system).
    const promptId = msg.promptId as string | undefined;
    if (promptId && msg.type === 'prompt_result') {
      const pending = this.pendingRequests.get(promptId);
      if (pending) {
        this.pendingRequests.delete(promptId);
        pending.resolve(msg);
        return;
      }
    }

    // 2. Check if this is a legacy request response (host → instance).
    //    Legacy request responses carry a `requestId` that matches a pending request.
    //    Guard: only consider types that are actual request responses — never
    //    request types like 'hook_request' or 'tool_call' which also carry requestId.
    const responseRequestId = msg.requestId as string | undefined;
    if (responseRequestId && !REQUEST_TYPES.has(msg.type as string)) {
      const pending = this.pendingRequests.get(responseRequestId);
      if (pending) {
        this.pendingRequests.delete(responseRequestId);
        pending.resolve(msg);
        return;
      }
    }

    // 3. Dispatch by message type.
    switch (msg.type) {
      case 'list_tools':
        this.handleListTools(msg);
        return;
      case 'tool_call':
        await this.handleToolCall(msg);
        return;
      case 'health_check':
        await this.handleHealthCheck(msg);
        return;
      case 'shutdown':
        this.handleShutdown(msg);
        return;
      case 'cancel':
        this.handleCancel(msg);
        return;
      case 'subscribe':
        await this.handleSubscribe(msg);
        return;
      case 'unsubscribe':
        this.handleUnsubscribe(msg);
        return;
      case 'hook_request':
        await this.handleHookRequest(msg);
        return;
      case 'hook_notify':
        this.handleHookNotify(msg);
        return;
      case 'lifecycle_request':
        await this.handleLifecycleRequest(msg);
        return;
      case 'credentials_updated':
        // Re-verify required installation secrets on the next tool call.
        this.verifiedUserSecretSessions.clear();
        return;
      case 'inbound_event':
        this.handleInboundEvent(msg);
        return;
      case 'permissions_changed':
        this.handlePermissionsChanged(msg);
        return;
      case 'session_opened':
        await this.handleSessionOpened(msg);
        return;
      case 'session_closed':
        await this.handleSessionClosed(msg);
        return;
    }
  }

  // =========================================================================
  // Request handlers
  // =========================================================================

  /** Respond with the list of registered tools. */
  private handleListTools(msg: Record<string, unknown>): void {
    const tools = [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      ...(t.annotations ? { annotations: t.annotations } : {}),
    }));

    this.send({
      ...createSessionEnvelope('tools_list', msg.sessionId as string),
      id: msg.id as string,
      tools,
    });
  }

  /** Execute a tool and send back the result. */
  private async handleToolCall(msg: Record<string, unknown>): Promise<void> {
    const sessionId = msg.sessionId as string;
    const toolName = msg.tool as string;
    const args = (msg.arguments ?? {}) as Record<string, unknown>;
    const executionContext = msg.context as ExecutionContext;
    const requestId = msg.id as string;

    // Lookup tool
    const tool = this.tools.get(toolName);
    if (!tool) {
      this.send({
        ...createSessionEnvelope('tool_result', sessionId),
        id: requestId,
        success: false,
        error: { code: ErrorCode.TOOL_NOT_FOUND, message: `Tool '${toolName}' not found` },
        duration: 0,
      });
      return;
    }

    // Required installation secrets (fail fast, no fallback): api-key apps that declare
    // installationSecrets are unusable until the user configures them — reject every
    // tool call with a clear error instead of letting handlers fail obscurely.
    const missingSecrets = await this.missingRequiredUserSecrets(sessionId);
    if (missingSecrets.length > 0) {
      this.send({
        ...createSessionEnvelope('tool_result', sessionId),
        id: requestId,
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message:
            `Missing required Installation secret(s): ${missingSecrets.join(', ')}. ` +
            `Configure them for this installation before using ${this.config.id}.`,
        },
        duration: 0,
      });
      return;
    }

    // Set up cancellation
    const abortController = new AbortController();
    this.inflight.set(requestId, abortController);
    const start = Date.now();

    try {
      const context = this.createToolContext(
        requestId,
        sessionId,
        executionContext,
        abortController.signal,
      );
      const rawResult = await tool.handler(args, context);

      const { value: finalResult, truncated } = truncateToolResult(
        rawResult ?? null,
        toolName,
        this.config.id,
      );

      if (truncated) {
        console.warn(
          `[agentapps/sdk] Tool result truncated: "${toolName}" (${this.config.id}) ` +
            `exceeded ${MAX_TOOL_RESULT_CHARS.toLocaleString()} char limit.`,
        );
      }

      // Best-effort renderer dispatch: find renderers bound to this tool
      // and call their render handler. If it throws, we still return the
      // tool result without renderer output.
      let rendered: RendererOutput | undefined;
      for (const renderer of this.renderers.values()) {
        if (renderer.boundTools.includes(toolName) && renderer.render) {
          try {
            rendered = await renderer.render(rawResult, context);
            break; // first matching renderer wins
          } catch {
            // Swallow — best-effort, tool result is still valid
          }
        }
      }

      this.send({
        ...createSessionEnvelope('tool_result', sessionId),
        id: requestId,
        success: true,
        result: finalResult,
        ...(rendered ? { renderer: rendered } : {}),
        duration: Date.now() - start,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send({
        ...createSessionEnvelope('tool_result', sessionId),
        id: requestId,
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message },
        duration: Date.now() - start,
      });
    } finally {
      this.inflight.delete(requestId);
    }
  }

  /** Run the health check handler (or return default 'ready'). */
  private async handleHealthCheck(msg: Record<string, unknown>): Promise<void> {
    const sessionId = msg.sessionId as string;
    const base = {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: this.config.version,
    };

    if (!this.healthHandler) {
      this.send({
        ...createSessionEnvelope('health_status', sessionId),
        id: msg.id as string,
        status: 'ready',
        ...base,
      });
      return;
    }

    try {
      const context = this.createHealthContext(sessionId);
      const result = await this.healthHandler(context);

      this.send({
        ...createSessionEnvelope('health_status', sessionId),
        id: msg.id as string,
        status: result.status,
        message: result.message,
        issues: result.issues,
        ...base,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.send({
        ...createSessionEnvelope('health_status', sessionId),
        id: msg.id as string,
        status: 'degraded',
        message: `Health check failed: ${errorMessage}`,
        ...base,
      });
    }
  }

  /** Abort all in-flight work and acknowledge shutdown. */
  private handleShutdown(msg: Record<string, unknown>): void {
    const sessionId = msg.sessionId as string;

    // Fire onSessionClose hook before cleanup (best-effort, non-blocking).
    if (this.config.onSessionClose) {
      const ctx = this.createSessionContext(sessionId, 'session_close', {
        userId: '',
        installationId: '',
      });
      Promise.resolve(this.config.onSessionClose(ctx)).catch(() => {
        // Best-effort — shutdown proceeds regardless.
      });
    }

    // Abort all in-flight tool executions
    for (const ac of this.inflight.values()) {
      ac.abort(new Error('Instance shutting down'));
    }
    this.inflight.clear();

    // Reject pending requests
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new Error('Instance shutting down'));
    }
    this.pendingRequests.clear();

    // Clear subscriptions
    this.subscriptions.clear();

    this.send({
      ...createSessionEnvelope('shutdown_ack', msg.sessionId as string),
      id: msg.id as string,
    });
  }

  /** Cancel an in-flight tool call by request id. */
  private handleCancel(msg: Record<string, unknown>): void {
    const targetRequestId = msg.requestId as string;
    const sessionId = msg.sessionId as string;
    const ac = this.inflight.get(targetRequestId);

    if (ac) {
      ac.abort(new Error((msg.reason as string) ?? 'Cancelled'));
      this.inflight.delete(targetRequestId);
      this.send({
        ...createSessionEnvelope('cancel_result', sessionId),
        id: msg.id as string,
        requestId: targetRequestId,
        cancelled: true,
      });
    } else {
      this.send({
        ...createSessionEnvelope('cancel_result', sessionId),
        id: msg.id as string,
        requestId: targetRequestId,
        cancelled: false,
        reason: 'Request not found or already completed',
      });
    }
  }

  /** Handle subscribe request — validate event types and create subscription. */
  private async handleSubscribe(msg: Record<string, unknown>): Promise<void> {
    const sessionId = msg.sessionId as string;
    const eventTypes = (msg.eventTypes as string[]) ?? [];

    // Validate event types (wildcard '*' is always allowed)
    if (!eventTypes.includes('*')) {
      for (const eventType of eventTypes) {
        if (!this.events.has(eventType)) {
          this.send({
            ...createSessionEnvelope('subscribe_result', sessionId),
            id: msg.id as string,
            subscriptionId: '',
            success: false,
            error: `Event type '${eventType}' is not registered by this app`,
          });
          return;
        }
      }
    }

    const subscriptionId = generateMessageId();
    this.subscriptions.set(subscriptionId, { eventTypes, sessionId });

    this.send({
      ...createSessionEnvelope('subscribe_result', sessionId),
      id: msg.id as string,
      subscriptionId,
      success: true,
    });

    // Invoke the app-level lifecycle hook so apps can start polling or other
    // side-effect resources when a subscriber attaches.
    if (this.config.onSubscribe) {
      const ctx = this.createBackgroundContext(sessionId);
      try {
        await this.config.onSubscribe(ctx, eventTypes);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.send({
          ...createSessionEnvelope('log', sessionId),
          level: 'error',
          message: `onSubscribe hook failed: ${message}`,
        });
      }
    }
  }

  /** Handle unsubscribe request — remove subscription. */
  private handleUnsubscribe(msg: Record<string, unknown>): void {
    const sessionId = msg.sessionId as string;
    const subscriptionId = msg.subscriptionId as string;

    this.subscriptions.delete(subscriptionId);

    this.send({
      ...createSessionEnvelope('unsubscribe_result', sessionId),
      id: msg.id as string,
      subscriptionId,
      success: true,
    });
  }

  /**
   * Answer a shaping hook: validate what the handler returned, drop and log
   * the invalid parts, and answer empty when it throws.
   *
   * @spec HOOK-REQ-8
   */
  private async handleHookRequest(msg: Record<string, unknown>): Promise<void> {
    const sessionId = msg.sessionId as string;
    const requestId = msg.requestId as string;
    const hookPoint = msg.hookPoint as HookPoint;
    const reply = (fields: Record<string, unknown>) =>
      this.send({
        ...createSessionEnvelope('hook_response', sessionId),
        id: msg.id as string,
        requestId,
        ...fields,
      });

    const hook = this.hooks.get(hookPoint);
    if (!hook) {
      reply({});
      return;
    }

    const abortController = new AbortController();
    this.inflight.set(requestId, abortController);
    const log = this.hookLogger(sessionId);
    try {
      const context = this.createHookContext(sessionId, msg, abortController.signal);
      const result = (await hook.handler(context, context)) as ShapingHookResult | undefined;
      if (abortController.signal.aborted) return;
      reply(validateShapingResult(hookPoint, hook.transform === true, result, log));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      reply({});
      log('error', `Hook handler '${hookPoint}' threw: ${message}`);
    } finally {
      this.inflight.delete(requestId);
    }
  }

  /**
   * Accept a notify hook: acknowledge as soon as the handler is scheduled,
   * and drop a `post-turn` or `on-dream` whose key was already acknowledged.
   *
   * @spec HOOK-REQ-8
   */
  private handleHookNotify(msg: Record<string, unknown>): void {
    const sessionId = msg.sessionId as string;
    const hookPoint = msg.hookPoint as HookPoint;
    const key = msg.key as string | undefined;
    const ack = () =>
      this.send({
        ...createSessionEnvelope('hook_ack', sessionId),
        // Echo the notification's id so the Host matches the acknowledgement.
        id: msg.id as string,
        notifyId: msg.notifyId as string,
      });

    const hook = this.hooks.get(hookPoint);
    const deduplicated = hookPoint === 'post-turn' || hookPoint === 'on-dream';
    const dedupeKey = `${hookPoint}|${key ?? ''}`;
    if (!hook || (deduplicated && key !== undefined && this.notifiedKeys.has(dedupeKey))) {
      ack();
      return;
    }
    if (deduplicated && key !== undefined) this.notifiedKeys.add(dedupeKey);

    const log = this.hookLogger(sessionId);
    const context = this.createHookContext(sessionId, msg, new AbortController().signal);
    ack();
    void Promise.resolve()
      .then(() => hook.handler(context, context))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log('error', `Hook handler '${hookPoint}' threw: ${message}`);
      });
  }

  private hookLogger(sessionId: string) {
    return (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) =>
      this.send({
        ...createSessionEnvelope('log', sessionId),
        level,
        message,
        ...(data !== undefined ? { data } : {}),
      });
  }

  /** Handle an installation lifecycle request (3.6). */
  private async handleLifecycleRequest(msg: Record<string, unknown>): Promise<void> {
    const sessionId = msg.sessionId as string;
    const event = msg.event as string;
    const executionContext = msg.context as ExecutionContext;
    const previousVersion = msg.previousVersion as string | undefined;

    // Look up the lifecycle handler for this event
    const registration = this.lifecycleHandlers.get(event);
    if (!registration) {
      // No handler registered — send success (no-op is valid)
      this.send({
        ...createSessionEnvelope('lifecycle_response', sessionId),
        id: msg.id as string,
        success: true,
      });
      return;
    }

    try {
      const context = this.createLifecycleContext(
        sessionId,
        event,
        executionContext,
        previousVersion,
      );
      await registration.handler(context);

      this.send({
        ...createSessionEnvelope('lifecycle_response', sessionId),
        id: msg.id as string,
        success: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send({
        ...createSessionEnvelope('lifecycle_response', sessionId),
        id: msg.id as string,
        success: false,
        error: message,
      });
      this.send({
        ...createSessionEnvelope('log', sessionId),
        level: 'error',
        message: `Lifecycle handler '${event}' threw: ${message}`,
      });
    }
  }

  // =========================================================================
  // Session lifecycle hooks — session_opened / session_closed
  // =========================================================================

  /** Handle session_opened notification — invoke onSessionOpen hook. */
  private async handleSessionOpened(msg: Record<string, unknown>): Promise<void> {
    if (msg.host && typeof msg.sessionId === 'string') {
      this.sessionHosts.set(msg.sessionId, msg.host as HostInfo);
    }
    if (!this.config.onSessionOpen) return;

    const sessionId = msg.sessionId as string;
    const installationId = (msg.installationId as string) ?? '';
    const tenant = (msg.tenant as { userId: string; workspaceId?: string }) ?? { userId: '' };

    try {
      const ctx = this.createSessionContext(sessionId, 'session_open', {
        userId: tenant.userId,
        workspaceId: tenant.workspaceId,
        installationId,
      });
      await this.config.onSessionOpen(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send({
        ...createSessionEnvelope('log', sessionId),
        level: 'error',
        message: `onSessionOpen hook failed: ${message}`,
      });
    }
  }

  /** Handle session_closed notification — invoke onSessionClose hook. */
  private async handleSessionClosed(msg: Record<string, unknown>): Promise<void> {
    if (!this.config.onSessionClose) return;

    const sessionId = msg.sessionId as string;

    try {
      const ctx = this.createSessionContext(sessionId, 'session_close', {
        userId: '',
        installationId: '',
      });
      await this.config.onSessionClose(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.send({
        ...createSessionEnvelope('log', sessionId),
        level: 'error',
        message: `onSessionClose hook failed: ${message}`,
      });
    }
  }

  // =========================================================================
  // Inbound event handling (R6 inbound — 4.7, 4.8)
  // =========================================================================

  /**
   * Register a handler for inbound events (binding or platform).
   * Called by the runtime when the app registers an inbound event handler.
   */
  onInboundEvent(
    handler: (event: {
      subscriptionId: string;
      source: Record<string, unknown>;
      eventType: string;
      data: unknown;
    }) => void,
  ): () => void {
    this.inboundEventHandlers.add(handler);
    return () => this.inboundEventHandlers.delete(handler);
  }

  /** Dispatch an inbound_event message to registered handlers. */
  private handleInboundEvent(msg: Record<string, unknown>): void {
    const event = {
      subscriptionId: msg.subscriptionId as string,
      source: msg.source as Record<string, unknown>,
      eventType: msg.eventType as string,
      data: msg.data,
    };
    for (const handler of this.inboundEventHandlers) {
      try {
        handler(event);
      } catch (err) {
        const sessionId = msg.sessionId as string;
        this.send({
          ...createSessionEnvelope('log', sessionId),
          level: 'error',
          message: `Inbound event handler threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  /** Handle a permissions_changed host-pushed event (R9 — 5.3). */
  private handlePermissionsChanged(msg: Record<string, unknown>): void {
    const permissions = msg.permissions as EffectivePermissions;
    this.currentPermissions = permissions;
    for (const listener of this.permissionsListeners) {
      try {
        listener(permissions);
      } catch (err) {
        const sessionId = msg.sessionId as string;
        this.send({
          ...createSessionEnvelope('log', sessionId),
          level: 'error',
          message: `Permissions change listener threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  /**
   * Create a ToolContext for work that runs outside a tool call, such as the
   * `onSubscribe` handler. There is no requestId, no execution context and no
   * abort signal; the context exposes the same emit/hasSubscribers/log/secrets
   * surface so background work can interact with the host and subscribers.
   */
  createBackgroundContext(sessionId: string): ToolContext {
    return this.createToolContext(
      generateMessageId(),
      sessionId,
      { userId: '', installationId: '' },
      new AbortController().signal,
    );
  }

  // =========================================================================
  // Context factories
  // =========================================================================

  private createToolContext(
    requestId: string,
    sessionId: string,
    execution: ExecutionContext,
    signal: AbortSignal,
  ): ToolContext {
    const emit = (event: string, payload: Record<string, unknown>): void => {
      for (const [subscriptionId, sub] of this.subscriptions.entries()) {
        if (sub.sessionId !== sessionId) continue;
        if (sub.eventTypes.includes('*') || sub.eventTypes.includes(event)) {
          this.send({
            ...createSessionEnvelope('event', sessionId),
            subscriptionId,
            eventType: event,
            payload,
          });
        }
      }
    };

    const secretsAccess = this.createSecretsAccess(sessionId);

    const sessionHosts = this.sessionHosts;
    return {
      // HOSTCAP-REQ-2: read at use time, so a context built before the
      // Station's session_opened arrived still sees the Host.
      get host() {
        return sessionHosts.get(sessionId);
      },
      execution,
      signal,
      secrets: secretsAccess,
      auth: this.createAuthAccess(sessionId),
      user: this.createUserProfileAccess(sessionId),
      storage: this.createStorage(sessionId),
      volume: this.createVolumeStorage(sessionId),
      objects: this.createObjectsAccess(sessionId),
      permissions: {
        effective: () => this.currentPermissions,
        onChange: (listener) => {
          this.permissionsListeners.add(listener);
          return () => this.permissionsListeners.delete(listener);
        },
      },
      intent: async (
        binding: string,
        tool: string,
        args: Record<string, unknown> = {},
      ): Promise<unknown> => {
        const cbRequestId = generateMessageId();
        const resp = await this.doRequest({
          ...createSessionEnvelope('intent_call', sessionId),
          requestId: cbRequestId,
          binding,
          tool,
          arguments: args,
        });
        if (resp.error) {
          const err = resp.error as { code?: string; message?: string; details?: unknown } | string;
          if (typeof err === 'string') throw new Error(err);
          const message = err.message ?? 'Intent call failed';
          const error = new Error(message);
          if (err.code) (error as Error & { code?: string }).code = err.code;
          if (err.details) (error as Error & { details?: unknown }).details = err.details;
          throw error;
        }
        if (resp.success === false) {
          throw new Error('Intent call failed');
        }
        return resp.result;
      },
      subscribeInbound: async (
        source: { kind: 'binding'; binding: string } | { kind: 'platform'; namespace: string },
        eventTypes: string[],
      ): Promise<string> => {
        const cbRequestId = generateMessageId();
        const resp = await this.doRequest({
          ...createSessionEnvelope('inbound_subscribe', sessionId),
          requestId: cbRequestId,
          source,
          eventTypes,
        });
        if (!resp.success) {
          const err = resp.error as { code?: string; message?: string } | string | undefined;
          const message =
            typeof err === 'string' ? err : (err?.message ?? 'Inbound subscribe failed');
          throw new Error(message);
        }
        return resp.subscriptionId as string;
      },
      unsubscribeInbound: async (subscriptionId: string): Promise<void> => {
        const cbRequestId = generateMessageId();
        const resp = await this.doRequest({
          ...createSessionEnvelope('inbound_unsubscribe', sessionId),
          requestId: cbRequestId,
          subscriptionId,
        });
        if (!resp.success) {
          throw new Error('Inbound unsubscribe failed');
        }
      },
      log: (level, message, data?) => {
        this.send({
          ...createSessionEnvelope('log', sessionId),
          level,
          message,
          ...(data !== undefined ? { data } : {}),
        });
      },
      progress: (progress, status, eta?) => {
        this.send({
          ...createSessionEnvelope('tool_progress', sessionId),
          requestId,
          progress,
          status,
          ...(eta !== undefined ? { eta } : {}),
        });
      },
      stream: (chunk, done = false) => {
        this.send({
          ...createSessionEnvelope('tool_stream', sessionId),
          requestId,
          chunk,
          done,
        });
      },
      emit,
      systemSecret: async (name: string): Promise<string | undefined> => {
        const all = await secretsAccess.getSystem();
        return all?.[name];
      },
      installationSecret: async (name: string): Promise<string | undefined> => {
        const all = await secretsAccess.getInstallation();
        return all?.[name];
      },
      hasSubscribers: (eventType: string): boolean => {
        for (const sub of this.subscriptions.values()) {
          if (sub.sessionId !== sessionId) continue;
          if (sub.eventTypes.includes('*') || sub.eventTypes.includes(eventType)) {
            return true;
          }
        }
        return false;
      },
      activeSubscriptions: (): string[] => {
        const types = new Set<string>();
        for (const sub of this.subscriptions.values()) {
          if (sub.sessionId !== sessionId) continue;
          for (const t of sub.eventTypes) types.add(t);
        }
        return [...types];
      },
      requestAuth: async (options) => {
        const authConfig = this.config.auth;
        // Explicitly disabled or non-OAuth auth types reject the OAuth callback.
        // When auth is not declared at all, requestAuth still works as a generic
        // host callback so ad-hoc OAuth flows (e.g., dynamic providers) keep working.
        if (authConfig === false || authConfig?.type === 'none' || authConfig?.type === 'api-key') {
          throw new Error('OAuth2 authentication is not configured for this app');
        }
        if (authConfig?.type === 'oauth2' && options.provider !== authConfig.provider) {
          throw new Error(
            `OAuth provider mismatch: configured '${authConfig.provider}', requested '${options.provider}'`,
          );
        }

        const promptId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('prompt', sessionId),
            promptId,
            promptType: 'auth',
            provider: options.provider,
            ...(options.scopes ? { scopes: options.scopes } : {}),
            ...(authConfig?.type === 'oauth2' && authConfig.scopeSeparator !== undefined
              ? { scopeSeparator: authConfig.scopeSeparator }
              : {}),
            ...(authConfig?.type === 'oauth2' && authConfig.pkce !== undefined
              ? { pkce: authConfig.pkce }
              : {}),
            timeoutMs: options.timeoutMs ?? 300_000,
          },
          options.timeoutMs ?? 300_000,
        );
        if (!resp.success) {
          throw new Error(
            (resp.error as string) ??
              (resp.cancelled ? 'Authentication cancelled' : 'Authentication failed'),
          );
        }
        return {
          accessToken: resp.accessToken as string,
          refreshToken: resp.refreshToken as string | undefined,
          expiresAt: resp.expiresAt ? new Date(resp.expiresAt as string) : undefined,
        };
      },
      requestSecret: async (options) => {
        const promptId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('prompt', sessionId),
            promptId,
            promptType: 'secret',
            secretName: options.name,
            ...(options.description ? { description: options.description } : {}),
            timeoutMs: options.timeoutMs ?? 300_000,
          },
          options.timeoutMs ?? 300_000,
        );
        if (!resp.success) {
          throw new Error(
            (resp.error as string) ??
              (resp.cancelled ? 'Secret request cancelled' : 'Secret request failed'),
          );
        }
        return { value: resp.secretValue as string };
      },
      openUrl: async (options) => {
        const promptId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('prompt', sessionId),
            promptId,
            promptType: 'url',
            url: options.url,
            ...(options.title ? { title: options.title } : {}),
            timeoutMs: 10_000,
          },
          10_000,
        );
        if (!resp.success) {
          throw new Error(
            (resp.error as string) ??
              (resp.cancelled ? 'URL open cancelled' : 'Failed to open URL'),
          );
        }
      },
    };
  }

  private createHealthContext(sessionId: string): HealthContext {
    const sessionHosts = this.sessionHosts;
    return {
      // HOSTCAP-REQ-2: read at use time, so a context built before the
      // Station's session_opened arrived still sees the Host.
      get host() {
        return sessionHosts.get(sessionId);
      },
      secrets: this.createSecretsAccess(sessionId),
      auth: this.createAuthAccess(sessionId),
      storage: this.createStorage(sessionId),
      log: (level, message, data?) => {
        this.send({
          ...createSessionEnvelope('log', sessionId),
          level,
          message,
          ...(data !== undefined ? { data } : {}),
        });
      },
    };
  }

  private createHookContext(
    sessionId: string,
    msg: Record<string, unknown>,
    signal: AbortSignal,
  ): HookContext {
    const sessionHosts = this.sessionHosts;
    return {
      input: msg.input as HookContext['input'],
      hookHost: msg.host as HookHost,
      // HOSTCAP-REQ-2: read at use time, so a context built before the
      // Station's session_opened arrived still sees the Host.
      get host() {
        return sessionHosts.get(sessionId);
      },
      execution: msg.context as ExecutionContext,
      signal,
      secrets: this.createSecretsAccess(sessionId),
      auth: this.createAuthAccess(sessionId),
      conversation: this.createConversationAccess(sessionId),
      log: this.hookLogger(sessionId),
    };
  }

  /**
   * `ctx.conversation`: paged reads of a notified conversation.
   *
   * @spec HOOK-REQ-27
   */
  private createConversationAccess(sessionId: string): ConversationAccess {
    const readPage = async (
      conversationId: string,
      options?: { cursor?: string; limit?: number },
    ): Promise<ConversationPage> => {
      const resp = await this.doRequest({
        ...createSessionEnvelope('conversation_read', sessionId),
        requestId: generateMessageId(),
        conversationId,
        ...(options?.cursor !== undefined ? { cursor: options.cursor } : {}),
        ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      });
      const error = resp.error as { code?: string; message?: string } | undefined;
      if (error) throw new Error(`${error.code ?? 'ERROR'}: ${error.message ?? 'read failed'}`);
      return {
        turns: (resp.turns as ConversationPage['turns']) ?? [],
        ...(typeof resp.nextCursor === 'string' ? { nextCursor: resp.nextCursor } : {}),
      };
    };
    return {
      readPage,
      read(conversationId, options) {
        return {
          async *[Symbol.asyncIterator]() {
            let cursor: string | undefined;
            do {
              const page = await readPage(conversationId, { cursor, limit: options?.limit });
              yield* page.turns;
              cursor = page.nextCursor;
            } while (cursor !== undefined);
          },
        };
      },
    };
  }

  private createLifecycleContext(
    sessionId: string,
    event: string,
    execution: ExecutionContext,
    previousVersion?: string,
  ): LifecycleContext {
    const sessionHosts = this.sessionHosts;
    return {
      // HOSTCAP-REQ-2: read at use time, so a context built before the
      // Station's session_opened arrived still sees the Host.
      get host() {
        return sessionHosts.get(sessionId);
      },
      event: event as import('@agentapps/protocol').LifecycleEvent,
      execution,
      ...(previousVersion !== undefined ? { previousVersion } : {}),
      secrets: this.createSecretsAccess(sessionId),
      auth: this.createAuthAccess(sessionId),
      storage: this.createStorage(sessionId),
      volume: this.createVolumeStorage(sessionId),
      objects: this.createObjectsAccess(sessionId),
      log: (level, message, data?) => {
        this.send({
          ...createSessionEnvelope('log', sessionId),
          level,
          message,
          ...(data !== undefined ? { data } : {}),
        });
      },
    };
  }

  /**
   * Create a SessionContext for session open/close hooks.
   *
   * Extends LifecycleContext with event emission capabilities.
   */
  private createSessionContext(
    sessionId: string,
    event: string,
    execution: ExecutionContext,
  ): SessionContext {
    const base = this.createLifecycleContext(sessionId, event, execution);
    const emit = (eventName: string, payload: Record<string, unknown>): void => {
      for (const [, sub] of this.subscriptions.entries()) {
        if (sub.sessionId !== sessionId) continue;
        if (sub.eventTypes.includes('*') || sub.eventTypes.includes(eventName)) {
          this.send({
            ...createSessionEnvelope('event', sessionId),
            subscriptionId: sub.eventTypes.includes('*') ? '*' : eventName,
            eventType: eventName,
            payload,
          });
        }
      }
    };

    return {
      ...base,
      emit,
      hasSubscribers: (eventType: string): boolean => {
        for (const sub of this.subscriptions.values()) {
          if (sub.sessionId !== sessionId) continue;
          if (sub.eventTypes.includes('*') || sub.eventTypes.includes(eventType)) {
            return true;
          }
        }
        return false;
      },
      activeSubscriptions: (): string[] => {
        const types = new Set<string>();
        for (const sub of this.subscriptions.values()) {
          if (sub.sessionId !== sessionId) continue;
          for (const t of sub.eventTypes) types.add(t);
        }
        return [...types];
      },
    };
  }

  // =========================================================================
  // Secrets & auth access
  // =========================================================================

  /**
   * Return the declared-but-unconfigured installation secrets for a session.
   *
   * Applies only to `api-key` auth: those installation secrets can come exclusively
   * from user configuration, so without them the app cannot work at all.
   * OAuth-style auth types obtain their installation secrets through the auth flow
   * and are enforced there instead. Verified sessions are cached; the cache
   * is cleared on `credentials_updated` so newly configured secrets apply
   * without reopening the session.
   */
  private async missingRequiredUserSecrets(sessionId: string): Promise<string[]> {
    const auth = this.config.auth;
    if (!auth || typeof auth !== 'object' || auth.type !== 'api-key') return [];
    const required = auth.installationSecrets ?? [];
    if (required.length === 0) return [];
    if (this.verifiedUserSecretSessions.has(sessionId)) return [];

    const secrets = await this.createSecretsAccess(sessionId).getInstallation();
    const missing = required.filter((name) => !secrets?.[name]);
    if (missing.length === 0) {
      this.verifiedUserSecretSessions.add(sessionId);
    }
    return missing;
  }

  private createSecretsAccess(sessionId: string): SecretsAccess {
    return {
      getSystem: async () => {
        const requestId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('get_system_secrets', sessionId),
            requestId,
          },
          30_000,
        );
        if (resp.error) throw new Error(resp.error as string);
        return (resp.secrets as Record<string, string>) ?? null;
      },
      getInstallation: async () => {
        const requestId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('get_installation_secrets', sessionId),
            requestId,
          },
          30_000,
        );
        if (resp.error) throw new Error(resp.error as string);
        return (resp.secrets as Record<string, string>) ?? null;
      },
      updateInstallation: async (secrets: Record<string, string>) => {
        const requestId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('update_installation_secrets', sessionId),
            requestId,
            secrets,
          },
          30_000,
        );
        if (resp.error) throw new Error(resp.error as string);
        if (!(resp.success as boolean)) throw new Error('Failed to update installation secrets');
      },
    };
  }

  private createAuthAccess(sessionId: string): AuthAccess {
    return {
      getUrl: async (provider: string, scopes?: string[]) => {
        const requestId = generateMessageId();
        const resp = await this.doRequest({
          ...createSessionEnvelope('auth_url', sessionId),
          requestId,
          provider,
          ...(scopes ? { scopes } : {}),
        });
        return { url: resp.url as string, state: resp.state as string };
      },
      getStatus: async (): Promise<AuthStatusInfo> => {
        const requestId = generateMessageId();
        const resp = await this.doRequest({
          ...createSessionEnvelope('auth_status', sessionId),
          requestId,
        });
        return {
          authenticated: resp.authenticated as boolean,
          provider: resp.provider as string | undefined,
          scopes: resp.scopes as string[] | undefined,
          expiresAt: resp.expiresAt as string | undefined,
          authRequired: resp.authRequired as boolean | undefined,
          authUrl: resp.authUrl as string | undefined,
        };
      },
      refresh: async () => {
        const requestId = generateMessageId();
        const resp = await this.doRequest({
          ...createSessionEnvelope('refresh_token', sessionId),
          requestId,
        });
        if (resp.error) throw new Error(resp.error as string);
        const accessToken = resp.accessToken as string | undefined;
        if (!accessToken) throw new Error('Token refresh returned no access token');
        return {
          accessToken,
          refreshToken: resp.refreshToken as string | undefined,
          expiresAt: resp.expiresAt as string | undefined,
        };
      },
    };
  }

  // =========================================================================
  // User profile (R11)
  // =========================================================================

  private createUserProfileAccess(sessionId: string): UserProfileAccess {
    return {
      get: async () => {
        const requestId = generateMessageId();
        const resp = await this.doRequest({
          ...createSessionEnvelope('get_user_profile', sessionId),
          requestId,
        });
        if (resp.error) throw new Error(resp.error as string);
        return (resp.profile as import('@agentapps/protocol').UserProfile) ?? null;
      },
    };
  }

  // =========================================================================
  // Storage — document store private to the Installation
  // =========================================================================

  private createStorage(sessionId: string): DocumentStorage {
    const request = async (
      type: string,
      fields: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      const resp = await this.doRequest(
        { ...createSessionEnvelope(type, sessionId), requestId: generateMessageId(), ...fields },
        60_000,
      );
      return resp;
    };

    const collection = (name: string): StorageCollection => ({
      put: async (documentId, document) => {
        const resp = await request('storage_put', { collection: name, documentId, document });
        throwOnRequestError(resp, 'storage_put');
        if (resp.success === false) throw new Error('storage_put failed');
      },
      get: async (documentId) => {
        const resp = await request('storage_get', { collection: name, documentId });
        throwOnRequestError(resp, 'storage_get');
        return (resp.document as StorageDocument | null | undefined) ?? null;
      },
      query: async (options: StorageQueryOptions = {}): Promise<StorageQueryPage> => {
        const resp = await request('storage_query', {
          collection: name,
          ...(options.filter !== undefined ? { filter: options.filter } : {}),
          ...(options.limit !== undefined ? { limit: options.limit } : {}),
          ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
        });
        throwOnRequestError(resp, 'storage_query');
        return {
          documents: (resp.documents as StorageDocument[] | undefined) ?? [],
          ...(typeof resp.nextCursor === 'string' ? { nextCursor: resp.nextCursor } : {}),
        };
      },
      update: async (documentId, patch) => {
        const resp = await request('storage_update', { collection: name, documentId, patch });
        const document = (resp.document as StorageDocument | null | undefined) ?? null;
        if (document) return document;
        // A missing document is a normal outcome, not a failure. Hosts report it
        // as success:false with a null document (Teros adds "Document not found").
        if (resp.error === undefined || /not found/i.test(String(resp.error))) return null;
        throwOnRequestError(resp, 'storage_update');
        return null;
      },
      delete: async (documentId) => {
        const resp = await request('storage_delete', { collection: name, documentId });
        throwOnRequestError(resp, 'storage_delete');
        return resp.success !== false;
      },
    });

    const kv = collection('kv');
    const keyValue: KeyValueStorage = {
      get: async (key) => {
        const doc = await kv.get(key);
        return doc ? (doc.value ?? null) : null;
      },
      set: async (key, value) => {
        await kv.put(key, { key, value });
      },
      delete: async (key) => kv.delete(key),
      list: async (prefix) => {
        // Full scan: `kv` is read page by page and filtered client-side.
        const keys: string[] = [];
        let cursor: string | undefined;
        do {
          const page = await kv.query({ limit: 1000, ...(cursor ? { cursor } : {}) });
          for (const doc of page.documents) {
            const key = doc.key;
            if (typeof key === 'string' && (!prefix || key.startsWith(prefix))) keys.push(key);
          }
          cursor = page.nextCursor;
        } while (cursor);
        return keys.sort();
      },
    };

    return { collection, kv: keyValue };
  }

  // =========================================================================
  // Volume storage — POSIX-style filesystem operations (v2.0 protocol)
  // =========================================================================

  /** Volume in API mode (VOL-REQ-3) plus the mount path (VOL-REQ-5). */
  private createVolumeStorage(sessionId: string): VolumeStorage {
    const call = async (
      type: string,
      fields: Record<string, unknown>,
    ): Promise<Record<string, unknown>> =>
      this.doRequest(
        {
          ...createSessionEnvelope(type, sessionId),
          requestId: generateMessageId(),
          ...fields,
        },
        60_000,
      );
    const notFound = (resp: Record<string, unknown>) => resp.code === 'FILE_NOT_FOUND';
    return {
      mountPath: this.volumeMountPath,
      readDir: async (path: string): Promise<DirEntry[]> => {
        const resp = await call('file_volume_read_dir', { path });
        throwOnRequestError(resp, 'volume.readDir');
        return (resp.entries as DirEntry[]) ?? [];
      },
      readFile: async (path: string): Promise<Uint8Array | null> => {
        const resp = await call('file_volume_read_file', { path });
        if (notFound(resp)) return null;
        throwOnRequestError(resp, 'volume.readFile');
        const dataBase64 = resp.data as string | null | undefined;
        if (dataBase64 === null || dataBase64 === undefined) return null;
        return new Uint8Array(Buffer.from(dataBase64, 'base64'));
      },
      writeFile: async (path: string, data: Uint8Array): Promise<void> => {
        const resp = await call('file_volume_write_file', {
          path,
          data: Buffer.from(data).toString('base64'),
        });
        throwOnRequestError(resp, 'volume.writeFile');
      },
      delete: async (path: string, options?: { recursive?: boolean }): Promise<void> => {
        const resp = await call('file_volume_delete', {
          path,
          ...(options?.recursive !== undefined ? { recursive: options.recursive } : {}),
        });
        throwOnRequestError(resp, 'volume.delete');
      },
      stat: async (path: string): Promise<FileStat | null> => {
        const resp = await call('file_volume_stat', { path });
        if (notFound(resp)) return null;
        throwOnRequestError(resp, 'volume.stat');
        return (resp.stat as FileStat | null) ?? null;
      },
      mkdir: async (path: string): Promise<void> => {
        const resp = await call('file_volume_mkdir', { path });
        throwOnRequestError(resp, 'volume.mkdir');
      },
      getTempPath: (filename: string): string => {
        return `tmp/${sessionId}/${filename}`;
      },
    };
  }

  // =========================================================================
  // Objects — immutable blobs private to the Installation
  // =========================================================================

  private createObjectsAccess(sessionId: string): ObjectsAccess {
    const info = (resp: Record<string, unknown>): ObjectInfo => ({
      objectId: resp.objectId as string,
      url: resp.url as string,
      size: resp.size as number,
      contentType: resp.contentType as string,
      visibility: (resp.visibility as ObjectInfo['visibility']) ?? 'private',
      createdAt: resp.createdAt as string,
      ...(resp.filename !== undefined ? { filename: resp.filename as string } : {}),
      ...(resp.metadata !== undefined ? { metadata: resp.metadata as Record<string, string> } : {}),
    });
    const fail = (resp: Record<string, unknown>, what: string): never => {
      throw new Error((resp.error as string) ?? `${what} failed`);
    };
    return {
      put: async (data, options: ObjectPutOptions): Promise<ObjectInfo> => {
        const requestId = generateMessageId();
        const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('object_put', sessionId),
            requestId,
            data: buffer.toString('base64'),
            contentType: options.contentType,
            ...(options.filename !== undefined ? { filename: options.filename } : {}),
            ...(options.visibility !== undefined ? { visibility: options.visibility } : {}),
            ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
          },
          60_000,
        );
        if (resp.success !== true) fail(resp, 'object_put');
        return info(resp);
      },
      get: async (objectIdOrUrl: string): Promise<ObjectContent | null> => {
        const requestId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('object_get', sessionId),
            requestId,
            objectId: resolveObjectId(objectIdOrUrl),
          },
          60_000,
        );
        if (resp.success !== true) {
          if (resp.data === undefined && resp.objectId === undefined) return null;
          fail(resp, 'object_get');
        }
        return { ...info(resp), data: Buffer.from((resp.data as string) ?? '', 'base64') };
      },
      delete: async (objectIdOrUrl: string): Promise<boolean> => {
        const requestId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('object_delete', sessionId),
            requestId,
            objectId: resolveObjectId(objectIdOrUrl),
          },
          60_000,
        );
        return resp.success === true;
      },
      list: async (options?: { limit?: number; cursor?: string }): Promise<ObjectPage> => {
        const requestId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('object_list', sessionId),
            requestId,
            ...(options?.limit !== undefined ? { limit: options.limit } : {}),
            ...(options?.cursor !== undefined ? { cursor: options.cursor } : {}),
          },
          60_000,
        );
        if (resp.success !== true) fail(resp, 'object_list');
        return {
          objects: ((resp.objects as Record<string, unknown>[]) ?? []).map(info),
          ...(resp.nextCursor !== undefined ? { nextCursor: resp.nextCursor as string } : {}),
        };
      },
      link: async (
        objectIdOrUrl: string,
        options: { expiresIn: number },
      ): Promise<{ url: string; expiresAt: string }> => {
        const requestId = generateMessageId();
        const resp = await this.doRequest(
          {
            ...createSessionEnvelope('object_link', sessionId),
            requestId,
            objectId: resolveObjectId(objectIdOrUrl),
            expiresIn: options.expiresIn,
          },
          60_000,
        );
        if (resp.success !== true) fail(resp, 'object_link');
        return { url: resp.url as string, expiresAt: resp.expiresAt as string };
      },
    };
  }

  // =========================================================================
  // Transport helpers
  // =========================================================================

  /** Send a message to the host (via the app station). */
  private send(msg: Record<string, unknown>): void {
    this.transport.send(msg as MessageBase);
  }

  /**
   * Send a request request and wait for the host's response.
   *
   * The request message must carry a `promptId` or `requestId` field.
   * The matching response (from the host, proxied by the app station) will
   * also carry the same id.
   */
  private doRequest(
    msg: Record<string, unknown>,
    timeoutMs = 300_000,
  ): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = (msg.promptId as string) ?? (msg.requestId as string);
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        resolve: (resp) => {
          clearTimeout(timer);
          // HOSTCAP-REQ-3: one typed error for every Request the Host does not support.
          if (resp.code === 'NOT_SUPPORTED') {
            reject(
              new HostUnsupportedError(
                msg.type as string,
                String(resp.error ?? 'not supported by this Host'),
              ),
            );
            return;
          }
          resolve(resp);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      this.transport.send(msg as MessageBase);
    });
  }
}

/**
 * Keep only what a shaping hook may return at its point: valid context
 * blocks (at most 8), and at `pre-turn` a valid veto and, for a transform
 * handler, a valid message. Everything dropped is logged.
 *
 * @spec HOOK-REQ-8
 */
function validateShapingResult(
  point: HookPoint,
  transform: boolean,
  result: ShapingHookResult | undefined,
  log: (level: 'warn', message: string) => void,
): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const out: Record<string, unknown> = {};
  if (result.context !== undefined) {
    const blocks = Array.isArray(result.context) ? result.context : [];
    const valid = blocks.filter((b) => ContextBlockSchema.safeParse(b).success);
    if (valid.length < blocks.length) {
      log(
        'warn',
        `Hook '${point}' returned ${blocks.length - valid.length} invalid context block(s); dropped`,
      );
    }
    if (valid.length > MAX_CONTEXT_BLOCKS) {
      log(
        'warn',
        `Hook '${point}' returned ${valid.length} context blocks; only the first ${MAX_CONTEXT_BLOCKS} are kept`,
      );
    }
    if (valid.length > 0) out.context = valid.slice(0, MAX_CONTEXT_BLOCKS);
  }
  if (result.veto !== undefined) {
    if (point === 'pre-turn' && HookVetoSchema.safeParse(result.veto).success)
      out.veto = result.veto;
    else
      log('warn', `Hook '${point}' returned a veto that is invalid or not allowed here; dropped`);
  }
  if (result.message !== undefined) {
    if (point === 'pre-turn' && transform && HookMessageSchema.safeParse(result.message).success) {
      out.message = result.message;
    } else {
      log(
        'warn',
        `Hook '${point}' returned a message that is invalid or not allowed here; dropped`,
      );
    }
  }
  return out;
}
