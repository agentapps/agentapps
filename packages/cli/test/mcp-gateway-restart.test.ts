/**
 * The MCP gateway (CLI-REQ-6) keeps running tools after its station restarted:
 * the new station does not know the gateway's session, so the gateway opens
 * another one.
 */

import { createApp } from '@agentapps/sdk';
import {
  generateApiKey,
  InMemoryApiKeyStore,
  InMemoryPolicyStore,
  StationServer,
} from '@agentapps/station';
import { afterEach, describe, expect, it } from 'vitest';
import { InstallationGateway, type StationTarget } from '../src/mcp-gateway.js';

function pingApp(id: string) {
  const app = createApp({ id, version: '1.0.0', name: id });
  app.tool('ping', {
    description: 'Ping',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ pong: id }),
  });
  return app.toFactory();
}

let server: StationServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

/** A station with two apps, so an unknown session is not routed to the right one by luck. */
async function startStation(key: { hash: string; prefix: string }): Promise<string> {
  const apiKeys = new InMemoryApiKeyStore();
  const now = new Date().toISOString();
  await apiKeys.create({
    id: 'ak_cc',
    name: 'claude-code',
    keyHash: key.hash,
    prefix: key.prefix,
    identity: { userId: 'pablo' },
    principalId: 'ak_cc',
    createdAt: now,
    updatedAt: now,
  });
  server = new StationServer({
    apps: [
      { id: 'app.first', version: '1.0.0', factory: pingApp('app.first') },
      { id: 'app.second', version: '1.0.0', factory: pingApp('app.second') },
    ],
    apiKeys,
    policies: new InMemoryPolicyStore(),
    installations: () => [{ installationId: 'ins_second', alias: 'second', appId: 'app.second' }],
  });
  return (await server.start(0, '127.0.0.1')).url;
}

describe('agentapps mcp across a station restart', () => {
  it('[CLI-AC-6] runs a tool after the station restarted and forgot the session', async () => {
    const key = generateApiKey();
    let target: StationTarget = { url: await startStation(key), key: key.raw, userId: 'pablo' };
    const logs: string[] = [];
    const gateway = new InstallationGateway(
      () => target,
      (line) => logs.push(line),
    );

    await gateway.refresh();
    expect(gateway.list().map((t) => t.name)).toEqual(['second__ping']);
    const before = await gateway.call('second__ping', {});
    expect(before.isError).toBe(false);
    expect(before.text).toContain('app.second');

    await server?.stop();
    target = { ...target, url: await startStation(key) };

    const after = await gateway.call('second__ping', {});
    expect(after.text).toContain('app.second');
    expect(after.isError).toBe(false);
  }, 30_000);
});
