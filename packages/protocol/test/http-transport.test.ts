/**
 * Tests for HttpTransport — HTTP/SSE binding with auto-reconnect.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createEnvelope, PROTOCOL_VERSION } from '../src/envelope.js';
import { HttpTransport } from '../src/http-transport.js';

interface MockServerState {
  messages: unknown[];
  sseClients: ServerResponse[];
  failPost: boolean;
  failSse: boolean;
  sseCloseAfter: number;
  sseMessages: string[];
  sseRequestCount: number;
  lastPostHeaders: Record<string, string | string[] | undefined>;
  lastSseQuery: URLSearchParams | null;
}

function createMockServer(): { server: Server; url: string; state: MockServerState } {
  const state: MockServerState = {
    messages: [],
    sseClients: [],
    failPost: false,
    failSse: false,
    sseCloseAfter: -1,
    sseMessages: [],
    sseRequestCount: 0,
    lastPostHeaders: {},
    lastSseQuery: null,
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://localhost`);

    if (req.method === 'POST' && url.pathname === '/messages') {
      state.lastPostHeaders = req.headers;
      if (state.failPost) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          state.messages.push(parsed);
        } catch {
          // ignore malformed
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      state.sseRequestCount++;
      state.lastSseQuery = url.searchParams;
      if (state.failSse) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      state.sseClients.push(res);

      // Send any queued messages
      for (const msg of state.sseMessages) {
        res.write(`data: ${msg}\n\n`);
      }

      if (state.sseCloseAfter >= 0) {
        setTimeout(() => {
          res.destroy();
        }, state.sseCloseAfter);
      }

      req.on('close', () => {
        const idx = state.sseClients.indexOf(res);
        if (idx !== -1) state.sseClients.splice(idx, 1);
      });
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  return { server, url: '', state };
}

async function startServer(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(`http://127.0.0.1:${addr.port}`);
      }
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    // Force-close all active connections so the server can shut down
    (server as Server & { closeAllConnections?: () => void }).closeAllConnections?.();
    server.close(() => resolve());
  });
}

// Run sequentially because each test needs its own server and
// we must avoid cross-test interference from concurrent reconnects.
describe.sequential('HttpTransport', () => {
  it('sends messages via POST', async () => {
    const { server, state } = createMockServer();
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({ baseUrl: serverUrl });
    await new Promise((r) => setTimeout(r, 50));

    const msg = createEnvelope('test');
    transport.send(msg);

    await new Promise((r) => setTimeout(r, 100));

    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      id: msg.id,
      type: 'test',
      version: PROTOCOL_VERSION,
    });

    await transport.close();
    await closeServer(server);
  });

  it('receives messages via SSE', async () => {
    const msg = createEnvelope('hello');
    const { server, state } = createMockServer();
    state.sseMessages.push(JSON.stringify(msg));
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({ baseUrl: serverUrl });
    const handler = vi.fn();
    transport.onMessage(handler);

    await new Promise((r) => setTimeout(r, 100));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: msg.id,
        type: 'hello',
        version: PROTOCOL_VERSION,
      }),
    );

    await transport.close();
    await closeServer(server);
  });

  it('reconnects after disconnect', async () => {
    const { server, state } = createMockServer();
    state.sseCloseAfter = 50;
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({
      baseUrl: serverUrl,
      reconnectIntervalMs: 100,
    });

    // Wait for initial connection + server close + reconnect
    await new Promise((r) => setTimeout(r, 300));

    // Should have attempted at least 2 connections (initial + reconnect)
    expect(state.sseRequestCount).toBeGreaterThanOrEqual(2);

    await transport.close();
    await closeServer(server);
  });

  it('stops reconnecting after max attempts', async () => {
    const { server, state } = createMockServer();
    state.failSse = true;
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({
      baseUrl: serverUrl,
      reconnectIntervalMs: 50,
      maxReconnects: 3,
    });

    await new Promise((r) => setTimeout(r, 400));

    expect(transport.reconnectAttempts).toBeGreaterThanOrEqual(3);
    expect(transport.connected).toBe(false);

    await transport.close();
    await closeServer(server);
  });

  it('close stops reconnecting', async () => {
    const { server, state } = createMockServer();
    state.sseCloseAfter = 50;
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({
      baseUrl: serverUrl,
      reconnectIntervalMs: 100,
    });

    // Wait for initial connection + at least one server close + reconnect attempt
    await new Promise((r) => setTimeout(r, 300));

    const countBefore = state.sseRequestCount;
    await transport.close();

    // Wait a bit to ensure no more reconnects happen
    await new Promise((r) => setTimeout(r, 300));

    expect(state.sseRequestCount).toBe(countBefore);
    expect(transport.connected).toBe(false);

    await closeServer(server);
  });

  it('includes sessionId in headers and query params', async () => {
    const { server, state } = createMockServer();
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({
      baseUrl: serverUrl,
      sessionId: 'sess-123',
    });

    await new Promise((r) => setTimeout(r, 50));

    const msg = createEnvelope('test', 'sess-123');
    transport.send(msg);

    await new Promise((r) => setTimeout(r, 100));

    // Verify POST header
    expect(state.lastPostHeaders['x-session-id']).toBe('sess-123');

    // Verify SSE query param
    expect(state.lastSseQuery?.get('sessionId')).toBe('sess-123');

    await transport.close();
    await closeServer(server);
  });

  it('handles server error in POST', async () => {
    const { server, state } = createMockServer();
    state.failPost = true;
    const serverUrl = await startServer(server);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = new HttpTransport({ baseUrl: serverUrl });

    await new Promise((r) => setTimeout(r, 50));

    const msg = createEnvelope('test');
    transport.send(msg);

    await new Promise((r) => setTimeout(r, 100));

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('POST failed with status 500'));

    consoleSpy.mockRestore();
    await transport.close();
    await closeServer(server);
  });

  it('handles malformed SSE data', async () => {
    const { server, state } = createMockServer();
    state.sseMessages.push('not-valid-json');
    const serverUrl = await startServer(server);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = new HttpTransport({ baseUrl: serverUrl });
    const handler = vi.fn();
    transport.onMessage(handler);

    await new Promise((r) => setTimeout(r, 100));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse SSE data'),
      expect.any(String),
    );
    expect(handler).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    await transport.close();
    await closeServer(server);
  });

  it('supports multiple handlers', async () => {
    const msg = createEnvelope('multi');
    const { server, state } = createMockServer();
    state.sseMessages.push(JSON.stringify(msg));
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({ baseUrl: serverUrl });
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    transport.onMessage(handler1);
    transport.onMessage(handler2);

    await new Promise((r) => setTimeout(r, 100));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    await transport.close();
    await closeServer(server);
  });

  it('unsubscribes handler via returned function', async () => {
    const msg = createEnvelope('after-unsub');
    const { server, state } = createMockServer();
    state.sseMessages.push(JSON.stringify(msg));
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({ baseUrl: serverUrl });
    const handler = vi.fn();
    const unsub = transport.onMessage(handler);
    unsub();

    await new Promise((r) => setTimeout(r, 100));

    expect(handler).not.toHaveBeenCalled();

    await transport.close();
    await closeServer(server);
  });

  it('close prevents further sends', async () => {
    const { server } = createMockServer();
    const serverUrl = await startServer(server);

    const transport = new HttpTransport({ baseUrl: serverUrl });
    await transport.close();

    expect(() => transport.send(createEnvelope('after-close'))).toThrow('Transport closed');

    await closeServer(server);
  });
});
