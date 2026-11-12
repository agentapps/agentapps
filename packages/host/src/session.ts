/**
 * @agentapps/host — session handle.
 *
 * Returned by `AgentAppHost.openSession()`. Each session is a stateful
 * handle to one tenant's connection through the app station to an app
 * instance. Tool calls, list_tools, health_check, and session_close
 * all go through this handle.
 */

import {
  createEnvelope,
  type EffectivePermissions,
  type ExecutionContext,
  generateMessageId,
  type HookHost,
  type NotifyHookPoint,
  type ShapingHookPoint,
} from '@agentapps/protocol';
import type {
  HealthStatus,
  HookResult,
  LifecycleResult,
  ToolDefinition,
  ToolResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A session request that got no answer in time. */
class RequestTimeoutError extends Error {}

/**
 * A shaping hook that did not answer within its timeout.
 *
 * @spec HOOK-REQ-13
 */
export class HookTimeoutError extends Error {
  constructor(
    readonly hookPoint: string,
    readonly timeoutMs: number,
  ) {
    super(`Hook '${hookPoint}' timed out after ${timeoutMs}ms`);
    this.name = 'HookTimeoutError';
  }
}

type SendFn = (msg: Record<string, unknown>) => void;
type PendingResolver = {
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: Error) => void;
};

/** Event received from a subscription. */
export interface SessionEvent {
  eventType: string;
  payload: unknown;
  subscriptionId: string;
}

/** Request handler types. */
export type AuthPromptHandler = (request: {
  provider: string;
  scopes: string[] | undefined;
  promptId: string;
}) => Promise<{ accessToken: string; refreshToken?: string; expiresAt?: Date }>;

export type SecretPromptHandler = (request: {
  name: string;
  description: string | undefined;
  promptId: string;
}) => Promise<{ value: string }>;

export type UrlPromptHandler = (request: {
  url: string;
  title: string | undefined;
  promptId: string;
}) => Promise<void>;

export type EventHandler = (event: SessionEvent) => void;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * A tenant session through a app station to an app instance.
 *
 * Usage:
 * ```ts
 * const session = await host.openSession({ installationId, tenant });
 * const tools = await session.listTools();
 * const result = await session.callTool('greet', { name: 'World' }, ctx);
 * await session.close();
 * ```
 */
export class Session {
  /** Pending request/response correlations, keyed by message id. */
  readonly _pending = new Map<string, PendingResolver>();
  private _closed = false;

  private _onAuthRequest: AuthPromptHandler | null = null;
  private _onSecretRequest: SecretPromptHandler | null = null;
  private _onUrlRequest: UrlPromptHandler | null = null;

  /** Active event handlers. */
  private readonly _eventHandlers = new Set<EventHandler>();

  constructor(
    readonly sessionId: string,
    readonly installationId: string,
    private readonly sendToController: SendFn,
  ) {}

  /** Whether this session has been closed. */
  get closed(): boolean {
    return this._closed;
  }

  /**
   * List the tools available on this app instance.
   */
  async listTools(timeoutMs = 10_000): Promise<ToolDefinition[]> {
    const resp = await this.request('list_tools', {}, timeoutMs);
    return (resp.tools as ToolDefinition[]) ?? [];
  }

  /**
   * Call a tool on the app instance.
   *
   * @param tool — tool name.
   * @param args — tool arguments (must match the tool's parameter schema).
   * @param context — execution context identifying the calling user.
   * @param timeoutMs — request timeout (default: 60s).
   */
  async callTool(
    tool: string,
    args: Record<string, unknown>,
    context: ExecutionContext,
    timeoutMs = 60_000,
  ): Promise<ToolResult> {
    const resp = await this.request('tool_call', { tool, arguments: args, context }, timeoutMs);
    return {
      success: resp.success as boolean,
      result: resp.result,
      error: resp.error as { code: string; message: string } | undefined,
      duration: (resp.duration as number) ?? 0,
      ...(resp.renderer ? { renderer: resp.renderer as ToolResult['renderer'] } : {}),
    };
  }

  /**
   * Subscribe to events from this app instance.
   *
   * @param eventTypes — list of event types to subscribe to, or ['*'] for all.
   * @returns subscriptionId — unique id for this subscription.
   */
  async subscribe(eventTypes: string[], timeoutMs = 10_000): Promise<string> {
    const resp = await this.request('subscribe', { eventTypes }, timeoutMs);
    if (!resp.success) {
      throw new Error((resp.error as string) ?? 'Subscribe failed');
    }
    return resp.subscriptionId as string;
  }

  /**
   * Unsubscribe from events.
   *
   * @param subscriptionId — the id returned by subscribe().
   * @returns true if successfully unsubscribed.
   */
  async unsubscribe(subscriptionId: string, timeoutMs = 10_000): Promise<boolean> {
    const resp = await this.request('unsubscribe', { subscriptionId }, timeoutMs);
    return (resp.success as boolean) ?? false;
  }

  /**
   * Register an event handler. All events matching active subscriptions
   * will be delivered to this handler.
   *
   * @returns unsubscribe function — call to stop receiving events.
   */
  onEvent(handler: EventHandler): () => void {
    this._eventHandlers.add(handler);
    return () => {
      this._eventHandlers.delete(handler);
    };
  }

  /**
   * Run a health check on the app instance.
   */
  async healthCheck(timeoutMs = 10_000): Promise<HealthStatus> {
    const resp = await this.request('health_check', {}, timeoutMs);
    return {
      status: resp.status as string,
      message: resp.message as string | undefined,
      issues: resp.issues as HealthStatus['issues'],
      uptime: resp.uptime as number | undefined,
      version: resp.version as string | undefined,
    };
  }

  /**
   * Cancel an in-flight tool call by its request id.
   */
  async cancel(requestId: string, reason?: string): Promise<boolean> {
    const resp = await this.request('cancel', { requestId, reason }, 5_000);
    return (resp.cancelled as boolean) ?? false;
  }

  /**
   * Invoke a shaping hook on this app instance and wait for its answer.
   *
   * On timeout the Host stops waiting, sends a `cancel` for the request and
   * ignores any late answer (HOOK-REQ-13); the promise rejects with
   * {@link HookTimeoutError}.
   *
   * @spec HOOK-REQ-4
   */
  async sendHook(
    hookPoint: ShapingHookPoint,
    request: { context: ExecutionContext; host: HookHost; input: Record<string, unknown> },
    timeoutMs = 5_000,
  ): Promise<HookResult> {
    if (this._closed) throw new Error('Session is closed');
    const envelope = createEnvelope('hook_request', this.sessionId);
    const requestId = generateMessageId();
    const promise = this.createPending(envelope.id, timeoutMs);
    this.sendToController({ ...envelope, requestId, hookPoint, ...request });
    try {
      const resp = await promise;
      return {
        ...(resp.context !== undefined ? { context: resp.context as unknown[] } : {}),
        ...(resp.veto !== undefined ? { veto: resp.veto } : {}),
        ...(resp.message !== undefined ? { message: resp.message } : {}),
      };
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        this.sendToController({
          ...createEnvelope('cancel', this.sessionId),
          requestId,
          reason: 'hook timeout',
        });
        throw new HookTimeoutError(hookPoint, timeoutMs);
      }
      throw err;
    }
  }

  /**
   * Send a notify hook. Resolves `true` once the app acknowledges it and
   * `false` when no acknowledgement arrives within `ackTimeoutMs`.
   *
   * @spec HOOK-REQ-5
   */
  async sendNotify(
    hookPoint: NotifyHookPoint,
    notification: {
      key?: string;
      context: ExecutionContext;
      host: HookHost;
      input: Record<string, unknown>;
    },
    ackTimeoutMs = 5_000,
  ): Promise<boolean> {
    if (this._closed) return false;
    const envelope = createEnvelope('hook_notify', this.sessionId);
    const promise = this.createPending(envelope.id, ackTimeoutMs);
    this.sendToController({
      ...envelope,
      notifyId: envelope.id,
      hookPoint,
      ...notification,
    });
    try {
      const resp = await promise;
      return resp.type === 'hook_ack';
    } catch {
      return false;
    }
  }

  /**
   * Send an installation lifecycle event to the app instance.
   *
   * Lifecycle events fire at installation boundaries: install (first use),
   * uninstall (removal), upgrade (version change). The instance runs its
   * registered handler and returns success/error.
   *
   * @param event — which lifecycle event to invoke.
   * @param context — execution context identifying the user/installation.
   * @param options — optional previousVersion (for 'upgrade' events) and timeout.
   * @returns the lifecycle result (success + optional error).
   */
  async sendLifecycleEvent(
    event: import('@agentapps/protocol').LifecycleEvent,
    context: ExecutionContext,
    options: { previousVersion?: string; timeoutMs?: number } = {},
  ): Promise<LifecycleResult> {
    const { previousVersion, timeoutMs = 10_000 } = options;
    const resp = await this.request(
      'lifecycle_request',
      {
        event,
        context,
        ...(previousVersion !== undefined ? { previousVersion } : {}),
      },
      timeoutMs,
    );
    return {
      success: resp.success as boolean,
      error: resp.error as string | undefined,
    };
  }

  /**
   * Push an inbound event to the instance (host → instance, unsolicited).
   *
   * Used by the host to deliver events from bound apps or the platform
   * after the instance has subscribed via `inbound_subscribe`.
   */
  sendInboundEvent(
    subscriptionId: string,
    source: { kind: 'binding'; binding: string } | { kind: 'platform'; namespace: string },
    eventType: string,
    data: unknown,
  ): void {
    this.sendToController({
      ...createEnvelope('inbound_event'),
      sessionId: this.sessionId,
      subscriptionId,
      source,
      eventType,
      data,
    });
  }

  /**
   * Push a permissions snapshot or update to the instance (R9 — 5.1/5.2).
   *
   * Called once after session open (initial snapshot) and again whenever
   * the user/admin changes the app's permissions mid-session.
   * Informational only — enforcement is always host-side.
   */
  sendPermissionsChanged(permissions: EffectivePermissions): void {
    this.sendToController({
      ...createEnvelope('permissions_changed'),
      sessionId: this.sessionId,
      permissions,
    });
  }

  /**
   * Register a handler for auth request requests from the instance.
   */
  onAuthRequest(handler: AuthPromptHandler): void {
    this._onAuthRequest = handler;
  }

  /**
   * Register a handler for secret request requests from the instance.
   */
  onSecretRequest(handler: SecretPromptHandler): void {
    this._onSecretRequest = handler;
  }

  /**
   * Register a handler for URL request requests from the instance.
   */
  onUrlRequest(handler: UrlPromptHandler): void {
    this._onUrlRequest = handler;
  }

  /**
   * Close this session. The app station may keep the instance alive for
   * reuse (idle timer decides teardown).
   */
  async close(timeoutMs = 10_000): Promise<void> {
    if (this._closed) return;
    const envelope = createEnvelope('session_close');
    const id = envelope.id;

    const promise = this.createPending(id, timeoutMs);
    this.sendToController({
      ...envelope,
      sessionId: this.sessionId,
    });

    await promise;
    this._closed = true;

    // Reject any remaining in-flight requests
    for (const [, pending] of this._pending) {
      pending.reject(new Error('Session closed'));
    }
    this._pending.clear();
  }

  // =========================================================================
  // Internal — message correlation
  // =========================================================================

  /**
   * Handle an incoming message that might be a response to a pending request,
   * or a subscription event to deliver to handlers.
   *
   * Called by AgentAppHost when it receives a session-plane message.
   * @returns true if the message was consumed.
   */
  _handleMessage(msg: Record<string, unknown>): boolean {
    const msgId = msg.id as string | undefined;

    // 1. Try to match as a response to a pending request
    if (msgId) {
      const pending = this._pending.get(msgId);
      if (pending) {
        this._pending.delete(msgId);

        // Check for error responses
        if (msg.type === 'error') {
          const err = msg.error as { code: string; message: string };
          pending.reject(new Error(`${err.code}: ${err.message}`));
        } else {
          pending.resolve(msg);
        }
        return true;
      }
    }

    // 2. Handle subscription events (unsolicited, no matching request id)
    if (msg.type === 'event') {
      const event: SessionEvent = {
        eventType: msg.eventType as string,
        payload: msg.payload,
        subscriptionId: msg.subscriptionId as string,
      };
      for (const handler of this._eventHandlers) {
        try {
          handler(event);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[session] Event handler error:', err);
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Handle a request request from the instance. Called by AgentAppHost.
   * @returns true if the request was handled.
   */
  async _handleRequest(msg: Record<string, unknown>): Promise<boolean> {
    if (msg.type !== 'prompt') return false;

    const promptType = msg.promptType as string;
    const promptId = msg.promptId as string;

    try {
      switch (promptType) {
        case 'auth': {
          if (!this._onAuthRequest) {
            this.sendToController({
              ...createEnvelope('prompt_result', this.sessionId),
              promptId,
              success: false,
              error: 'No auth handler registered on this session',
            });
            return true;
          }
          const result = await this._onAuthRequest({
            provider: msg.provider as string,
            scopes: msg.scopes as string[] | undefined,
            promptId,
          });
          this.sendToController({
            ...createEnvelope('prompt_result', this.sessionId),
            promptId,
            success: true,
            accessToken: result.accessToken,
            ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
            ...(result.expiresAt ? { expiresAt: result.expiresAt.toISOString() } : {}),
          });
          return true;
        }
        case 'secret': {
          if (!this._onSecretRequest) {
            this.sendToController({
              ...createEnvelope('prompt_result', this.sessionId),
              promptId,
              success: false,
              error: 'No secret handler registered on this session',
            });
            return true;
          }
          const result = await this._onSecretRequest({
            name: msg.secretName as string,
            description: msg.description as string | undefined,
            promptId,
          });
          this.sendToController({
            ...createEnvelope('prompt_result', this.sessionId),
            promptId,
            success: true,
            secretValue: result.value,
          });
          return true;
        }
        case 'url': {
          if (!this._onUrlRequest) {
            this.sendToController({
              ...createEnvelope('prompt_result', this.sessionId),
              promptId,
              success: false,
              error: 'No URL handler registered on this session',
            });
            return true;
          }
          await this._onUrlRequest({
            url: msg.url as string,
            title: msg.title as string | undefined,
            promptId,
          });
          this.sendToController({
            ...createEnvelope('prompt_result', this.sessionId),
            promptId,
            success: true,
            opened: true,
          });
          return true;
        }
        default:
          return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendToController({
        ...createEnvelope('prompt_result', this.sessionId),
        promptId,
        success: false,
        error: message,
      });
      return true;
    }
  }

  // =========================================================================
  // Private helpers
  // =========================================================================

  private async request(
    type: string,
    extra: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    if (this._closed) {
      throw new Error('Session is closed');
    }

    const envelope = createEnvelope(type, this.sessionId);
    const id = envelope.id;

    const promise = this.createPending(id, timeoutMs);
    this.sendToController({ ...envelope, ...extra });

    return promise;
  }

  private createPending(id: string, timeoutMs: number): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new RequestTimeoutError(`Request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this._pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }
}
