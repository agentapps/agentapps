/**
 * Loads an app the way a host does and reports what it really registers: the tool list
 * with each tool's annotations (from `list_tools`, through the station app station), and
 * the manifest that `createApp()` would generate when the module exports `app`.
 *
 * check-app uses this instead of reading the source, so tools registered through helpers,
 * annotations shared through constants and annotations that only appear in comments are
 * all seen as the host sees them.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type ToolDefinition,
} from '@agentapps/protocol';
import type { AppFactory } from '@agentapps/sdk';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { importAppModule } from './load-app.js';

export interface AppInspection {
  tools: ToolDefinition[];
  /** `app.toManifest()` when the entry module exports `app`; undefined otherwise. */
  generatedManifest?: unknown;
}

/** The entry module and export named by agentapp.json (default src/app.ts, `factory`). */
function entrypoint(cwd: string): { path: string; exportName: string } {
  const manifestPath = join(cwd, 'agentapp.json');
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const ep = manifest.entrypoint;
    if (ep && typeof ep.path === 'string') {
      return { path: join(cwd, ep.path), exportName: ep.export ?? 'default' };
    }
  } catch {
    // Fall through to the conventional location.
  }
  return { path: join(cwd, 'src', 'app.ts'), exportName: 'factory' };
}

/** Raised instead of exiting when the app calls process.exit while it is being inspected. */
class AppCalledExit extends Error {}

/** Rejects after `ms` with `message`; the timer keeps the event loop alive until then. */
function deadline(ms: number, message: string): { promise: Promise<never>; cancel: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export interface InspectOptions {
  /** How long loading the entry module may take (default 10 s). */
  loadTimeoutMs?: number;
  /** How long each protocol reply may take (default 10 s). */
  timeoutMs?: number;
}

/**
 * Loads the app and lists its tools. App code cannot end the process meanwhile: a call to
 * process.exit becomes an error, and a module that never finishes loading (a top-level
 * await that never settles) fails after `loadTimeoutMs`.
 */
export async function inspectApp(
  dir: string,
  options: InspectOptions = {},
): Promise<AppInspection> {
  const realExit = process.exit;
  process.exit = ((code?: number) => {
    throw new AppCalledExit(
      `The app called process.exit(${code ?? ''}) while being loaded or listed; an app must never exit the host process`,
    );
  }) as typeof process.exit;
  try {
    return await inspect(dir, options);
  } finally {
    process.exit = realExit;
  }
}

async function inspect(dir: string, options: InspectOptions): Promise<AppInspection> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const loadTimeoutMs = options.loadTimeoutMs ?? 10_000;
  const cwd = resolve(dir);
  const ep = entrypoint(cwd);
  if (!existsSync(ep.path)) throw new Error(`Entry module not found: ${ep.path}`);
  const loading = deadline(
    loadTimeoutMs,
    `The app did not finish loading within ${loadTimeoutMs / 1000} s (a top-level await that never settles?)`,
  );
  let mod: Record<string, unknown>;
  try {
    mod = await Promise.race([importAppModule(ep.path), loading.promise]);
  } finally {
    loading.cancel();
  }
  const factory = (mod[ep.exportName] ?? mod.factory ?? mod.default) as AppFactory | undefined;
  if (typeof factory !== 'function') {
    throw new Error(`${ep.path} does not export a factory named "${ep.exportName}"`);
  }
  const app = mod.app as { toManifest?: () => unknown } | undefined;
  const generatedManifest = typeof app?.toManifest === 'function' ? app.toManifest() : undefined;

  const appStation = new AppStation({
    appId: 'app.inspect',
    appVersion: '0.0.0',
    runtime: new InProcessRuntime(factory),
  });
  const [host, ctrlSide] = createInProcessTransportPair();
  const received: Array<Record<string, unknown>> = [];
  host.onMessage((msg) => received.push(msg as Record<string, unknown>));
  appStation.accept(ctrlSide);

  const waitFor = async (type: string) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = received.find((m) => m.type === type);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`The app did not answer ${type} within ${timeoutMs / 1000} s`);
  };

  try {
    host.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'check-app', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitFor('initialized');
    host.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_check',
      tenant: { userId: 'check' },
    } as MessageBase);
    const opened = await waitFor('session_opened');
    host.send({ ...createEnvelope('list_tools'), sessionId: opened.sessionId } as MessageBase);
    const list = await waitFor('tools_list');
    return { tools: (list.tools as ToolDefinition[]) ?? [], generatedManifest };
  } finally {
    await appStation.shutdown();
  }
}
