/**
 * @agentapps/cli — Installations and sessions, through the Station.
 *
 * A command never loads an App: it asks the Station which Installations the
 * workspace has, and talks to an App through a session the Station opens.
 */

import { type StationClient, StationError } from './station-client.js';
import { writeCachedInstallations } from './tools-cache.js';
import type { HandlerResult } from './types.js';

export type AuthKind = 'oauth2' | 'api-key' | 'github-app' | 'none';

/** Whether an Installation can be used, as the Station reports it. */
export interface AuthInfo {
  authenticated: boolean;
  kind: AuthKind;
  provider?: string;
  scopes?: string[];
  expiresAt?: string;
  /** System secrets the App declares that are not set. */
  missingSecrets?: string[];
  /** Installation secrets the App declares that are not set. */
  missingUserSecrets?: string[];
}

/** An Installation as the Station describes it to its Workspace's Owner. */
export interface InstallationInfo {
  installationId: string;
  alias: string;
  appId: string;
  installedAt?: string;
  permissions?: Record<string, unknown>;
  /** False when the App is no longer available on the Station. */
  available?: boolean;
  name?: string;
  version?: string;
  declaredSecrets?: string[];
  setSecrets?: string[];
  /** Absent when the caller is not the Workspace's Owner. */
  auth?: AuthInfo;
}

/**
 * Human-readable status label with a ✓/● glyph the renderer colorizes.
 *
 * @spec STADMIN-REQ-6
 */
export function authStatusLabel(info: AuthInfo | undefined): string {
  if (!info) return '● unknown';
  if (info.kind === 'none') return '✓ ready';
  if (info.authenticated) {
    return info.kind === 'api-key' ? '✓ api key set' : '✓ authenticated';
  }
  if (info.kind === 'api-key') {
    const missing = [...(info.missingSecrets ?? []), ...(info.missingUserSecrets ?? [])];
    const names = missing.length ? missing.join(', ') : 'API key';
    return `● needs api key: ${names}`;
  }
  return '● needs login';
}

/**
 * The result for an alias the workspace does not have.
 *
 * @spec STADMIN-REQ-6
 */
export function unknownAlias(alias: string): HandlerResult {
  return {
    success: false,
    exitCode: 2,
    error: {
      message: `Unknown alias: ${alias}`,
      suggestion: `Run "installations" to see installed apps, or "install <app-id> ${alias}" to create it.`,
    },
  };
}

/**
 * Every Installation of the caller's Workspace. Owners get their auth status too.
 *
 * @spec STADMIN-REQ-6
 */
export async function listInstallations(station: StationClient): Promise<InstallationInfo[]> {
  try {
    const { installations } = await station.api<{ installations: InstallationInfo[] }>(
      'GET',
      '/api/installations',
    );
    writeCachedInstallations(station.configPath, installations);
    return installations;
  } catch (err) {
    // A Member administers nothing, but sees the Installations it may use.
    if (!(err instanceof StationError) || err.status !== 403) throw err;
    const { installations } = await station.api<{ installations: InstallationInfo[] }>(
      'GET',
      '/installations',
    );
    writeCachedInstallations(station.configPath, installations);
    return installations;
  }
}

/**
 * The Installation of an alias, or undefined when the workspace has none by that name.
 *
 * @spec STADMIN-REQ-6
 */
export async function findInstallation(
  station: StationClient,
  alias: string,
): Promise<InstallationInfo | undefined> {
  try {
    return await station.api<InstallationInfo>(
      'GET',
      `/api/installations/${encodeURIComponent(alias)}`,
    );
  } catch (err) {
    if (err instanceof StationError && err.status === 404) return undefined;
    if (!(err instanceof StationError) || err.status !== 403) throw err;
    return (await listInstallations(station)).find((i) => i.alias === alias);
  }
}

/**
 * The error a Station answer carries, in its `error` field, or undefined.
 *
 * @spec CLIENT-REQ-3
 */
export function errorOf(
  answer: Record<string, unknown>,
): { code?: string; message?: string; details?: Record<string, unknown> } | undefined {
  if (answer.error && typeof answer.error === 'object') {
    return answer.error as { code?: string; message?: string; details?: Record<string, unknown> };
  }
  if (typeof answer.error === 'string') return { message: answer.error };
  return undefined;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

/**
 * A session with an Installation, opened by the Station.
 *
 * @spec CLIENT-REQ-1
 */
export class StationSession {
  private constructor(
    private readonly station: StationClient,
    readonly installationId: string,
    private sessionId: string,
  ) {}

  static async open(station: StationClient, installationId: string): Promise<StationSession> {
    return new StationSession(
      station,
      installationId,
      await StationSession.openId(station, installationId),
    );
  }

  private static async openId(station: StationClient, installationId: string): Promise<string> {
    const opened = await station.message({
      type: 'session_open',
      installationId,
      tenant: { userId: 'cli' },
    });
    if (typeof opened.sessionId !== 'string') {
      const error = errorOf(opened);
      throw new Error(error?.message ?? 'The Station did not open a session');
    }
    return opened.sessionId;
  }

  /**
   * Send a message on this session. A Station that restarted has forgotten
   * its sessions, so an unknown session is opened again once.
   */
  async send(
    message: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>> {
    const answer = await this.station.message({ ...message, sessionId: this.sessionId }, timeoutMs);
    if (errorOf(answer)?.code !== 'SESSION_NOT_FOUND') return answer;
    this.sessionId = await StationSession.openId(this.station, this.installationId);
    return this.station.message({ ...message, sessionId: this.sessionId }, timeoutMs);
  }

  /** The id of the session at the Station right now. */
  get id(): string {
    return this.sessionId;
  }

  async listTools(): Promise<ToolDefinition[]> {
    const listed = await this.send({ type: 'list_tools' });
    if (!Array.isArray(listed.tools)) {
      throw new Error(errorOf(listed)?.message ?? 'The Station did not list the tools');
    }
    return listed.tools as ToolDefinition[];
  }

  async close(): Promise<void> {
    await this.station
      .message({ type: 'session_close', sessionId: this.sessionId })
      .catch(() => {});
  }
}

/**
 * Sessions kept for the life of the interactive mode: one per alias, so an
 * App keeps its state across commands.
 * @spec CLIENT-NFR-1
 */
export class StationSessions {
  private readonly sessions = new Map<string, StationSession>();

  async acquire(
    station: StationClient,
    alias: string,
    installationId: string,
  ): Promise<StationSession> {
    const existing = this.sessions.get(alias);
    if (existing && existing.installationId === installationId) return existing;
    const session = await StationSession.open(station, installationId);
    this.sessions.set(alias, session);
    return session;
  }

  /** Close and forget the session of an alias (uninstall, rename, failure). */
  async release(alias: string): Promise<void> {
    const session = this.sessions.get(alias);
    if (!session) return;
    this.sessions.delete(alias);
    await session.close();
  }

  async closeAll(): Promise<void> {
    for (const alias of [...this.sessions.keys()]) await this.release(alias);
  }
}

/**
 * Run `fn` with a session of an Installation: the interactive mode's own when
 * there is one, otherwise one that is closed afterwards.
 * @spec CLIENT-REQ-1
 */
export async function withSession<T>(
  station: StationClient,
  installation: { alias: string; installationId: string },
  pool: StationSessions | undefined,
  fn: (session: StationSession) => Promise<T>,
): Promise<T> {
  if (pool) {
    try {
      return await fn(await pool.acquire(station, installation.alias, installation.installationId));
    } catch (err) {
      // A thrown error usually means the session is broken: start afresh next time.
      await pool.release(installation.alias).catch(() => {});
      throw err;
    }
  }
  const session = await StationSession.open(station, installation.installationId);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}
