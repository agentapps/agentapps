/**
 * Dev mode — embedded app station with hot reload.
 *
 * Watches src/app.ts and restarts the app station on changes.
 */

import { watch } from 'node:fs';
import { join } from 'node:path';
import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { loadFactory } from './load-app.js';

let appStation: AppStation | null = null;
let shutdownRequested = false;

async function start(cwd: string) {
  if (appStation) {
    await appStation.shutdown();
    appStation = null;
  }

  const factory = await loadFactory(cwd, true);
  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.dev',
    appVersion: '1.0.0',
    runtime,
  });

  const [host, controllerSide] = createInProcessTransportPair();
  appStation.accept(controllerSide);

  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    if (msg.type === 'tool_result') {
      console.log('\n✅ Tool result:', JSON.stringify(m.result, null, 2));
    } else if (msg.type === 'log') {
      console.log(`  📝 [${m.level}] ${m.message}`);
    } else if (msg.type === 'error') {
      console.error('\n❌ Error:', (m.error as Record<string, unknown>).message);
    }
  });

  // Initialize
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'dev-runner', version: '0.0.1' },
    capabilities: { directConnection: false },
  } as MessageBase);

  // Wait a bit for initialization
  await new Promise((r) => setTimeout(r, 100));

  console.log('🚀 Dev appStation ready. Watching src/ for changes...\n');
  console.log('  Press Ctrl+C to stop\n');
}

/** Whether a change to this file under src/ reloads the app. @spec DEVX-REQ-1 */
export function isSourceFile(filename: string): boolean {
  return /\.(ts|mts|js|mjs|json)$/.test(filename) && !filename.endsWith('.d.ts');
}

export async function dev(cwd = process.cwd()) {
  await start(cwd);

  // DEVX-REQ-1: any source file under src/ reloads the app, not only the entry module. One
  // save often arrives as several events, so they are folded into one reload.
  let pending: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(join(cwd, 'src'), { recursive: true }, (_event, filename) => {
    if (!filename || !isSourceFile(filename)) return;
    clearTimeout(pending);
    pending = setTimeout(async () => {
      console.log(`\n🔄 Detected change in ${filename}, reloading...\n`);
      try {
        await start(cwd);
      } catch (err) {
        console.error('\n❌ Reload failed:', err instanceof Error ? err.message : err);
      }
    }, 100);
  });

  process.on('SIGINT', async () => {
    if (shutdownRequested) return;
    shutdownRequested = true;
    console.log('\n\n🛑 Shutting down...');
    watcher.close();
    if (appStation) {
      await appStation.shutdown();
      appStation = null;
    }
    process.exit(0);
  });

  // Keep alive
  await new Promise(() => {});
}
