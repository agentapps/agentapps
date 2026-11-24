/**
 * @agentapps/cli — the CLI as a client of one Station.
 *
 * Every command that needs the Station goes through here: it finds the
 * Station at `cli.stationUrl`, carries the CLI's credential, and turns what
 * goes wrong into the message the user should read.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { writeSecretFile } from './secrets-store.js';
import { readStationMeta } from './station-lifecycle.js';
import { cliStationUrl, isLocalStationUrl, stationUnreachable } from './station-url.js';
import type { CliContext, HandlerResult } from './types.js';

/**
 * A request the Station answered with an error.
 *
 * @spec STADMIN-REQ-6
 */
export class StationError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | undefined,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StationError';
  }
}

/**
 * The Station did not answer at all, as opposed to answering with an error.
 *
 * @spec CLIENT-REQ-5
 */
export class StationUnreachableError extends Error {
  constructor(readonly stationUrl: string) {
    super(`The Station at ${stationUrl} did not answer`);
    this.name = 'StationUnreachableError';
  }
}

/** The CLI has no credential for the Station it points at. @spec CLIENT-REQ-4 */
export class NoStationCredentialError extends Error {
  constructor(readonly stationUrl: string) {
    super(`The CLI has no credential for the Station at ${stationUrl}`);
    this.name = 'NoStationCredentialError';
  }
}

// ── Station logins ──────────────────────────────────────────────────────────
// The API Key `station login` stored for a Station, kept in the CLI's secret
// store under that Station's URL (CLIENT-REQ-8).

function loginPath(configPath: string, stationUrl: string): string {
  const name = createHash('sha256').update(normalizeUrl(stationUrl)).digest('hex').slice(0, 24);
  return resolve(dirname(resolve(configPath)), '.secrets', 'stations', `${name}.json`);
}

function normalizeUrl(stationUrl: string): string {
  return stationUrl.replace(/\/+$/, '');
}

/** @spec CLIENT-REQ-8 */
export function loadStationLogin(configPath: string, stationUrl: string): string | undefined {
  const path = loginPath(configPath, stationUrl);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { key?: unknown };
    return typeof parsed.key === 'string' && parsed.key !== '' ? parsed.key : undefined;
  } catch {
    return undefined;
  }
}

/** @spec CLIENT-REQ-8 */
export function saveStationLogin(configPath: string, stationUrl: string, key: string): void {
  const path = loginPath(configPath, stationUrl);
  mkdirSync(dirname(path), { recursive: true });
  writeSecretFile(path, { url: normalizeUrl(stationUrl), key });
}

/** Remove the login of a Station. Answers whether there was one. @spec CLIENT-REQ-8 */
export function removeStationLogin(configPath: string, stationUrl: string): boolean {
  const path = loginPath(configPath, stationUrl);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}

/** Whether two URLs name the same Station, taking every name of this machine as one. */
function sameStation(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    if (left.origin === right.origin) return true;
    return (
      isLocalStationUrl(a) &&
      isLocalStationUrl(b) &&
      left.protocol === right.protocol &&
      left.port === right.port
    );
  } catch {
    return false;
  }
}

/**
 * The credential the CLI uses for a Station: the key `station login` stored
 * for it, or the admin credential recorded when this workspace started it.
 * It is never sent to any other Station.
 *
 * @spec CLIENT-REQ-4
 */
export function stationCredential(
  configPath: string,
  stationUrl: string,
): { token: string; kind: 'login' | 'admin' } | undefined {
  const login = loadStationLogin(configPath, stationUrl);
  if (login) return { token: login, kind: 'login' };
  const meta = readStationMeta(configPath);
  if (meta?.adminToken && sameStation(meta.url, stationUrl)) {
    return { token: meta.adminToken, kind: 'admin' };
  }
  return undefined;
}

/** How long a request to the Station may take; a tool call may take longer. */
const REQUEST_TIMEOUT_MS = 30_000;

let messageCounter = 0;

/**
 * A client of the Station at `cli.stationUrl`.
 *
 * @spec CLIENT-REQ-1
 */
export class StationClient {
  private constructor(
    readonly url: string,
    /** The workspace config this client belongs to: where its credential is kept. */
    readonly configPath: string,
  ) {}

  /** The client for a workspace, or the error to return when it names no Station. */
  static for(ctx: CliContext): StationClient | HandlerResult {
    const url = cliStationUrl(ctx.config);
    if (typeof url !== 'string') return url;
    return new StationClient(url, ctx.configPath);
  }

  /** A client for a given URL, whatever the workspace config says. */
  static at(stationUrl: string, configPath: string): StationClient {
    return new StationClient(normalizeUrl(stationUrl), configPath);
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    timeoutMs: number,
    token?: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const credential = token ?? stationCredential(this.configPath, this.url)?.token;
    let response: Response;
    try {
      if (!credential) {
        // No credential: say that only if there is a Station to give it to.
        await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(5_000) });
        throw new NoStationCredentialError(this.url);
      }
      response = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credential}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof NoStationCredentialError) throw err;
      throw new StationUnreachableError(this.url);
    }
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      const json = text ? JSON.parse(text) : {};
      if (json && typeof json === 'object' && !Array.isArray(json)) parsed = json;
    } catch {
      parsed = { error: text };
    }
    return { status: response.status, body: parsed };
  }

  /**
   * One operation of the Station. Answers its body, or throws a `StationError`
   * when the Station refuses.
   *
   * @spec STADMIN-REQ-6
   */
  async api<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
    options: { token?: string } = {},
  ): Promise<T> {
    const answer = await this.send(method, path, body, REQUEST_TIMEOUT_MS, options.token);
    if (answer.status >= 400) {
      const message =
        typeof answer.body.error === 'string' ? answer.body.error : `HTTP ${answer.status}`;
      const code = typeof answer.body.code === 'string' ? answer.body.code : undefined;
      throw new StationError(answer.status, message, code, answer.body);
    }
    return answer.body as T;
  }

  /**
   * One protocol message to an App through the Station, on the route a
   * Gateway uses, so the caller's Policy and Approvals apply to it.
   *
   * @spec CLIENT-REQ-3
   */
  async message(
    message: Record<string, unknown>,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> {
    const answer = await this.send(
      'POST',
      '/messages',
      {
        id: `cli-${process.pid}-${++messageCounter}`,
        timestamp: new Date().toISOString(),
        version: '2.0',
        ...message,
      },
      timeoutMs,
    );
    if (answer.status === 401) {
      throw new StationError(401, 'Unauthorized', 'UNAUTHORIZED', answer.body);
    }
    return answer.body;
  }

  /** Who the CLI is to this Station. */
  whoami(token?: string): Promise<{
    stationId: string;
    principalId: string;
    operator: boolean;
    owner: boolean;
    workspaceId: string | null;
    role: string;
  }> {
    return this.api('GET', '/api/whoami', undefined, token ? { token } : {});
  }

  /**
   * The result of a command that could not talk to the Station, or was
   * refused by it; anything else is thrown again.
   *
   * @spec CLIENT-REQ-5
   */
  failure(err: unknown): HandlerResult {
    return stationFailure(err);
  }
}

/**
 * Turn what went wrong with the Station into a command's result.
 *
 * @spec CLIENT-REQ-5
 */
export function stationFailure(err: unknown): HandlerResult {
  if (err instanceof StationUnreachableError) return stationUnreachable(err.stationUrl);
  if (err instanceof NoStationCredentialError) {
    return {
      success: false,
      exitCode: 2,
      error: {
        message: `There is no credential for the Station at ${err.stationUrl}.`,
        suggestion: 'Store one with:\n  agentapps station login',
      },
    };
  }
  if (err instanceof StationError) {
    if (err.status === 401) {
      return {
        success: false,
        exitCode: 2,
        error: {
          message: "The Station did not accept the CLI's credential.",
          suggestion: 'Store a valid one with:\n  agentapps station login',
        },
      };
    }
    return { success: false, exitCode: 2, error: { message: err.message } };
  }
  throw err;
}

/**
 * The client of a command's workspace, or the result to return.
 *
 * @spec CLIENT-REQ-1
 */
export function stationOf(context: { ctx: CliContext }): StationClient | HandlerResult {
  return StationClient.for(context.ctx);
}

/**
 * Whether a value is a command's result and not a client.
 *
 * @spec CLIENT-REQ-1
 */
export function isResult(value: StationClient | HandlerResult): value is HandlerResult {
  return !(value instanceof StationClient);
}
