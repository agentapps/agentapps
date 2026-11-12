/**
 * Tests for the test harness itself.
 */

import { createApp } from '@agentapps/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createTestHarness,
  type TestHarness,
  toContainMessage,
  toHaveMessageSequence,
  waitForMessage,
} from '../src/index.js';

function buildTestApp() {
  const app = createApp({ id: 'app.harness-test', version: '1.0.0' });
  app.tool('add', {
    description: 'Adds two numbers',
    parameters: {
      type: 'object',
      properties: {
        a: { type: 'number' },
        b: { type: 'number' },
      },
      required: ['a', 'b'],
    },
    handler: async (args) => ({ sum: (args.a as number) + (args.b as number) }),
  });
  app.health(async () => ({ status: 'ready', message: 'Healthy' }));
  return app.toFactory();
}

describe('createTestHarness', () => {
  let harness: TestHarness;

  afterEach(async () => {
    if (harness) await harness.shutdown();
  });

  it('initializes host and appStation in one call', async () => {
    harness = await createTestHarness(buildTestApp(), { appId: 'app.harness-test' });
    expect(harness.host.initialized).toBe(true);
    expect(harness.host.initResult?.app.id).toBe('app.harness-test');
    expect(harness.appStation.instanceCount).toBe(0);
  });

  it('opens a session and lists tools', async () => {
    harness = await createTestHarness(buildTestApp());
    const session = await harness.host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });
    const tools = await session.listTools();
    expect(tools.map((t) => t.name)).toEqual(['add']);
    await session.close();
  });

  it('calls a tool and returns the result', async () => {
    harness = await createTestHarness(buildTestApp());
    const session = await harness.host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });
    const result = await session.callTool(
      'add',
      { a: 2, b: 3 },
      { userId: 'u_alice', installationId: 'inst_1' },
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ sum: 5 });
    await session.close();
  });

  it('captures traffic', async () => {
    harness = await createTestHarness(buildTestApp());
    expect(harness.traffic.length).toBeGreaterThan(0);
    toContainMessage(harness.traffic, 'initialized');
  });

  it('waitForMessage finds a message in traffic', async () => {
    harness = await createTestHarness(buildTestApp());
    const msg = await waitForMessage(harness.traffic, 'initialized');
    expect(msg.type).toBe('initialized');
  });

  it('toHaveMessageSequence matches subsequence', async () => {
    harness = await createTestHarness(buildTestApp());
    const session = await harness.host.openSession({
      installationId: 'inst_1',
      tenant: { userId: 'u_alice' },
    });
    await session.listTools();
    await session.close();

    toHaveMessageSequence(harness.traffic, [
      'initialized',
      'session_opened',
      'list_tools',
      'tools_list',
      'session_closed',
    ]);
  });
});
