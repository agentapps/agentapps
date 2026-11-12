/**
 * Agent Apps Protocol v2.0 — transport interface.
 *
 * Bidirectional message channel abstraction. Both host and app station
 * implement this interface; bindings (stdio, HTTP,
 * in-process) provide concrete implementations.
 *
 * Spec: Agent Apps Protocol v2.0 — REQ-11.
 */

import type { MessageBase } from './envelope.js';

/** Callback disposer — call to unregister a handler. */
export type Unsubscribe = () => void;

/**
 * Bidirectional message transport. Carries protocol messages in both
 * directions; the layer above (app station, host) decides semantics.
 *
 * Bindings implement this: InProcessTransport (embedded), StdioTransport,
 * HttpTransport.
 */
export interface Transport {
  /** Send a message to the remote side. Throws if the transport is closed. */
  send(message: MessageBase): void;

  /**
   * Register a handler for incoming messages from the remote side.
   * Returns an unsubscribe function. Multiple handlers are supported.
   */
  onMessage(handler: (message: MessageBase) => void): Unsubscribe;

  /** Close the transport gracefully. Resolves when cleanup is done. */
  close(): Promise<void>;
}

/**
 * Create a connected pair of in-process transports. Messages sent on
 * one side are synchronously delivered to the other side's handlers.
 *
 * Returns `[sideA, sideB]` — which side is "host" vs "app station"
 * is decided by the caller.
 *
 * Used for: embedded mode, dev server, tests, simple standalone apps.
 */
export function createInProcessTransportPair(): [Transport, Transport] {
  const handlersA = new Set<(msg: MessageBase) => void>();
  const handlersB = new Set<(msg: MessageBase) => void>();
  let closedA = false;
  let closedB = false;

  const sideA: Transport = {
    send(msg) {
      if (closedA) throw new Error('Transport closed');
      for (const h of handlersB) {
        try {
          h(msg);
        } catch (err) {
          console.error('[InProcessTransport] handler error:', err);
        }
      }
    },
    onMessage(handler) {
      handlersA.add(handler);
      return () => {
        handlersA.delete(handler);
      };
    },
    async close() {
      closedA = true;
      handlersA.clear();
    },
  };

  const sideB: Transport = {
    send(msg) {
      if (closedB) throw new Error('Transport closed');
      for (const h of handlersA) {
        try {
          h(msg);
        } catch (err) {
          console.error('[InProcessTransport] handler error:', err);
        }
      }
    },
    onMessage(handler) {
      handlersB.add(handler);
      return () => {
        handlersB.delete(handler);
      };
    },
    async close() {
      closedB = true;
      handlersB.clear();
    },
  };

  return [sideA, sideB];
}
