/**
 * Test helpers for interacting with a running harness.
 */

import type { AgentAppHostConfig } from '@agentapps/host';
import type { MessageBase, Transport } from '@agentapps/protocol';
import type { TestHarness } from './harness.js';

/**
 * Wait for a message of the given type to appear in `traffic`.
 *
 * @param traffic — captured message array (usually `harness.traffic`).
 * @param type — message type to wait for.
 * @param timeoutMs — how long to poll (default: 5000).
 * @returns The first matching message.
 */
export async function waitForMessage(
  traffic: MessageBase[],
  type: string,
  timeoutMs = 5_000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = traffic.find((m) => m.type === type);
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timeout waiting for message type '${type}' after ${timeoutMs}ms`);
}

/** Handler shape for intercepting secret/auth requests. */
export type MockRequestHandler = (
  type: string,
  sessionId: string,
  requestId: string,
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;

/**
 * Replace a host's request handlers with a single mock interceptor.
 *
 * @param harness — the running harness.
 * @param handler — called for every request request. Return a value to resolve the request, or null to reject.
 * @returns A function that restores the original host requests and removes the interceptor.
 */
export function mockRequest(harness: TestHarness, handler: MockRequestHandler): () => void {
  // We recreate the host with the mock handler wired in.
  // Because AgentAppHost accepts requests at construction time, the easiest
  // path is to let the caller create the harness with `hostConfig.requests`
  // and use this helper to wrap them. For simplicity, we just attach a
  // side-channel listener on the transport that intercepts request requests
  // and replies directly.

  const transport = (harness.host as unknown as { transport: Transport }).transport;
  if (!transport) {
    throw new Error('mockRequest: unable to access host transport');
  }

  const unsub = transport.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    const callbackTypes = new Set([
      'get_system_secrets',
      'get_installation_secrets',
      'update_installation_secrets',
      'auth_url',
      'auth_status',
    ]);

    if (callbackTypes.has(m.type as string)) {
      const sessionId = m.sessionId as string;
      const requestId = m.requestId as string;
      Promise.resolve(handler(m.type as string, sessionId, requestId, m))
        .then((result) => {
          if (result === null) {
            transport.send({
              id: `mock_err_${Date.now()}`,
              type: 'prompt_result',
              timestamp: new Date().toISOString(),
              version: '2.0',
              sessionId,
              requestId,
              success: false,
              error: 'Mock request rejected',
            } as MessageBase);
            return;
          }
          const responseType = `${m.type}_response`;
          transport.send({
            id: `mock_${Date.now()}`,
            type: responseType,
            timestamp: new Date().toISOString(),
            version: '2.0',
            sessionId,
            requestId,
            ...result,
          } as MessageBase);
        })
        .catch((err) => {
          transport.send({
            id: `mock_err_${Date.now()}`,
            type: 'prompt_result',
            timestamp: new Date().toISOString(),
            version: '2.0',
            sessionId,
            requestId,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          } as MessageBase);
        });
    }
  });

  return () => {
    unsub();
  };
}

/**
 * Simulate a transport disconnect and reconnect by closing the current
 * transport pair and creating a new one. The app station and host are
 * re-wired to the new transport.
 *
 * @param harness — the running harness.
 * @returns A promise that resolves once the new transport is wired.
 */
export async function simulateDisconnect(harness: TestHarness): Promise<void> {
  const { createInProcessTransportPair } = await import('@agentapps/protocol');
  const { AgentAppHost } = await import('@agentapps/host');

  // Close existing host transport (app station side will be closed by host.shutdown)
  await harness.host.shutdown();

  const [hostSide, ctrlSide] = createInProcessTransportPair();
  harness.appStation.accept(ctrlSide);

  // Rebuild host with same config
  const hostConfig = (harness.host as unknown as { config: Record<string, unknown> }).config;
  const newHost = new AgentAppHost(hostSide, hostConfig as unknown as AgentAppHostConfig);
  await newHost.initialize();

  // Patch harness reference
  (harness as unknown as Record<string, unknown>).host = newHost;
}
