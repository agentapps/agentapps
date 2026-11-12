/**
 * Tests for @agentapps/sdk — renderer dispatch.
 *
 * Renderer dispatch flow: tool result → renderer.render → `renderer` output
 * (UI Components plus optional variants) in tool_result.
 */

import {
  createInProcessTransportPair,
  createSessionEnvelope,
  type MessageBase,
  type RendererOutput,
  type Transport,
} from '@agentapps/protocol';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'sess_renderer_test';

/** Wait for a message matching a predicate, with timeout. */
function waitFor(
  transport: Transport,
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 2_000,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`Timeout waiting for message (${timeoutMs}ms)`));
    }, timeoutMs);
    const unsub = transport.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      if (predicate(m)) {
        clearTimeout(timer);
        unsub();
        resolve(m);
      }
    });
  });
}

/** Create a session-plane message for testing. */
function sessionMsg(type: string, extra: Record<string, unknown> = {}): MessageBase {
  return {
    ...createSessionEnvelope(type, SESSION_ID),
    ...extra,
  } as MessageBase;
}

describe('renderer dispatch in tool_result', () => {
  it('calls render handler and includes rendered output in tool_result', async () => {
    const [hostTransport, appTransport] = createInProcessTransportPair();

    const app = createApp({ id: 'app.render-test', version: '1.0.0' });

    app.tool('get-task', {
      description: 'Get a task',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ id: 1, title: 'My Task' }),
    });

    app.renderer('task-card', {
      description: 'Renders a task as a detail card',
      boundTools: ['get-task'],
      formats: ['markdown'],
      render: async (result): Promise<RendererOutput> => {
        const r = result as { id: number; title: string };
        return {
          components: [
            {
              type: 'detail',
              title: `Task #${r.id}`,
              sections: [{ fields: [{ label: 'Title', value: r.title }] }],
            },
          ],
          variants: { markdown: `### Task #${r.id}\n\n**Title:** ${r.title}` },
        };
      },
    });

    app.toFactory()(appTransport);

    // Send a tool_call from the host side
    hostTransport.send(
      sessionMsg('tool_call', {
        id: 'req-1',
        tool: 'get-task',
        arguments: {},
      }),
    );

    // Wait for the tool_result on the host side
    const result = await waitFor(
      hostTransport,
      (m) => m['type'] === 'tool_result' && m['id'] === 'req-1',
    );

    expect(result['success']).toBe(true);
    expect(result['result']).toEqual({ id: 1, title: 'My Task' });
    const renderer = result['renderer'] as RendererOutput;
    expect(renderer).toBeDefined();
    expect(renderer.components).toHaveLength(1);
    expect(renderer.components?.[0]).toMatchObject({ type: 'detail', title: 'Task #1' });
    expect(renderer.variants?.markdown).toContain('**Title:** My Task');
    expect(result['rendered']).toBeUndefined();
  });

  it('still returns tool result when render handler throws', async () => {
    const [hostTransport, appTransport] = createInProcessTransportPair();

    const app = createApp({ id: 'app.render-fail', version: '1.0.0' });

    app.tool('get-data', {
      description: 'Get data',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ ok: true }),
    });

    app.renderer('bad-renderer', {
      description: 'Always fails',
      boundTools: ['get-data'],
      render: async () => {
        throw new Error('render explosion');
      },
    });

    app.toFactory()(appTransport);

    hostTransport.send(
      sessionMsg('tool_call', {
        id: 'req-2',
        tool: 'get-data',
        arguments: {},
      }),
    );

    const result = await waitFor(
      hostTransport,
      (m) => m['type'] === 'tool_result' && m['id'] === 'req-2',
    );

    expect(result['success']).toBe(true);
    expect(result['result']).toEqual({ ok: true });
    expect(result['renderer']).toBeUndefined();
  });

  it('does not call render handler for unbound tools', async () => {
    const [hostTransport, appTransport] = createInProcessTransportPair();

    const app = createApp({ id: 'app.render-unbound', version: '1.0.0' });

    app.tool('unbound-tool', {
      description: 'No renderer bound',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({ data: 'test' }),
    });

    app.renderer('other-renderer', {
      description: 'Bound to different tool',
      boundTools: ['other-tool'],
      render: async () => ({ components: [{ type: 'text', content: 'other' }] }),
    });

    app.toFactory()(appTransport);

    hostTransport.send(
      sessionMsg('tool_call', {
        id: 'req-3',
        tool: 'unbound-tool',
        arguments: {},
      }),
    );

    const result = await waitFor(
      hostTransport,
      (m) => m['type'] === 'tool_result' && m['id'] === 'req-3',
    );

    expect(result['success']).toBe(true);
    expect(result['result']).toEqual({ data: 'test' });
    expect(result['renderer']).toBeUndefined();
  });
});
