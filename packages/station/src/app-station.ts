/**
 * Agent App AppStation — core logic.
 *
 * The per-app-family component that owns instance lifecycle and proxies
 * all traffic between host and instances. Handles:
 * - Control plane: initialize, session_open/close, controller_health
 * - Session plane: proxy to/from the correct instance
 * - Requests: proxy instance→host secret/auth requests (with security)
 * - Lifecycle: spawn timeout, idle teardown, session_status notifications
 * - Backpressure: max in-flight per session, max instances
 *
 * Spec: docs/specs/agent-apps/controller-protocol.md
 */

import {
  createEnvelope,
  ErrorCode,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
  type Unsubscribe,
} from '@agentapps/protocol';
import { NOOP_TELEMETRY, type TelemetryProvider } from './telemetry.js';
import type { InstanceHandle, RuntimeAdapter } from './types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** AppStation configuration. */
export interface AppStationConfig {
  /** App catalog id (e.g., 'app.hello'). */
  appId: string;
  /** App version. */
  appVersion: string;
  /** Runtime adapter for spawning instances. */
  runtime: RuntimeAdapter;
  /** Session open timeout in ms (default: 60 000). */
  openTimeoutMs?: number;
  /** Max in-flight requests per session (default: 32). */
  maxInflightPerSession?: number;
  /** Idle timeout before instance teardown in ms (default: 30 min). */
  idleTimeoutMs?: number;
  /** Max concurrent instances (default: Infinity). */
  maxInstances?: number;
  /** Optional telemetry provider for metrics and tracing. */
  telemetry?: TelemetryProvider;
  /**
   * Decide the Volume mount path for a new Instance from its `session_open`
   * (VOL-REQ-5). Returning `undefined` means no mount.
   */
  resolveMountPath?: (open: {
    installationId: string;
    tenant: { userId: string; workspaceId?: string };
    effectivePermissions?: { permissions?: { volume?: boolean } };
  }) => string | undefined;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  installationId: string;
  tenant: { userId: string; workspaceId?: string };
  /** The Installation's Effective Permissions, checked by name (POLICY-REQ-8). */
  permissions?: Record<string, unknown>;
  /** get_user_profile requests answered with the basic profile only (POLICY-REQ-8). */
  basicProfileRequests?: Set<string>;
  /** In-flight request ids for backpressure tracking (REQ-10). */
  pendingRequests: Set<string>;
}

interface ManagedInstance {
  installationId: string;
  handle: InstanceHandle;
  /** Unsubscribes the instance→host message relay. */
  unsubscribe: Unsubscribe;
  /** Session ids currently served by this instance. */
  sessions: Set<string>;
  /** Idle timer (set when no sessions are active). */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Instance creation timestamp (for uptime). */
  createdAt: number;
  /** Last session-plane activity timestamp (for idle calculation). */
  lastActivity: number;
}

/**
 * Request types that require sessionId validation (REQ-7 security).
 * The app station MUST verify the instance owns the session before
 * proxying secret/auth requests to the host.
 */
const INSTANCE_REQUEST_TYPES: ReadonlySet<string> = new Set([
  // HOOK-REQ-25: conversation reads get the same session validation.
  'conversation_read',
  'get_system_secrets',
  'get_installation_secrets',
  'update_installation_secrets',
  'auth_url',
  'auth_status',
  'refresh_token',
  'refresh_token_response',
  'prompt',
  'prompt_result',
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
  // Volume storage requests (file_volume_*)
  'file_volume_read_dir',
  'file_volume_read_file',
  'file_volume_write_file',
  'file_volume_delete',
  'file_volume_stat',
]);

const APP_STATION_VERSION = '0.1.0';
const DEFAULT_OPEN_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_INFLIGHT = 128;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

class SpawnTimeoutError extends Error {
  constructor(ms: number) {
    super(`Instance spawn timed out after ${ms}ms`);
    this.name = 'SpawnTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// AppStation
// ---------------------------------------------------------------------------

/**
 * Agent App AppStation.
 *
 * Usage:
 * ```ts
 * const ctrl = new AppStation({ appId, appVersion, runtime });
 * ctrl.accept(transport); // host connects
 * // ... host sends initialize, session_open, tool_call, etc.
 * await ctrl.shutdown();
 * ```
 */
export class AppStation {
  private initialized = false;
  /** The Host behind this connection, as declared at initialize (HOSTCAP-REQ-2). */
  private host: {
    name: string;
    version: string;
    capabilities: Record<string, unknown>;
  } = { name: '', version: '', capabilities: {} };
  /** Tenant a single-user Host is bound to by its first session (HOSTCAP-REQ-6). */
  private boundUserId: string | null = null;
  private sessions = new Map<string, Session>();
  private instances = new Map<string, ManagedInstance>();
  private hostTransport: Transport | null = null;
  private hostUnsub: Unsubscribe | null = null;

  private readonly openTimeoutMs: number;
  private readonly maxInflight: number;
  private readonly idleTimeoutMs: number;
  private readonly maxInstances: number;
  private readonly telemetry: TelemetryProvider;

  /** Track promptIds per session to prevent replay attacks. */
  private readonly promptIds = new Map<string, Set<string>>();

  constructor(private readonly config: AppStationConfig) {
    this.openTimeoutMs = config.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
    this.maxInflight = config.maxInflightPerSession ?? DEFAULT_MAX_INFLIGHT;
    this.idleTimeoutMs = config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.maxInstances = config.maxInstances ?? Number.POSITIVE_INFINITY;
    this.telemetry = config.telemetry ?? NOOP_TELEMETRY;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** Accept a host connection on the given transport. */
  accept(transport: Transport): void {
    this.hostTransport = transport;
    this.hostUnsub = transport.onMessage((msg) => {
      this.handleHostMessage(msg).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[app-station] unhandled error:', err);
      });
    });
  }

  /** Shut down the app station and all sessions. */
  async shutdown(): Promise<void> {
    // Clear all idle timers and relay subscriptions
    for (const managed of this.instances.values()) {
      if (managed.idleTimer) clearTimeout(managed.idleTimer);
      managed.unsubscribe();
    }
    // Stop all instances
    const stopPromises: Promise<void>[] = [];
    for (const managed of this.instances.values()) {
      stopPromises.push(managed.handle.stop(5_000));
    }
    await Promise.allSettled(stopPromises);
    this.instances.clear();
    this.sessions.clear();
    this.promptIds.clear();
    this.hostUnsub?.();
    await this.hostTransport?.close();
    this.hostTransport = null;
    this.initialized = false;
  }

  /** Number of active sessions. */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /** Number of live instances. */
  get instanceCount(): number {
    return this.instances.size;
  }

  // =========================================================================
  // Host message dispatch
  // =========================================================================

  private async handleHostMessage(msg: MessageBase): Promise<void> {
    const anyMsg = msg as Record<string, unknown>;

    // Control-plane messages dispatched by type first — some carry
    // sessionId (e.g., session_close) but are NOT session-plane.
    switch (msg.type) {
      case 'initialize':
        this.handleInitialize(anyMsg);
        return;
      case 'session_open':
        await this.handleSessionOpen(anyMsg);
        return;
      case 'session_close':
        this.handleSessionClose(anyMsg);
        return;
      case 'controller_health':
        this.handleControllerHealth(anyMsg);
        return;
    }

    // Everything else is session-plane — route to instance by sessionId (REQ-6)
    if (typeof anyMsg.sessionId === 'string') {
      this.routeToInstance(anyMsg.sessionId, msg);
      return;
    }

    this.sendError(msg.id, ErrorCode.UNKNOWN_MESSAGE_TYPE, `Unknown message type: ${msg.type}`);
  }

  // =========================================================================
  // Control plane handlers
  // =========================================================================

  /** REQ-2: Handshake and capability negotiation. */
  private handleInitialize(msg: Record<string, unknown>): void {
    const versions = msg.supportedVersions;
    const supports2 = Array.isArray(versions) && versions.includes('2.0');

    if (!supports2) {
      this.sendError(
        msg.id as string,
        ErrorCode.VERSION_UNSUPPORTED,
        'Only protocol version 2.0 is supported',
      );
      return;
    }

    this.initialized = true;
    // HOSTCAP-REQ-2: keep what the Host declared, minus the reserved flag.
    const host = (msg.host ?? {}) as { name?: string; version?: string };
    const { directConnection: _reserved, ...declared } = (msg.capabilities ?? {}) as Record<
      string,
      unknown
    >;
    this.host = { name: host.name ?? '', version: host.version ?? '', capabilities: declared };
    // A new initialize is a new connection: a single-user binding starts over.
    this.boundUserId = null;

    const response = {
      ...createEnvelope('initialized'),
      id: msg.id as string,
      negotiatedVersion: PROTOCOL_VERSION,
      app: { id: this.config.appId, version: this.config.appVersion },
      station: { version: APP_STATION_VERSION },
      capabilities: {
        directConnection: false,
        asyncOpen: false,
        push: true,
        extensions: [] as string[],
      },
      limits: {
        openTimeoutMs: this.openTimeoutMs,
        maxInflightPerSession: this.maxInflight,
      },
    };
    this.hostSend(response);
  }

  /** REQ-4, REQ-5: Tenant session open (idempotent, with instance reuse). */
  private async handleSessionOpen(msg: Record<string, unknown>): Promise<void> {
    if (!this.initialized) {
      this.sendError(
        msg.id as string,
        ErrorCode.INVALID_MESSAGE,
        'AppStation not initialized — send initialize first',
      );
      return;
    }

    const installationId = msg.installationId as string | undefined;
    const tenant = msg.tenant as { userId: string; workspaceId?: string } | undefined;

    if (!installationId || !tenant?.userId) {
      this.sendError(
        msg.id as string,
        ErrorCode.INVALID_MESSAGE,
        'session_open requires installationId and tenant.userId',
      );
      return;
    }

    // HOSTCAP-REQ-6: a single-user Host is bound to the Tenant of its first session.
    if (this.host.capabilities.multiUser !== true) {
      if (this.boundUserId !== null && this.boundUserId !== tenant.userId) {
        this.sendError(
          msg.id as string,
          ErrorCode.NOT_SUPPORTED,
          `This Host declared no multiUser support and is bound to another user; session_open as ${tenant.userId} rejected`,
        );
        return;
      }
      this.boundUserId = tenant.userId;
    }

    // Idempotent open (REQ-5): active session for same installation → return it
    for (const [sessionId, session] of this.sessions) {
      if (session.installationId === installationId) {
        const reopen = {
          ...createEnvelope('session_opened'),
          id: msg.id as string,
          sessionId,
          instance: { appVersion: this.config.appVersion },
          host: this.host,
        };
        this.hostSend(reopen);
        return;
      }
    }

    // Reuse live instance after session_close (REQ-5: instance lifetime ≠ session)
    const existing = this.instances.get(installationId);
    if (existing?.handle.isAlive()) {
      // Cancel idle timer — session is back
      if (existing.idleTimer) {
        clearTimeout(existing.idleTimer);
        existing.idleTimer = null;
      }

      const sessionId = generateSessionId();
      this.sessions.set(sessionId, {
        id: sessionId,
        installationId,
        tenant,
        permissions: effectivePermissionsOf(msg),
        pendingRequests: new Set(),
      });
      existing.sessions.add(sessionId);
      existing.lastActivity = Date.now();

      this.hostSend({
        ...createEnvelope('session_opened'),
        id: msg.id as string,
        sessionId,
        instance: { appVersion: this.config.appVersion },
        host: this.host,
      });
      this.notifySessionOpened(existing.handle, sessionId, installationId, tenant);
      return;
    }

    // Clean up dead instance if present
    if (existing) {
      existing.unsubscribe();
      if (existing.idleTimer) clearTimeout(existing.idleTimer);
      this.instances.delete(installationId);
    }

    // Check max instances (REQ-10)
    if (this.instances.size >= this.maxInstances) {
      this.sendError(
        msg.id as string,
        ErrorCode.CONTROLLER_AT_CAPACITY,
        'Maximum number of instances reached',
      );
      return;
    }

    // Spawn new instance with timeout (REQ-4)
    const sessionId = generateSessionId();
    this.emitSessionStatus(sessionId, 'starting');

    const spawnSpan = this.telemetry.startSpan('agentapps.spawn', {
      'app.id': this.config.appId,
      installationId,
    });
    const spawnStart = Date.now();

    const timeout = rejectAfterMs(this.openTimeoutMs);
    try {
      const handle = await Promise.race<InstanceHandle>([
        this.config.runtime.spawn({
          installationId,
          tenant,
          volumePath: this.config.resolveMountPath?.({
            installationId,
            tenant,
            effectivePermissions: msg.effectivePermissions as
              | { permissions?: { volume?: boolean } }
              | undefined,
          }),
        }),
        timeout.promise,
      ]);

      const spawnDuration = Date.now() - spawnStart;
      this.telemetry.histogram('agentapps.spawn.duration_ms', spawnDuration, {
        'app.id': this.config.appId,
      });
      this.telemetry.counter('agentapps.spawn.count', 1, { 'app.id': this.config.appId });
      spawnSpan.setStatus('ok');

      const now = Date.now();
      const managed: ManagedInstance = {
        installationId,
        handle,
        unsubscribe: () => {}, // placeholder — set below
        sessions: new Set([sessionId]),
        idleTimer: null,
        createdAt: now,
        lastActivity: now,
      };

      // Wire instance→host relay with security validation
      managed.unsubscribe = handle.onMessage((instanceMsg: MessageBase) => {
        this.relayInstanceMessage(managed, instanceMsg);
      });

      this.instances.set(installationId, managed);
      this.sessions.set(sessionId, {
        id: sessionId,
        installationId,
        tenant,
        permissions: effectivePermissionsOf(msg),
        pendingRequests: new Set(),
      });

      this.telemetry.counter('agentapps.session.open', 1, { 'app.id': this.config.appId });
      this.telemetry.gauge('agentapps.instances.active', this.instances.size, {
        'app.id': this.config.appId,
      });

      this.emitSessionStatus(sessionId, 'ready');

      this.hostSend({
        ...createEnvelope('session_opened'),
        id: msg.id as string,
        sessionId,
        instance: { appVersion: this.config.appVersion },
        host: this.host,
      });
      this.notifySessionOpened(handle, sessionId, installationId, tenant);
    } catch (err) {
      spawnSpan.setStatus('error', String(err));
      if (err instanceof SpawnTimeoutError) {
        this.sendError(msg.id as string, ErrorCode.TIMEOUT, err.message);
      } else {
        this.sendError(
          msg.id as string,
          ErrorCode.SPAWN_FAILED,
          `Failed to spawn instance: ${err}`,
        );
      }
    } finally {
      timeout.clear();
      spawnSpan.end();
    }
  }

  /** REQ-4: Session close. Does NOT immediately stop the instance (REQ-4). */
  private handleSessionClose(msg: Record<string, unknown>): void {
    const sessionId = msg.sessionId as string | undefined;

    if (!sessionId) {
      this.sendError(
        msg.id as string,
        ErrorCode.INVALID_MESSAGE,
        'session_close requires sessionId',
      );
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendError(
        msg.id as string,
        ErrorCode.SESSION_NOT_FOUND,
        `Session ${sessionId} not found`,
      );
      return;
    }

    // Remove session
    this.sessions.delete(sessionId);
    this.promptIds.delete(sessionId);
    this.telemetry.counter('agentapps.session.close', 1, { 'app.id': this.config.appId });

    // Update instance: remove session, start idle timer if no sessions left
    const managed = this.instances.get(session.installationId);
    if (managed) {
      managed.sessions.delete(sessionId);
      if (managed.sessions.size === 0) {
        this.resetIdleTimer(managed);
      }
    }

    this.hostSend({
      ...createEnvelope('session_closed'),
      id: msg.id as string,
      sessionId,
    });
  }

  /** REQ-8: Aggregated app station health. */
  private handleControllerHealth(msg: Record<string, unknown>): void {
    const verbose = (msg.verbose as boolean) ?? false;
    const allManaged = [...this.instances.values()];

    let readyCount = 0;
    let crashedCount = 0;
    const unhealthy: Array<Record<string, unknown>> = [];
    const allDetails: Array<Record<string, unknown>> = [];

    for (const managed of allManaged) {
      const alive = managed.handle.isAlive();
      const uptime = Math.floor((Date.now() - managed.createdAt) / 1000);
      const lastUsed = new Date(managed.lastActivity).toISOString();
      const status = alive ? 'ready' : 'crashed';

      if (alive) {
        readyCount++;
      } else {
        crashedCount++;
        if (unhealthy.length < 50) {
          unhealthy.push({
            instanceId: managed.handle.instanceId,
            installationId: managed.installationId,
            status,
            uptime,
            lastUsed,
          });
        }
      }

      if (verbose) {
        allDetails.push({
          instanceId: managed.handle.instanceId,
          installationId: managed.installationId,
          status,
          uptime,
          lastUsed,
        });
      }
    }

    const health: Record<string, unknown> = {
      ...createEnvelope('controller_health_status'),
      id: msg.id as string,
      status: crashedCount > 0 ? 'degraded' : 'ready',
      counts: {
        total: allManaged.length,
        ready: readyCount,
        degraded: 0,
        crashed: crashedCount,
        starting: 0,
      },
      unhealthy,
    };

    if (verbose) {
      health.instances = allDetails;
    }

    this.hostSend(health);
  }

  // =========================================================================
  // Session-plane routing (REQ-6, REQ-10)
  // =========================================================================

  private routeToInstance(sessionId: string, msg: MessageBase): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendError(msg.id, ErrorCode.SESSION_NOT_FOUND, `Session ${sessionId} not found`);
      return;
    }

    // Backpressure (REQ-10)
    if (session.pendingRequests.size >= this.maxInflight) {
      this.sendError(
        msg.id,
        ErrorCode.RATE_LIMITED,
        `Session ${sessionId} exceeds max in-flight (${this.maxInflight})`,
      );
      return;
    }

    const managed = this.instances.get(session.installationId);
    if (!managed?.handle.isAlive()) {
      this.sendError(
        msg.id,
        ErrorCode.SESSION_NOT_FOUND,
        `Instance for session ${sessionId} is no longer alive`,
      );
      return;
    }

    // Edge case of HOSTCAP: a Host that cannot receive pushed events cannot subscribe.
    if (msg.type === 'subscribe' && this.host.capabilities.push !== true) {
      this.sendError(
        msg.id,
        ErrorCode.NOT_SUPPORTED,
        'This Host declared no push support, so it cannot receive subscription events',
      );
      return;
    }

    // POLICY-REQ-8: keep the Effective Permissions the Host last announced.
    if (msg.type === 'permissions_changed') {
      session.permissions = effectivePermissionsOf(msg as Record<string, unknown>);
    }
    // POLICY-REQ-8: a basic profile carries no email and no avatar.
    if (msg.type === 'user_profile_result') {
      const anyMsg = msg as Record<string, unknown>;
      if (session.basicProfileRequests?.delete(anyMsg.requestId as string)) {
        const profile = anyMsg.profile as Record<string, unknown> | null;
        if (profile) {
          const { email: _email, avatarUrl: _avatar, ...basic } = profile;
          msg = { ...msg, profile: basic } as MessageBase;
        }
      }
    }

    // Track in-flight request
    session.pendingRequests.add(msg.id);

    // Reset idle timer on activity
    managed.lastActivity = Date.now();
    if (managed.idleTimer) {
      clearTimeout(managed.idleTimer);
      managed.idleTimer = null;
    }

    this.telemetry.counter('agentapps.message.sent', 1, {
      'app.id': this.config.appId,
      'message.type': msg.type,
    });

    // Proxy verbatim to the instance (REQ-6)
    managed.handle.send(msg);
  }

  // =========================================================================
  // Instance → Host relay
  // =========================================================================

  /**
   * Relay a message from an instance to the host.
   *
   * Security (REQ-7): validates sessionId on request types to prevent
   * a compromised instance from reading another tenant's secrets.
   */
  private relayInstanceMessage(managed: ManagedInstance, instanceMsg: MessageBase): void {
    const forwarded = { ...instanceMsg } as Record<string, unknown>;
    const msgSessionId = forwarded.sessionId as string | undefined;

    // Security: validate sessionId on request types (REQ-7)
    if (msgSessionId && INSTANCE_REQUEST_TYPES.has(forwarded.type as string)) {
      if (!managed.sessions.has(msgSessionId)) {
        // eslint-disable-next-line no-console
        console.error(
          `[app-station] Instance ${managed.installationId} sent request with ` +
            `sessionId ${msgSessionId} it doesn't own — dropped`,
        );
        return;
      }
    }

    // POLICY-REQ-8: Requests gated by a Manifest Permission, checked by name.
    if (msgSessionId && this.denyByPermission(managed, forwarded, msgSessionId)) return;

    // Security: validate promptId uniqueness per session to prevent replay attacks
    if (forwarded.type === 'prompt' && msgSessionId) {
      const promptId = forwarded.promptId as string | undefined;
      if (promptId) {
        let sessionPromptIds = this.promptIds.get(msgSessionId);
        if (!sessionPromptIds) {
          sessionPromptIds = new Set();
          this.promptIds.set(msgSessionId, sessionPromptIds);
        }
        if (sessionPromptIds.has(promptId)) {
          // eslint-disable-next-line no-console
          console.error(
            `[app-station] Duplicate promptId ${promptId} from session ${msgSessionId} — dropped`,
          );
          return;
        }
        sessionPromptIds.add(promptId);
        // Rate limit: warn if too many requests
        if (sessionPromptIds.size > 100) {
          // eslint-disable-next-line no-console
          console.warn(
            `[app-station] Session ${msgSessionId} has ${sessionPromptIds.size} pending requests — possible abuse`,
          );
        }
      }
    }

    // Track completed requests for backpressure
    if (msgSessionId) {
      const session = this.sessions.get(msgSessionId);
      if (session) {
        session.pendingRequests.delete(forwarded.id as string);
      }
    }

    this.telemetry.counter('agentapps.message.received', 1, {
      'app.id': this.config.appId,
      'message.type': forwarded.type as string,
    });

    this.hostSend(forwarded);
  }

  // =========================================================================
  // Idle timeout (REQ-4, REQ-5)
  // =========================================================================

  private resetIdleTimer(managed: ManagedInstance): void {
    if (managed.idleTimer) clearTimeout(managed.idleTimer);
    managed.idleTimer = setTimeout(() => {
      this.handleIdleTimeout(managed);
    }, this.idleTimeoutMs);
  }

  private handleIdleTimeout(managed: ManagedInstance): void {
    // Emit session_status: idle_stopped for any remaining sessions (REQ-5)
    for (const sessionId of managed.sessions) {
      this.emitSessionStatus(sessionId, 'idle_stopped');
      this.sessions.delete(sessionId);
    }
    managed.sessions.clear();

    // Stop instance
    managed.unsubscribe();
    managed.handle.stop(5_000).catch(() => {});
    this.instances.delete(managed.installationId);
    this.telemetry.gauge('agentapps.instances.active', this.instances.size, {
      'app.id': this.config.appId,
    });
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Emit a session_status notification to the host (REQ-5). */
  private emitSessionStatus(sessionId: string, status: string): void {
    this.hostSend({
      ...createEnvelope('session_status'),
      sessionId,
      status,
    });
  }

  /** Send a message to the host. */
  /**
   * Answer an Instance's Request with PERMISSION_DENIED when the Permission
   * it needs is not among the session's Effective Permissions. Returns true
   * when the Request was answered here and must not reach the Host.
   *
   * @spec POLICY-REQ-8
   */
  private denyByPermission(
    managed: ManagedInstance,
    msg: Record<string, unknown>,
    sessionId: string,
  ): boolean {
    const session = this.sessions.get(sessionId);
    const permissions = session?.permissions ?? {};
    const deny = (permission: string, result: Record<string, unknown>): true => {
      const reason = `The ${permission} Permission is not granted to this Installation`;
      // POLICY-NFR-1: every deny is audited.
      // eslint-disable-next-line no-console
      console.error(
        `[policy] deny: installation=${managed.installationId} request=${msg.type as string} permission=${permission} at=${new Date().toISOString()}`,
      );
      managed.handle.send({
        ...createEnvelope(result.type as string),
        sessionId,
        requestId: msg.requestId,
        ...result,
        ...(result.error === undefined
          ? {}
          : {
              error: {
                code: ErrorCode.PERMISSION_DENIED,
                message: reason,
                details: { layer: 'permission', permission, reason },
              },
            }),
      } as MessageBase);
      return true;
    };
    if (msg.type === 'intent_call' && permissions.intents !== true) {
      return deny('intents', { type: 'intent_result', success: false, error: true, duration: 0 });
    }
    if (msg.type === 'get_user_profile') {
      if (permissions.profile !== 'basic' && permissions.profile !== 'full') {
        managed.handle.send({
          ...createEnvelope('user_profile_result'),
          sessionId,
          requestId: msg.requestId,
          profile: null,
          error: 'The profile Permission is not granted to this Installation',
          code: ErrorCode.PERMISSION_DENIED,
        } as MessageBase);
        return true;
      }
      if (permissions.profile === 'basic' && session) {
        session.basicProfileRequests ??= new Set();
        session.basicProfileRequests.add(msg.requestId as string);
      }
    }
    return false;
  }

  private hostSend(msg: Record<string, unknown>): void {
    this.hostTransport?.send(msg as MessageBase);
  }

  /**
   * Tell the Instance its session is established and which Host is behind it
   * (HOSTCAP-REQ-2), so the SDK can expose `ctx.host`.
   */
  private notifySessionOpened(
    handle: InstanceHandle,
    sessionId: string,
    installationId: string,
    tenant: { userId: string; workspaceId?: string },
  ): void {
    handle.send({
      ...createEnvelope('session_opened'),
      sessionId,
      installationId,
      tenant,
      host: this.host,
    } as MessageBase);
  }

  /** Send an error response to the host. */
  private sendError(requestId: string, code: string, message: string): void {
    const err = {
      ...createEnvelope('error'),
      id: requestId,
      error: { code, message },
    };
    this.hostSend(err);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rejectAfterMs(ms: number): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SpawnTimeoutError(ms)), ms);
  });
  return {
    promise,
    clear: () => {
      if (timer) clearTimeout(timer);
    },
  };
}

/** The `permissions` object of a message's Effective Permissions, if any. */
function effectivePermissionsOf(msg: Record<string, unknown>): Record<string, unknown> | undefined {
  const ep = (msg.effectivePermissions ?? msg.permissions) as
    | { permissions?: Record<string, unknown> }
    | Record<string, unknown>
    | undefined;
  if (!ep) return undefined;
  return ('permissions' in ep ? ep.permissions : ep) as Record<string, unknown> | undefined;
}
