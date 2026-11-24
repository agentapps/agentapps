/**
 * A Gateway sees an app that became available after the Station started
 * (DIST-REQ-13): a real StationServer called over HTTP the way an MCP gateway
 * calls it.
 */

import { createEnvelope } from '@agentapps/protocol';
import { createApp } from '@agentapps/sdk';
import {
  type AppEntry,
  InMemoryDataStore,
  InMemorySecretStore,
  StationServer,
} from '@agentapps/station';
import { afterEach, describe, expect, it } from 'vitest';

const ADMIN_TOKEN = 'local-admin-token';

function pingApp() {
  const app = createApp({ id: 'app.late', version: '1.0.0', name: 'Late' });
  app.tool('ping', {
    description: 'Ping',
    parameters: { type: 'object', properties: {} },
    handler: async () => ({ pong: true }),
  });
  return app.toFactory();
}

let server: StationServer | undefined;
afterEach(async () => {
  await server?.stop();
  server = undefined;
});

async function post(url: string, body: unknown) {
  const res = await fetch(`${url}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function aliases(url: string): Promise<string[]> {
  const res = await fetch(`${url}/installations`, {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  const body = (await res.json()) as { installations: Array<{ alias: string }> };
  return body.installations.map((i) => i.alias);
}

describe('apps that arrive after the Station started', () => {
  it('[DIST-AC-13] a Gateway lists and calls an app installed after the start', async () => {
    // Nothing is downloaded when the Station starts.
    const available: AppEntry[] = [];
    const installed: Array<{ installationId: string; alias: string; appId: string }> = [];
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [],
      adminToken: ADMIN_TOKEN,
      installations: () => installed,
      discoverApps: async () => available.splice(0),
    });
    const { url } = await server.start(0, '127.0.0.1');
    expect(await aliases(url)).toEqual([]);

    // The user installs an app while the Station keeps running.
    available.push({ id: 'app.late', version: '1.0.0', name: 'Late', factory: pingApp() });
    installed.push({ installationId: 'ins_late', alias: 'late', appId: 'app.late' });

    expect(await aliases(url)).toEqual(['late']);
    const opened = await post(url, {
      ...createEnvelope('session_open'),
      installationId: 'ins_late',
      tenant: { userId: 'pablo', workspaceId: 'local' },
    });
    const result = await post(url, {
      ...createEnvelope('tool_call'),
      sessionId: opened.sessionId,
      tool: 'ping',
      arguments: {},
    });
    expect(result.result).toEqual({ pong: true });
  });
});
