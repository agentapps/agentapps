#!/usr/bin/env node
/**
 * @agentapps/cli — background watcher of an Installation's events.
 *
 * Started detached by `<alias> subscribe`. It subscribes through the Station
 * and follows the session's event stream, printing one JSON line per event,
 * until it is told to stop.
 *
 * Usage: agentapps-daemon <configPath> <alias> <eventType...>
 */

import { loadWorkspaceConfig } from './config.js';
import { StationClient, stationCredential } from './station-client.js';
import { findInstallation, StationSession } from './station-session.js';

async function main(): Promise<void> {
  const [, , configPath, alias, ...eventTypes] = process.argv;

  if (!configPath || !alias || eventTypes.length === 0) {
    console.error('Usage: agentapps-daemon <configPath> <alias> <eventType...>');
    process.exit(2);
  }

  const config = loadWorkspaceConfig(configPath);
  const station = StationClient.for({ cwd: process.cwd(), config, configPath });
  if (!(station instanceof StationClient)) {
    console.error(station.error?.message ?? 'No Station to connect to');
    process.exit(2);
  }
  const instance = await findInstallation(station, alias);
  if (!instance) {
    console.error(`Unknown alias: ${alias}`);
    process.exit(2);
  }

  // The session, and with it the Instance, lives as long as this process.
  const session = await StationSession.open(station, instance.installationId);
  const subscribed = await session.send({ type: 'subscribe', eventTypes });
  if (subscribed.success === false) {
    console.error(String(subscribed.error ?? 'Subscribe failed'));
    process.exit(2);
  }
  console.log(
    JSON.stringify({ type: 'subscribed', subscriptionId: subscribed.subscriptionId, eventTypes }),
  );

  const stop = async (): Promise<void> => {
    await session.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const token = stationCredential(configPath, station.url)?.token;
  const stream = await fetch(`${station.url}/events?sessionId=${encodeURIComponent(session.id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!stream.ok || !stream.body) {
    console.error(`The Station did not open the event stream (${stream.status})`);
    process.exit(2);
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    let end = buffer.indexOf('\n\n');
    while (end >= 0) {
      const data = buffer
        .slice(0, end)
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .join('\n');
      if (data) console.log(JSON.stringify({ ...JSON.parse(data), type: 'event' }));
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf('\n\n');
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
