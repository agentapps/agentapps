/**
 * @agentapps/cli — persistent per-instance app sessions for the REPL.
 *
 * One-shot commands open and close a session per invocation. Inside the REPL
 * that lifecycle resets stateful apps between commands (e.g. the playwright
 * app's headless browser navigated somewhere just to be torn down) and leaks
 * whatever the app left running. The REPL instead holds one session per alias
 * for the life of the process: acquired lazily on first use, reused across
 * commands, and closed on uninstall/rename/exit — or dropped by the command
 * when a call fails at the transport level, so the next use starts fresh.
 */

import { resolveSourcePath } from './config.js';
import { resolveApp } from './resolve.js';
import { openAppSession } from './session.js';
import { getInstallation } from './state.js';
import type { CliContext, ResolvedApp } from './types.js';

/** Pooled sessions live until the REPL exits; don't let the app station idle them out. */
const POOLED_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export interface PooledSession {
  app: ResolvedApp;
  session: Awaited<ReturnType<typeof openAppSession>>['session'];
  shutdown: () => Promise<void>;
}

export class SessionPool {
  private readonly sessions = new Map<string, PooledSession>();

  /** Get the live session for an alias, opening it on first use. */
  async acquire(alias: string, appId: string, ctx: CliContext): Promise<PooledSession> {
    const existing = this.sessions.get(alias);
    if (existing) return existing;

    const entry = ctx.config.apps[appId];
    if (!entry) {
      throw new Error(`App configuration missing for ${appId}`);
    }
    const source = resolveSourcePath(ctx.configPath, entry.source);
    const app = await resolveApp(appId, source);
    // Sessions resolve per-installation secrets by installationId, never by alias.
    const installationId = getInstallation(ctx.configPath, alias)?.installationId;
    const { session, shutdown } = await openAppSession(app, ctx, installationId, {
      idleTimeoutMs: POOLED_IDLE_TIMEOUT_MS,
    });

    const pooled: PooledSession = { app, session, shutdown };
    this.sessions.set(alias, pooled);
    return pooled;
  }

  /** Close and forget the session for an alias (uninstall, rename, failure). */
  async release(alias: string): Promise<void> {
    const pooled = this.sessions.get(alias);
    if (!pooled) return;
    this.sessions.delete(alias);
    try {
      await pooled.session.close();
    } catch {
      // The session may already be dead — releasing must not fail.
    }
    try {
      await pooled.shutdown();
    } catch {
      // Same: best-effort teardown.
    }
  }

  /** Close every pooled session (REPL exit). */
  async closeAll(): Promise<void> {
    const aliases = [...this.sessions.keys()];
    await Promise.all(aliases.map((alias) => this.release(alias)));
  }
}
