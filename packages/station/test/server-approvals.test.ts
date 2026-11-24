/**
 * StationServer: parked calls against their Session and their caller
 * (POLICY-REQ-13, POLICY-REQ-14).
 */

import { ADMIN_PRINCIPAL_ID } from '@agentapps/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppFactory } from '../src/in-process-runtime.js';
import { InMemoryDataStore, InMemorySecretStore } from '../src/index.js';
import { defaultPolicy } from '../src/permission-enforcer.js';
import { InMemoryPolicyStore } from '../src/policy-store.js';
import { StationServer } from '../src/server.js';

const APP = 'app.t';
type Json = Record<string, unknown>;

describe('StationServer parked calls', () => {
  let server: StationServer | undefined;
  let url = '';
  let executed: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await server?.stop();
    server = undefined;
    executed = [];
  });

  /** An app with `risky` (asks under the Policy below) and `safe` (allowed). */
  const factory: AppFactory = (transport) => {
    transport.onMessage((msg) => {
      const m = msg as Json;
      const base = {
        id: m.id,
        timestamp: new Date().toISOString(),
        version: '2.0',
        sessionId: m.sessionId,
      };
      // POLICY-REQ-16: the Station lists the tools before it evaluates the Policy.
      if (m.type === 'list_tools') {
        const tools = [{ name: 'risky' }, { name: 'safe' }];
        transport.send({ ...base, type: 'tools_list', tools } as never);
      }
      if (m.type === 'tool_call') {
        executed.push(m.tool as string);
        transport.send({ ...base, type: 'tool_result', result: 'ran' } as never);
      }
    });
  };

  function post(body: Json, signal?: AbortSignal): Promise<Response> {
    return fetch(`${url}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify({ timestamp: new Date().toISOString(), version: '2.0', ...body }),
    });
  }

  async function openSession(id: string): Promise<string> {
    const opened = (await (
      await post({
        id,
        type: 'session_open',
        installationId: APP,
        tenant: { userId: 'u', workspaceId: 'w' },
      })
    ).json()) as Json;
    expect(opened.type).toBe('session_opened');
    return opened.sessionId as string;
  }

  async function start(): Promise<string> {
    const policies = new InMemoryPolicyStore();
    const base = defaultPolicy(ADMIN_PRINCIPAL_ID);
    await policies.put({
      ...base,
      rules: [...base.rules, { id: 'ask-risky', app: APP, tool: 'risky', effect: 'ask' }],
    });
    server = new StationServer({
      stationId: 'stn_test',
      workspaceId: 'ws_test',
      secretStore: new InMemorySecretStore(),
      dataStore: new InMemoryDataStore(),
      publicUrl: 'http://station.test',
      apps: [{ id: APP, version: '1.0.0', factory }],
      policies,
    });
    url = (await server.start(0, '127.0.0.1')).url;
    return openSession('open-1');
  }

  async function pendingIds(): Promise<string[]> {
    const body = (await (await fetch(`${url}/approvals`)).json()) as {
      approvals: Array<{ id: string }>;
    };
    return body.approvals.map((a) => a.id);
  }

  async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
    for (let i = 0; i < 100; i++) {
      const value = await read();
      if (done(value)) return value;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('condition not reached');
  }

  function decide(id: string, decision: 'approve' | 'deny'): Promise<Response> {
    return fetch(`${url}/approvals/${id}`, { method: 'POST', body: JSON.stringify({ decision }) });
  }

  function logLines(spy: ReturnType<typeof vi.spyOn>): string[] {
    return spy.mock.calls.map((c) => String(c[0]));
  }

  it('[POLICY-AC-14] a parked call still runs after another opener closed its Session', async () => {
    const sessionId = await start();
    const call = post({ id: 'call-1', type: 'tool_call', sessionId, tool: 'risky', arguments: {} });
    const [approvalId] = await waitFor(pendingIds, (ids) => ids.length === 1);

    // Another opener of the same Installation gets the same Session and closes it.
    expect(await openSession('open-2')).toBe(sessionId);
    const closed = (await (
      await post({ id: 'close-1', type: 'session_close', sessionId })
    ).json()) as Json;
    expect(closed.type).toBe('session_closed');

    expect((await decide(approvalId, 'approve')).status).toBe(200);
    const result = (await (await call).json()) as Json;
    expect(result.type).toBe('tool_result');
    expect(result.result).toBe('ran');
    expect(executed).toEqual(['risky']);

    // The held close ends the Session once the parked call was answered.
    const after = await waitFor(
      async () =>
        (await (
          await post({ id: 'call-2', type: 'tool_call', sessionId, tool: 'safe', arguments: {} })
        ).json()) as Json,
      (resp) => resp.type === 'error',
    );
    expect((after.error as Json).code).toBe('SESSION_NOT_FOUND');
  });

  it('[POLICY-AC-15] a caller that drops its connection cancels its Approval', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionId = await start();
    const controller = new AbortController();
    const call = post(
      { id: 'call-1', type: 'tool_call', sessionId, tool: 'risky', arguments: {} },
      controller.signal,
    ).catch((err: Error) => err.name);
    const [approvalId] = await waitFor(pendingIds, (ids) => ids.length === 1);

    controller.abort();
    expect(await call).toBe('AbortError');

    await waitFor(pendingIds, (ids) => ids.length === 0);
    expect((await decide(approvalId, 'approve')).status).toBe(404);
    expect(executed).toEqual([]);
    expect(logLines(log).some((l) => l.includes(`${approvalId} cancelled`))).toBe(true);
  });

  it('[POLICY-AC-16] an approved call whose Instance is gone is logged with its Approval id', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sessionId = await start();
    const call = post({ id: 'call-1', type: 'tool_call', sessionId, tool: 'risky', arguments: {} });
    const [approvalId] = await waitFor(pendingIds, (ids) => ids.length === 1);

    // Stop the Instance behind the Station's back.
    const internals = server as unknown as {
      managedApps: Map<
        string,
        { appStation: { instances: Map<string, { handle: { stop(ms: number): Promise<void> } }> } }
      >;
    };
    for (const instance of internals.managedApps.get(APP)!.appStation.instances.values()) {
      await instance.handle.stop(0);
    }

    expect((await decide(approvalId, 'approve')).status).toBe(200);
    const result = (await (await call).json()) as Json;
    expect(result.type).toBe('error');
    expect((result.error as Json).code).toBe('SESSION_NOT_FOUND');
    expect(executed).toEqual([]);
    expect(
      logLines(log).some(
        (l) =>
          l.includes(`${approvalId} approved call failed`) && l.includes('code=SESSION_NOT_FOUND'),
      ),
    ).toBe(true);
  });
});
