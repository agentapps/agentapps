/**
 * StationServer: Annotations are known before a Policy is evaluated
 * (POLICY-REQ-16).
 */

import { ADMIN_PRINCIPAL_ID } from '@agentapps/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppFactory } from '../src/in-process-runtime.js';
import { InMemoryDataStore, InMemorySecretStore } from '../src/index.js';
import { defaultPolicy } from '../src/permission-enforcer.js';
import { InMemoryPolicyStore } from '../src/policy-store.js';
import { StationServer } from '../src/server.js';

const APP = 'app.t';
type Json = Record<string, unknown>;

describe('StationServer and Annotations it has not seen yet', () => {
  let server: StationServer | undefined;
  let url = '';
  let executed: string[] = [];

  afterEach(async () => {
    await server?.stop();
    server = undefined;
    executed = [];
  });

  /** An app whose tool `wipe` is destructive. `listable` says whether it answers `list_tools`. */
  const app =
    (listable: boolean): AppFactory =>
    (transport) => {
      transport.onMessage((msg) => {
        const m = msg as Json;
        const base = {
          id: m.id,
          timestamp: new Date().toISOString(),
          version: '2.0',
          sessionId: m.sessionId,
        };
        if (m.type === 'list_tools' && listable) {
          const tools = [{ name: 'wipe', annotations: { destructiveHint: true, sensitive: true } }];
          transport.send({ ...base, type: 'tools_list', tools } as never);
        }
        if (m.type === 'tool_call') {
          executed.push(m.tool as string);
          transport.send({ ...base, type: 'tool_result', result: 'ran' } as never);
        }
      });
    };

  const post = (body: Json): Promise<Response> =>
    fetch(`${url}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timestamp: new Date().toISOString(), version: '2.0', ...body }),
    });

  /** A Station with the default Policy, as after a restart: no `list_tools` relayed yet. */
  async function start(listable: boolean): Promise<string> {
    const policies = new InMemoryPolicyStore();
    await policies.put(defaultPolicy(ADMIN_PRINCIPAL_ID));
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [{ id: APP, version: '1.0.0', factory: app(listable) }],
      policies,
    });
    url = (await server.start(0, '127.0.0.1')).url;
    const opened = (await (
      await post({
        id: 'open-1',
        type: 'session_open',
        installationId: APP,
        tenant: { userId: 'u', workspaceId: 'w' },
      })
    ).json()) as Json;
    return opened.sessionId as string;
  }

  const pending = async (): Promise<Array<{ id: string; tool: string }>> =>
    ((await (await fetch(`${url}/approvals`)).json()) as { approvals: [] }).approvals;

  it('[POLICY-AC-18] a destructive tool called before any list_tools waits for approval', async () => {
    const sessionId = await start(true);
    const call = post({ id: 'call-1', type: 'tool_call', sessionId, tool: 'wipe', arguments: {} });

    let waiting = await pending();
    for (let i = 0; i < 200 && waiting.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 10));
      waiting = await pending();
    }
    expect(waiting.map((a) => a.tool)).toEqual(['wipe']);
    expect(executed).toEqual([]);

    await fetch(`${url}/approvals/${waiting[0].id}`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'deny' }),
    });
    expect((await call).status).toBe(403);
    expect(executed).toEqual([]);
  });

  it('[POLICY-AC-18] a call is refused when the tools cannot be listed', async () => {
    const sessionId = await start(false);
    const res = await post({
      id: 'call-1',
      type: 'tool_call',
      sessionId,
      tool: 'wipe',
      arguments: {},
    });
    const body = (await res.json()) as { error: { code: string; details: { rule: string } } };
    expect(res.status).toBe(403);
    expect(body.error.code).toBe('PERMISSION_DENIED');
    expect(body.error.details.rule).toBe('annotations-unknown');
    expect(executed).toEqual([]);
  }, 30_000);
});
