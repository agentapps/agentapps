#!/usr/bin/env node
/**
 * @agentapps/cli — background event watcher daemon.
 *
 * Self-contained entry point launched by the CLI's `subscribe` command.
 * Keeps a session open with an app, subscribes to the requested event types,
 * and prints each event as a JSON line to stdout.
 *
 * Usage (internal):
 *   node daemon.js <configPath> <alias> <eventType1> [eventType2...]
 */

import { loadWorkspaceConfig, resolveSourcePath } from './config.js';
import { resolveApp } from './resolve.js';
import { openAppSession } from './session.js';
import { getInstallation } from './state.js';

async function main(): Promise<void> {
  const [, , configPath, alias, ...eventTypes] = process.argv;

  if (!configPath || !alias || eventTypes.length === 0) {
    console.error('Usage: agentapps-daemon <configPath> <alias> <eventType...>');
    process.exit(2);
  }

  const config = loadWorkspaceConfig(configPath);
  const instance = getInstallation(configPath, alias);
  if (!instance) {
    console.error(`Unknown alias: ${alias}`);
    process.exit(2);
  }

  const entry = config.apps[instance.appId];
  if (!entry) {
    console.error(`App configuration missing for ${instance.appId}`);
    process.exit(2);
  }

  const source = resolveSourcePath(configPath, entry.source);
  const app = await resolveApp(instance.appId, source);

  const { session, shutdown } = await openAppSession(
    app,
    { cwd: process.cwd(), config, configPath },
    instance.installationId,
  );

  session.onEvent((event) => {
    console.log(JSON.stringify({ type: 'event', ...event }));
  });

  const subscriptionId = await session.subscribe(eventTypes);
  console.log(JSON.stringify({ type: 'subscribed', subscriptionId, eventTypes }));

  // Keep the process alive until the session is closed or the process is killed.
  process.on('SIGINT', async () => {
    await session.close();
    await shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await session.close();
    await shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
