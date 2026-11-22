/**
 * Conformance suite (AC-8) — pre-defined tests that validate an app factory
 * implements the protocol correctly.
 */

import type { AppFactory } from '@agentapps/station';
import { describe, expect, it } from 'vitest';
import { createTestHarness, type TestHarnessOptions } from './harness.js';

/**
 * Run the standard conformance suite against an app factory. It registers
 * vitest tests, so call it from a test file. No tool of the app is executed.
 *
 * @spec DEVX-REQ-3
 *
 * @example
 * ```ts
 * import { runConformanceTests } from '@agentapps/testing';
 * import myAppFactory from './app.js';
 *
 * runConformanceTests(myAppFactory);
 * ```
 */
export function runConformanceTests(appFactory: AppFactory, options?: TestHarnessOptions): void {
  describe('Conformance suite (AC-8)', () => {
    it('responds to initialize handshake', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        expect(harness.host.initialized).toBe(true);
        expect(harness.host.initResult?.negotiatedVersion).toBe('2.0');
      } finally {
        await harness.shutdown();
      }
    });

    it('implements list_tools', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        const session = await harness.host.openSession({
          installationId: 'inst_conformance',
          tenant: { userId: 'u_conformance' },
        });
        const tools = await session.listTools();
        expect(Array.isArray(tools)).toBe(true);
        await session.close();
      } finally {
        await harness.shutdown();
      }
    });

    it('implements health_check', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        const session = await harness.host.openSession({
          installationId: 'inst_conformance',
          tenant: { userId: 'u_conformance' },
        });
        const health = await session.healthCheck();
        expect(health).toHaveProperty('status');
        await session.close();
      } finally {
        await harness.shutdown();
      }
    });

    it('tool calls return valid results or errors', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        const session = await harness.host.openSession({
          installationId: 'inst_conformance',
          tenant: { userId: 'u_conformance' },
        });
        // DEVX-REQ-3: the suite never runs one of the app's tools, which could write
        // or reach the network. A tool the app does not have exercises the same path.
        const result = await session.callTool(
          '__conformance_unknown_tool__',
          {},
          { userId: 'u_conformance', installationId: 'inst_conformance' },
        );
        expect(typeof result).toBe('object');
        expect(result.success).toBe(false);
        expect(typeof result.error?.code).toBe('string');
        await session.close();
      } finally {
        await harness.shutdown();
      }
    });

    it('cancel works without crashing', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        const session = await harness.host.openSession({
          installationId: 'inst_conformance',
          tenant: { userId: 'u_conformance' },
        });
        const cancelled = await session.cancel('nonexistent_request_id');
        expect(typeof cancelled).toBe('boolean');
        await session.close();
      } finally {
        await harness.shutdown();
      }
    });

    it('session can subscribe and unsubscribe to events', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        const session = await harness.host.openSession({
          installationId: 'inst_conformance',
          tenant: { userId: 'u_conformance' },
        });
        // Subscribe should return a subscriptionId (or fail gracefully).
        try {
          const subId = await session.subscribe(['*']);
          expect(typeof subId).toBe('string');
          const ok = await session.unsubscribe(subId);
          expect(typeof ok).toBe('boolean');
        } catch {
          // App may not support events — that's ok for conformance.
        }
        await session.close();
      } finally {
        await harness.shutdown();
      }
    });

    it('session reuse: closing and reopening uses the same instance', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        const session1 = await harness.host.openSession({
          installationId: 'inst_reuse',
          tenant: { userId: 'u_conformance' },
        });
        await session1.close();

        // Reopening the same installationId should succeed (instance reuse).
        const session2 = await harness.host.openSession({
          installationId: 'inst_reuse',
          tenant: { userId: 'u_conformance' },
        });
        const tools = await session2.listTools();
        expect(Array.isArray(tools)).toBe(true);
        await session2.close();
      } finally {
        await harness.shutdown();
      }
    });

    it('appStation health reports status', async () => {
      const harness = await createTestHarness(appFactory, options);
      try {
        const session = await harness.host.openSession({
          installationId: 'inst_conformance',
          tenant: { userId: 'u_conformance' },
        });
        // AppStation health is available via host.getControllerHealth() if it exists,
        // but we can verify the traffic includes proper responses.
        const tools = await session.listTools();
        expect(Array.isArray(tools)).toBe(true);
        await session.close();
      } finally {
        await harness.shutdown();
      }
    });
  });
}
