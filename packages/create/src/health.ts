/**
 * Health command: runs the app's health check once, in-process, against the real service.
 *
 * User and system secrets come from environment variables with the same names as the
 * manifest's `auth.installationSecrets` and `auth.systemSecrets` (e.g. `SERVICE_API_KEY=...
 * create-agent-app health`; for an OAuth app, a current `ACCESS_TOKEN`). Values are never
 * printed: the report lists which names were set. There is no station here, so a token
 * refresh is answered with an error that says so.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { loadFactory } from './load-app.js';

/** The host gives up on a health check after 10 s; so do we. */
export const HEALTH_TIMEOUT_MS = 10_000;

export interface HealthReport {
  status: string;
  message?: string;
  issues?: unknown;
  durationMs: number;
  secretsSet: string[];
  secretsMissing: string[];
}

export async function health(options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const manifestPath = join(cwd, 'agentapp.json');
  if (!existsSync(manifestPath)) throw new Error(`No agentapp.json in ${cwd}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  const names = (key: 'installationSecrets' | 'systemSecrets'): string[] =>
    Array.isArray(manifest.auth?.[key]) ? manifest.auth[key] : [];
  const fromEnv = (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => env[k]).map((k) => [k, env[k] as string]));
  const declared = [...names('installationSecrets'), ...names('systemSecrets')];
  const installationSecrets = fromEnv(names('installationSecrets'));
  const systemSecrets = fromEnv(names('systemSecrets'));
  const secrets = { ...systemSecrets, ...installationSecrets };

  const appStation = new AppStation({
    appId: manifest.id,
    appVersion: manifest.version,
    runtime: new InProcessRuntime(await loadFactory(cwd)),
  });
  const [host, ctrlSide] = createInProcessTransportPair();
  const received: Array<Record<string, unknown>> = [];
  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    received.push(m);
    const requestId = (m.requestId as string) ?? (m.id as string);
    const reply = (type: string, body: Record<string, unknown>) =>
      host.send({
        ...createEnvelope(type, m.sessionId as string),
        id: requestId,
        requestId,
        ...body,
      } as MessageBase);
    if (m.type === 'get_installation_secrets')
      reply('installation_secrets', { secrets: installationSecrets });
    if (m.type === 'get_system_secrets') reply('system_secrets', { secrets: systemSecrets });
    if (m.type === 'refresh_token') {
      reply('refresh_token_response', {
        accessToken: '',
        error: 'create-agent-app health cannot refresh tokens: export a current ACCESS_TOKEN',
      });
    }
  });
  appStation.accept(ctrlSide);

  const waitFor = async (type: string, timeoutMs: number) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = received.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`No ${type} within ${timeoutMs / 1000} s`);
  };

  try {
    host.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'create-agent-app health', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitFor('initialized', 5_000);
    host.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_health',
      tenant: { userId: 'health' },
    } as MessageBase);
    const opened = await waitFor('session_opened', 5_000);
    const started = Date.now();
    host.send({
      ...createEnvelope('health_check'),
      sessionId: opened.sessionId as string,
    } as MessageBase);
    const status = await waitFor('health_status', HEALTH_TIMEOUT_MS);
    const report: HealthReport = {
      status: String(status.status),
      message: status.message as string | undefined,
      issues: status.issues,
      durationMs: Date.now() - started,
      secretsSet: Object.keys(secrets),
      secretsMissing: declared.filter((k) => !secrets[k]),
    };
    return report;
  } finally {
    await appStation.shutdown();
  }
}
