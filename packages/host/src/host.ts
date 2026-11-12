/**
 * @agentapps/host — main host class.
 *
 * The high-level API a platform embeds to consume agent apps via their
 * app stations. Wraps the raw app station protocol into typed, Promise-based
 * calls with automatic request/response correlation and request dispatch.
 *
 * @example
 * ```ts
 * import { AgentAppHost } from '@agentapps/host';
 *
 * const host = new AgentAppHost(transport, {
 *   host: { name: 'my-platform', version: '1.0.0' },
 *   requests: {
 *     onGetInstallationSecrets: async (sessionId) => {
 *       return db.getInstallationSecrets(sessionId);
 *     },
 *   },
 * });
 *
 * const info = await host.initialize();
 * const session = await host.openSession({ installationId: 'inst_1', tenant: { userId: 'u1' } });
 * const result = await session.callTool('greet', { name: 'World' }, context);
 * await session.close();
 * await host.shutdown();
 * ```
 */

import {
  createEnvelope,
  ErrorCode,
  type HostCapabilities,
  type MessageBase,
  NOOP_TELEMETRY,
  PROTOCOL_VERSION,
  type TelemetryProvider,
  type Transport,
  type Unsubscribe,
} from '@agentapps/protocol';
import { Session } from './session.js';
import type {
  ControllerHealthStatus,
  EventsGapListener,
  HostInfo,
  InitializeResult,
  RequestHandlers,
  SessionOpenOptions,
  SessionStatusListener,
} from './types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Configuration for creating an AgentAppHost. */
export interface AgentAppHostConfig {
  /** Host identity for the handshake. */
  host: HostInfo;
  /** Request handlers for secret/auth requests from instances. */
  requests?: RequestHandlers;
  /** Whether the host supports direct connections (default: false, reserved). */
  directConnection?: boolean;
  /**
   * What this Host can do, declared at initialize (HOSTCAP-REQ-1). Anything
   * not declared is unsupported: its Requests are answered NOT_SUPPORTED
   * (HOSTCAP-REQ-3).
   */
  capabilities?: Omit<HostCapabilities, 'directConnection'>;
  /** Optional telemetry provider for metrics and tracing. */
  telemetry?: TelemetryProvider;
}

// ---------------------------------------------------------------------------
// Pending request helpers
// ---------------------------------------------------------------------------

type PendingResolver = {
  resolve: (msg: Record<string, unknown>) => void;
  reject: (err: Error) => void;
};

// ---------------------------------------------------------------------------
// AgentAppHost
// ---------------------------------------------------------------------------

/**
 * Host side of the Agent Apps app station protocol.
 *
 * One instance per app station connection. Manages the handshake, session
 * lifecycle, request dispatch, and notification routing.
 */
export class AgentAppHost {
  private readonly config: AgentAppHostConfig;
  private readonly transport: Transport;
  private readonly telemetry: TelemetryProvider;
  private unsub: Unsubscribe | null = null;

  /** Pending control-plane requests (initialize, session_open, etc.). */
  private readonly pending = new Map<string, PendingResolver>();
  /** Active sessions, keyed by sessionId. */
  private readonly sessions = new Map<string, Session>();
  /** Tenant info per session, keyed by sessionId (for workspace-scoped requests). */
  private readonly sessionTenants = new Map<string, { userId: string; workspaceId?: string }>();

  /** Session status listeners. */
  private readonly sessionStatusListeners = new Set<SessionStatusListener>();
  /** Events gap listeners. */
  private readonly eventsGapListeners = new Set<EventsGapListener>();

  private _initialized = false;
  private _initResult: InitializeResult | null = null;

  constructor(transport: Transport, config: AgentAppHostConfig) {
    this.transport = transport;
    this.config = config;
    this.telemetry = config.telemetry ?? NOOP_TELEMETRY;

    this.unsub = transport.onMessage((msg) => {
      this.handleMessage(msg as Record<string, unknown>);
    });
  }

  /** Whether the host has completed the initialize handshake. */
  get initialized(): boolean {
    return this._initialized;
  }

  /** The result of the last successful initialize, or null. */
  get initResult(): InitializeResult | null {
    return this._initResult;
  }

  /** Number of active sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  // =========================================================================
  // Control plane — handshake
  // =========================================================================

  /**
   * Initialize the connection with the app station.
   * Must be called once before opening sessions.
   */
  async initialize(timeoutMs = 30_000): Promise<InitializeResult> {
    this.telemetry.counter('agentapps.host.request.count', 1, { operation: 'initialize' });
    const startTime = Date.now();

    const envelope = createEnvelope('initialize');
    const promise = this.createPending(envelope.id, timeoutMs);

    this.send({
      ...envelope,
      supportedVersions: [PROTOCOL_VERSION],
      host: this.config.host,
      capabilities: {
        ...this.config.capabilities,
        directConnection: this.config.directConnection ?? false,
      },
    });

    const resp = await promise;
    this.telemetry.histogram('agentapps.host.request.duration_ms', Date.now() - startTime, {
      operation: 'initialize',
    });

    const result: InitializeResult = {
      negotiatedVersion: resp.negotiatedVersion as string,
      app: resp.app as InitializeResult['app'],
      station: resp.station as InitializeResult['station'],
      capabilities: resp.capabilities as InitializeResult['capabilities'],
      limits: resp.limits as InitializeResult['limits'],
    };

    this._initialized = true;
    this._initResult = result;
    return result;
  }

  // =========================================================================
  // Control plane — sessions
  // =========================================================================

  /**
   * Open a tenant session. Returns a Session handle for tool calls.
   *
   * If a session for the same installationId is already active, the
   * app station returns the existing one (idempotent open, REQ-5).
   */
  async openSession(options: SessionOpenOptions, timeoutMs = 60_000): Promise<Session> {
    if (!this._initialized) {
      throw new Error('Host not initialized — call initialize() first');
    }

    this.telemetry.counter('agentapps.host.request.count', 1, { operation: 'session_open' });
    const startTime = Date.now();

    const envelope = createEnvelope('session_open');
    const promise = this.createPending(envelope.id, timeoutMs);

    this.send({
      ...envelope,
      installationId: options.installationId,
      tenant: options.tenant,
      // VOL-REQ-5: the Station decides the Volume mount at spawn from these.
      ...(options.effectivePermissions
        ? { effectivePermissions: options.effectivePermissions }
        : {}),
    });

    const resp = await promise;
    this.telemetry.histogram('agentapps.host.request.duration_ms', Date.now() - startTime, {
      operation: 'session_open',
    });

    const sessionId = resp.sessionId as string;

    // Return existing session handle if idempotent re-open
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const session = new Session(sessionId, options.installationId, (msg) => this.send(msg));
    this.sessions.set(sessionId, session);
    this.sessionTenants.set(sessionId, options.tenant);

    // Push initial permissions snapshot if provided (R9 — 5.1)
    if (options.effectivePermissions) {
      session.sendPermissionsChanged(options.effectivePermissions);
    }

    return session;
  }

  /**
   * Get a session by id (if it's still active).
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  // =========================================================================
  // Control plane — health
  // =========================================================================

  /**
   * Request aggregated app station health.
   * @param verbose — if true, the response includes the full instance list.
   */
  async controllerHealth(verbose = false, timeoutMs = 10_000): Promise<ControllerHealthStatus> {
    const envelope = createEnvelope('controller_health');
    const promise = this.createPending(envelope.id, timeoutMs);
    this.send({ ...envelope, verbose });

    const resp = await promise;
    return resp as unknown as ControllerHealthStatus;
  }

  // =========================================================================
  // Control plane — lifecycle (install / uninstall)
  // =========================================================================

  /**
   * Trigger the app's `onInstall` hook for a new installation.
   *
   * The app station spawns (or reuses) an instance, delivers the hook call,
   * and returns the result.
   */
  async install(
    options: SessionOpenOptions,
    timeoutMs = 60_000,
  ): Promise<{ success: boolean; error?: string; result?: unknown }> {
    if (!this._initialized) {
      throw new Error('Host not initialized — call initialize() first');
    }

    const envelope = createEnvelope('install');
    const promise = this.createPending(envelope.id, timeoutMs);

    this.send({
      ...envelope,
      installationId: options.installationId,
      tenant: options.tenant,
    });

    const resp = await promise;
    return {
      success: resp.success as boolean,
      ...(resp.error ? { error: resp.error as string } : {}),
      ...(resp.result !== undefined ? { result: resp.result } : {}),
    };
  }

  /**
   * Trigger the app's `onUninstall` hook before removing an installation.
   */
  async uninstall(
    options: SessionOpenOptions,
    timeoutMs = 60_000,
  ): Promise<{ success: boolean; error?: string; result?: unknown }> {
    if (!this._initialized) {
      throw new Error('Host not initialized — call initialize() first');
    }

    const envelope = createEnvelope('uninstall');
    const promise = this.createPending(envelope.id, timeoutMs);

    this.send({
      ...envelope,
      installationId: options.installationId,
      tenant: options.tenant,
    });

    const resp = await promise;
    return {
      success: resp.success as boolean,
      ...(resp.error ? { error: resp.error as string } : {}),
      ...(resp.result !== undefined ? { result: resp.result } : {}),
    };
  }

  // =========================================================================
  // Notifications
  // =========================================================================

  /** Register a listener for session_status notifications. */
  onSessionStatus(listener: SessionStatusListener): Unsubscribe {
    this.sessionStatusListeners.add(listener);
    return () => this.sessionStatusListeners.delete(listener);
  }

  /** Register a listener for events_gap notifications. */
  onEventsGap(listener: EventsGapListener): Unsubscribe {
    this.eventsGapListeners.add(listener);
    return () => this.eventsGapListeners.delete(listener);
  }

  // =========================================================================
  // Shutdown
  // =========================================================================

  /**
   * Disconnect from the app station. Rejects all pending requests,
   * marks all sessions as closed, and closes the transport.
   */
  async shutdown(): Promise<void> {
    // Reject pending requests
    for (const [, p] of this.pending) {
      p.reject(new Error('Host shutting down'));
    }
    this.pending.clear();

    // Mark sessions closed
    for (const [, session] of this.sessions) {
      for (const [, p] of session._pending) {
        p.reject(new Error('Host shutting down'));
      }
      session._pending.clear();
    }
    this.sessions.clear();
    this.sessionTenants.clear();

    this.unsub?.();
    this.unsub = null;
    await this.transport.close();

    this._initialized = false;
    this._initResult = null;
  }

  // =========================================================================
  // Message dispatch
  // =========================================================================

  private handleMessage(msg: Record<string, unknown>): void {
    try {
      const msgType = msg.type as string;
      const msgId = msg.id as string | undefined;
      const sessionId = msg.sessionId as string | undefined;

      // 1. Control-plane responses (match by id)
      if (msgId && this.pending.has(msgId)) {
        const p = this.pending.get(msgId);
        this.pending.delete(msgId);
        if (msgType === 'error') {
          const err = msg.error as { code: string; message: string };
          p?.reject(new Error(`${err.code}: ${err.message}`));
        } else {
          p?.resolve(msg);
        }
        return;
      }

      // 2. Session-plane responses (route to session by sessionId, match by id)
      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
          const consumed = session._handleMessage(msg);

          // Clean up on session_closed (even if _handleMessage consumed it)
          if (msgType === 'session_closed') {
            this.sessions.delete(sessionId);
            this.sessionTenants.delete(sessionId);
          }

          if (consumed) return;
        }
      }

      // 3. Request requests from instances (secret/auth) — dispatch to handlers
      if (this.isRequestMessage(msgType)) {
        this.telemetry.counter('agentapps.host.request.count', 1, { 'request.type': msgType });
        this.handleRequest(msg).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[host] request handler error:', err);
        });
        return;
      }

      // 3b. New unified request requests (type === 'prompt') — route to session
      if (msgType === 'prompt' && sessionId) {
        // HOSTCAP-REQ-3: a prompt type no human can answer here is unsupported.
        const promptType = msg.promptType as 'auth' | 'secret' | 'url';
        if (!this.config.capabilities?.prompts?.includes(promptType)) {
          this.send({
            ...createEnvelope('prompt_result'),
            sessionId,
            promptId: msg.promptId,
            success: false,
            error: `This Host cannot answer ${promptType} prompts`,
            code: ErrorCode.NOT_SUPPORTED,
          });
          return;
        }
        const session = this.sessions.get(sessionId);
        if (session) {
          session._handleRequest(msg).catch((err) => {
            // eslint-disable-next-line no-console
            console.error('[host] request handler error:', err);
          });
          return;
        }
      }

      // 4. Notifications
      if (msgType === 'session_status') {
        for (const listener of this.sessionStatusListeners) {
          try {
            listener(sessionId ?? '', msg.status as string);
          } catch (listenerErr) {
            // eslint-disable-next-line no-console
            console.error('[host] session status listener error:', listenerErr);
          }
        }
        return;
      }

      if (msgType === 'events_gap') {
        for (const listener of this.eventsGapListeners) {
          try {
            listener(msg.droppedCount as number, msg.oldestDroppedAt as string);
          } catch (listenerErr) {
            // eslint-disable-next-line no-console
            console.error('[host] events gap listener error:', listenerErr);
          }
        }
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[host] handleMessage error:', err);
    }
  }

  // =========================================================================
  // Request handling (REQ-7)
  // =========================================================================

  private readonly INSTANCE_REQUEST_TYPES = new Set([
    'get_system_secrets',
    'get_installation_secrets',
    'update_installation_secrets',
    'auth_url',
    'auth_status',
    'refresh_token',
    'get_user_profile',
    'intent_call',
    'inbound_subscribe',
    'inbound_unsubscribe',
    'storage_put',
    'storage_get',
    'storage_query',
    'storage_update',
    'storage_delete',
    'object_put',
    'object_get',
    'object_delete',
    'object_list',
    'object_link',
    // Volume requests (file_volume_*)
    'file_volume_read_dir',
    'file_volume_read_file',
    'file_volume_write_file',
    'file_volume_delete',
    'file_volume_stat',
    'conversation_read',
  ]);

  private isRequestMessage(type: string): boolean {
    return this.INSTANCE_REQUEST_TYPES.has(type);
  }

  private async handleRequest(msg: Record<string, unknown>): Promise<void> {
    const sessionId = msg.sessionId as string;
    const requestId = (msg.requestId as string) ?? (msg.promptId as string);
    const requests = this.config.requests;

    // HOSTCAP-REQ-3: Requests for a feature this Host did not declare.
    const feature = requiredCapability(msg.type as string);
    if (feature && this.config.capabilities?.[feature] !== true) {
      this.send({
        ...createEnvelope(resultTypeOf(msg.type as string)),
        sessionId,
        requestId,
        success: false,
        error: `This Host does not support ${feature}`,
        code: ErrorCode.NOT_SUPPORTED,
      });
      return;
    }

    try {
      switch (msg.type) {
        case 'get_system_secrets': {
          const handler = requests?.onGetSystemSecrets;
          if (!handler) {
            this.sendRequestError(sessionId, requestId, 'No system secrets handler');
            return;
          }
          const secrets = await handler(sessionId, requestId);
          this.send({
            ...createEnvelope('system_secrets'),
            sessionId,
            requestId,
            secrets,
          });
          return;
        }

        case 'get_installation_secrets': {
          const handler = requests?.onGetInstallationSecrets;
          if (!handler) {
            this.sendRequestError(sessionId, requestId, 'No installation secrets handler');
            return;
          }
          const secrets = await handler(sessionId, requestId);
          this.send({
            ...createEnvelope('installation_secrets'),
            sessionId,
            requestId,
            secrets,
          });
          return;
        }

        case 'update_installation_secrets': {
          const handler = requests?.onUpdateInstallationSecrets;
          if (!handler) {
            this.sendRequestError(sessionId, requestId, 'No update secrets handler');
            return;
          }
          const ok = await handler(sessionId, requestId, msg.secrets as Record<string, string>);
          this.send({
            ...createEnvelope('update_installation_secrets_response'),
            sessionId,
            requestId,
            success: ok,
          });
          return;
        }

        case 'auth_url': {
          const handler = requests?.onAuthUrl;
          if (!handler) {
            this.sendRequestError(sessionId, requestId, 'No auth URL handler');
            return;
          }
          const result = await handler(
            sessionId,
            requestId,
            msg.provider as string,
            msg.scopes as string[] | undefined,
          );
          this.send({
            ...createEnvelope('auth_url_result'),
            sessionId,
            requestId,
            url: result.url,
            state: result.state,
          });
          return;
        }

        case 'auth_status': {
          const handler = requests?.onAuthStatus;
          if (!handler) {
            this.sendRequestError(sessionId, requestId, 'No auth status handler');
            return;
          }
          const status = await handler(sessionId, requestId);
          this.send({
            ...createEnvelope('auth_status_result'),
            sessionId,
            requestId,
            ...status,
          });
          return;
        }

        case 'refresh_token': {
          const refreshHandler = requests?.onRefreshToken;
          if (!refreshHandler) {
            this.sendRequestError(sessionId, requestId, 'No refresh token handler');
            return;
          }
          const tokens = await refreshHandler(sessionId, requestId);
          this.send({
            ...createEnvelope('refresh_token_response'),
            sessionId,
            requestId,
            ...tokens,
          });
          return;
        }

        case 'conversation_read': {
          // HOOK-REQ-27: the dispatcher decides; without one, nothing is readable.
          const handler = requests?.onConversationRead;
          const result = handler
            ? await handler(sessionId, {
                conversationId: msg.conversationId as string,
                ...(typeof msg.cursor === 'string' ? { cursor: msg.cursor } : {}),
                ...(typeof msg.limit === 'number' ? { limit: msg.limit } : {}),
              })
            : {
                turns: [],
                error: {
                  code: ErrorCode.PERMISSION_DENIED,
                  message: 'This Host keeps no conversations',
                },
              };
          this.send({
            ...createEnvelope('conversation_read_result'),
            sessionId,
            requestId,
            ...result,
          });
          return;
        }

        case 'get_user_profile': {
          const handler = requests?.onGetUserProfile;
          if (!handler) {
            this.sendRequestError(sessionId, requestId, 'No user profile handler');
            return;
          }
          const profile = await handler(sessionId, requestId);
          this.send({
            ...createEnvelope('user_profile_result'),
            sessionId,
            requestId,
            profile,
          });
          return;
        }

        case 'intent_call': {
          // R9 — 5.4: permission enforcement before dispatch
          const icSession = this.sessions.get(sessionId);
          const intentPermCheck = requests?.onCheckPermission;
          if (intentPermCheck && icSession) {
            const denied = await intentPermCheck(sessionId, icSession.installationId, {
              type: 'intent_call',
              name: `${msg.binding as string}.${msg.tool as string}`,
              args: (msg.arguments as Record<string, unknown>) ?? {},
            });
            if (denied) {
              this.send({
                ...createEnvelope('intent_result'),
                sessionId,
                requestId,
                success: false,
                error: {
                  code: 'PERMISSION_DENIED',
                  message: denied.reason,
                  details: {
                    layer: denied.layer,
                    permission: denied.permission,
                    reason: denied.reason,
                  },
                },
                duration: 0,
              });
              return;
            }
          }

          const handler = requests?.onIntentCall;
          if (!handler) {
            this.send({
              ...createEnvelope('intent_result'),
              sessionId,
              requestId,
              success: false,
              error: { code: 'PERMISSION_DENIED', message: 'No intent handler configured' },
              duration: 0,
            });
            return;
          }
          const intentResult = await handler(
            sessionId,
            requestId,
            msg.binding as string,
            msg.tool as string,
            (msg.arguments as Record<string, unknown>) ?? {},
          );
          this.send({
            ...createEnvelope('intent_result'),
            sessionId,
            requestId,
            success: intentResult.success,
            ...(intentResult.result !== undefined ? { result: intentResult.result } : {}),
            ...(intentResult.error ? { error: intentResult.error } : {}),
            duration: intentResult.duration,
          });
          return;
        }

        case 'inbound_subscribe': {
          const handler = requests?.onInboundSubscribe;
          if (!handler) {
            this.send({
              ...createEnvelope('inbound_subscribe_result'),
              sessionId,
              requestId,
              success: false,
              error: { code: 'NOT_SUPPORTED', message: 'No inbound subscribe handler configured' },
            });
            return;
          }
          const subResult = await handler(
            sessionId,
            requestId,
            msg.source as Record<string, unknown>,
            msg.eventTypes as string[],
          );
          this.send({
            ...createEnvelope('inbound_subscribe_result'),
            sessionId,
            requestId,
            success: subResult.success,
            ...(subResult.subscriptionId ? { subscriptionId: subResult.subscriptionId } : {}),
            ...(subResult.error ? { error: subResult.error } : {}),
          });
          return;
        }

        case 'inbound_unsubscribe': {
          const handler = requests?.onInboundUnsubscribe;
          if (!handler) {
            this.send({
              ...createEnvelope('inbound_unsubscribe_result'),
              sessionId,
              requestId,
              success: false,
            });
            return;
          }
          const ok = await handler(sessionId, requestId, msg.subscriptionId as string);
          this.send({
            ...createEnvelope('inbound_unsubscribe_result'),
            sessionId,
            requestId,
            success: ok,
          });
          return;
        }

        case 'storage_put':
        case 'storage_get':
        case 'storage_query':
        case 'storage_update':
        case 'storage_delete': {
          await this.handleStorageRequest(sessionId, requestId, msg);
          return;
        }

        case 'object_put': {
          const oSession = this.sessions.get(sessionId);
          const installationId = oSession?.installationId ?? sessionId;
          const handler = requests?.onObjectPut;
          if (!handler) {
            this.send({
              ...createEnvelope('object_put_result'),
              sessionId,
              requestId,
              success: false,
              error: 'No object handler configured',
            });
            return;
          }
          const info = await handler(sessionId, installationId, {
            data: Buffer.from(msg.data as string, 'base64'),
            contentType: msg.contentType as string,
            ...(msg.filename !== undefined ? { filename: msg.filename as string } : {}),
            visibility: (msg.visibility as 'private' | 'public' | undefined) ?? 'private',
            ...(msg.metadata !== undefined
              ? { metadata: msg.metadata as Record<string, string> }
              : {}),
          });
          this.send({
            ...createEnvelope('object_put_result'),
            sessionId,
            requestId,
            success: true,
            ...info,
          });
          return;
        }

        case 'object_get': {
          const oSession = this.sessions.get(sessionId);
          const installationId = oSession?.installationId ?? sessionId;
          const handler = requests?.onObjectGet;
          if (!handler) {
            this.send({
              ...createEnvelope('object_get_result'),
              sessionId,
              requestId,
              success: false,
              error: 'No object handler configured',
            });
            return;
          }
          const found = await handler(sessionId, installationId, msg.objectId as string);
          if (!found) {
            this.send({
              ...createEnvelope('object_get_result'),
              sessionId,
              requestId,
              success: false,
              error: 'Object not found',
            });
            return;
          }
          const { data, ...info } = found;
          this.send({
            ...createEnvelope('object_get_result'),
            sessionId,
            requestId,
            success: true,
            ...info,
            data: data.toString('base64'),
          });
          return;
        }

        case 'object_delete': {
          const oSession = this.sessions.get(sessionId);
          const installationId = oSession?.installationId ?? sessionId;
          const handler = requests?.onObjectDelete;
          if (!handler) {
            this.send({
              ...createEnvelope('object_delete_result'),
              sessionId,
              requestId,
              success: false,
              error: 'No object handler configured',
            });
            return;
          }
          const deleted = await handler(sessionId, installationId, msg.objectId as string);
          this.send({
            ...createEnvelope('object_delete_result'),
            sessionId,
            requestId,
            success: deleted,
            ...(deleted ? {} : { error: 'Object not found' }),
          });
          return;
        }

        case 'object_list': {
          const oSession = this.sessions.get(sessionId);
          const installationId = oSession?.installationId ?? sessionId;
          const handler = requests?.onObjectList;
          if (!handler) {
            this.send({
              ...createEnvelope('object_list_result'),
              sessionId,
              requestId,
              success: false,
              error: 'No object handler configured',
            });
            return;
          }
          const page = await handler(sessionId, installationId, {
            ...(msg.limit !== undefined ? { limit: msg.limit as number } : {}),
            ...(msg.cursor !== undefined ? { cursor: msg.cursor as string } : {}),
          });
          this.send({
            ...createEnvelope('object_list_result'),
            sessionId,
            requestId,
            success: true,
            objects: page.objects,
            ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
          });
          return;
        }

        case 'object_link': {
          const oSession = this.sessions.get(sessionId);
          const installationId = oSession?.installationId ?? sessionId;
          const handler = requests?.onObjectLink;
          if (!handler) {
            this.send({
              ...createEnvelope('object_link_result'),
              sessionId,
              requestId,
              success: false,
              error: 'No object handler configured',
            });
            return;
          }
          const link = await handler(
            sessionId,
            installationId,
            msg.objectId as string,
            msg.expiresIn as number,
          );
          this.send({
            ...createEnvelope('object_link_result'),
            sessionId,
            requestId,
            success: link !== null,
            ...(link ?? { error: 'Object not found' }),
          });
          return;
        }

        // -----------------------------------------------------------------
        // Volume requests (file_volume_*)
        // Delegated to onFileRequest — the host implementation operates on
        // the Volume and returns the full response.
        // -----------------------------------------------------------------
        default: {
          const msgType = msg.type as string;
          if (msgType.startsWith('file_volume_') && !msgType.endsWith('_result')) {
            const handler = requests?.onFileRequest;
            if (!handler) {
              this.sendRequestError(sessionId, requestId, `No file request handler for ${msgType}`);
              return;
            }
            const response = await handler(sessionId, msg);
            // Ensure the response has sessionId and requestId
            this.send({
              ...response,
              sessionId,
              requestId,
            });
            return;
          }
          // Unknown request type — fall through to error
          this.sendRequestError(sessionId, requestId, `Unhandled request type: ${msgType}`);
          return;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendRequestError(sessionId, requestId, message);
    }
  }

  /**
   * Storage requests: dispatch to the matching request and answer with the
   * typed `*_response`, shaped as the Teros backend shapes them. A missing
   * request or session answers `success: false` with an error.
   */
  private async handleStorageRequest(
    sessionId: string,
    requestId: string,
    msg: Record<string, unknown>,
  ): Promise<void> {
    const type = msg.type as string;
    const responseType = `${type}_response`;
    const requests = this.config.requests;
    const session = this.sessions.get(sessionId);
    const collection = msg.collection as string;
    const documentId = msg.documentId as string;
    const fail = (error: string, extra: Record<string, unknown> = {}): void => {
      this.send({
        ...createEnvelope(responseType),
        sessionId,
        requestId,
        success: false,
        ...extra,
        error,
      });
    };
    if (!session) {
      fail('Session not found', type === 'storage_query' ? { documents: [] } : {});
      return;
    }
    const installationId = session.installationId;
    try {
      switch (type) {
        case 'storage_put': {
          const handler = requests?.onStoragePut;
          if (!handler) return fail('No storage put handler');
          const ok = await handler(
            sessionId,
            installationId,
            collection,
            documentId,
            msg.document as Record<string, unknown>,
          );
          this.send({
            ...createEnvelope(responseType),
            sessionId,
            requestId,
            success: ok,
            documentId,
          });
          return;
        }
        case 'storage_get': {
          const handler = requests?.onStorageGet;
          if (!handler) return fail('No storage get handler', { document: null });
          const document = await handler(sessionId, installationId, collection, documentId);
          this.send({
            ...createEnvelope(responseType),
            sessionId,
            requestId,
            success: true,
            document: document ?? null,
          });
          return;
        }
        case 'storage_query': {
          const handler = requests?.onStorageQuery;
          if (!handler) return fail('No storage query handler', { documents: [] });
          const page = await handler(sessionId, installationId, collection, {
            filter: msg.filter as Record<string, unknown> | undefined,
            limit: msg.limit as number | undefined,
            cursor: msg.cursor as string | undefined,
          });
          this.send({
            ...createEnvelope(responseType),
            sessionId,
            requestId,
            success: true,
            documents: page.documents,
            ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
          });
          return;
        }
        case 'storage_update': {
          const handler = requests?.onStorageUpdate;
          if (!handler) return fail('No storage update handler', { document: null });
          const document = await handler(
            sessionId,
            installationId,
            collection,
            documentId,
            msg.patch as Record<string, unknown>,
          );
          if (!document) return fail('Document not found', { document: null });
          this.send({
            ...createEnvelope(responseType),
            sessionId,
            requestId,
            success: true,
            document,
          });
          return;
        }
        case 'storage_delete': {
          const handler = requests?.onStorageDelete;
          if (!handler) return fail('No storage delete handler');
          const ok = await handler(sessionId, installationId, collection, documentId);
          this.send({ ...createEnvelope(responseType), sessionId, requestId, success: ok });
          return;
        }
        default:
          fail(`Unknown storage request: ${type}`);
      }
    } catch (err) {
      fail(
        err instanceof Error ? err.message : String(err),
        type === 'storage_query' ? { documents: [] } : {},
      );
    }
  }

  private sendRequestError(sessionId: string, requestId: string, error: string): void {
    this.send({
      ...createEnvelope('prompt_result'),
      sessionId,
      requestId,
      success: false,
      error,
    });
  }

  // =========================================================================
  // Transport helpers
  // =========================================================================

  private send(msg: Record<string, unknown>): void {
    this.transport.send(msg as MessageBase);
  }

  private createPending(id: string, timeoutMs: number): Promise<Record<string, unknown>> {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
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

// ---------------------------------------------------------------------------
// Host Capabilities (HOSTCAP-REQ-3)
// ---------------------------------------------------------------------------

type GatedFeature = 'storage' | 'objects' | 'volume' | 'profile' | 'intents';

/** The declared capability an Instance-to-Host Request needs, if any. */
function requiredCapability(type: string): GatedFeature | null {
  if (type.startsWith('storage_')) return 'storage';
  if (type.startsWith('object_')) return 'objects';
  if (type.startsWith('file_volume_')) return 'volume';
  if (type === 'get_user_profile') return 'profile';
  if (type === 'intent_call') return 'intents';
  return null;
}

/** The result message type that answers a Request type. */
function resultTypeOf(type: string): string {
  if (type.startsWith('storage_')) return `${type}_response`;
  if (type === 'get_user_profile') return 'user_profile_result';
  if (type === 'intent_call') return 'intent_result';
  return `${type}_result`;
}
