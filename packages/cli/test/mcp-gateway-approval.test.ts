/**
 * The MCP gateway waits for a parked call (CLI-REQ-7): the station is replaced
 * by a `fetch` that answers the tool call only after the approval delay.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallationGateway } from '../src/mcp-gateway.js';

const STATION = { url: 'http://station.test', key: 'aak_test', userId: 'user-1' };
const APPROVED_AFTER_MS = 90_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('agentapps mcp and Approvals', () => {
  it('[CLI-AC-7] a call approved after 90 seconds returns its result and is sent once', async () => {
    vi.useFakeTimers();
    const toolCalls: string[] = [];

    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
      if (input.endsWith('/installations')) {
        return Promise.resolve(
          json({ installations: [{ installationId: 'inst_todo', alias: 'todo' }] }),
        );
      }
      const message = JSON.parse(String(init?.body)) as { type: string; tool?: string };
      if (message.type === 'session_open') {
        return Promise.resolve(json({ type: 'session_opened', sessionId: 'sess_1' }));
      }
      if (message.type === 'list_tools') {
        return Promise.resolve(
          json({ type: 'tools_list', tools: [{ name: 'delete-node', description: 'Delete' }] }),
        );
      }
      // The tool call is parked: the station answers once the Approver approves,
      // unless the gateway gave up first.
      toolCalls.push(message.tool ?? '');
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(json({ type: 'tool_result', result: 'deleted' })),
          APPROVED_AFTER_MS,
        );
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(init.signal?.reason);
        });
      });
    });

    const gateway = new InstallationGateway(
      () => STATION,
      () => {},
    );
    await gateway.refresh();
    expect(gateway.list().map((t) => t.name)).toEqual(['todo__delete-node']);

    const call = gateway.call('todo__delete-node', { nodeId: 'n1' });
    await vi.advanceTimersByTimeAsync(APPROVED_AFTER_MS);

    expect(await call).toEqual({ text: 'deleted', isError: false });
    // One call reached the station, so one Approval was pending for it.
    expect(toolCalls).toEqual(['delete-node']);
  });
});
