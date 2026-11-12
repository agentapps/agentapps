/**
 * Tests for StdioTransport — MCP stdio JSON-lines binding.
 */

import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createEnvelope, PROTOCOL_VERSION } from '../src/envelope.js';
import { StdioTransport } from '../src/stdio-transport.js';

describe('StdioTransport', () => {
  it('sends a message as a JSON line to stdout', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const transport = new StdioTransport({ stdin, stdout });

    const msg = createEnvelope('test');
    transport.send(msg);

    const chunks: string[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

    // Give a tick for the write to propagate
    await new Promise((r) => setTimeout(r, 10));

    const lines = chunks.join('').trim().split('\n');
    expect(lines).toHaveLength(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.type).toBe('test');
    expect(parsed.id).toBe(msg.id);
    expect(parsed.version).toBe(PROTOCOL_VERSION);
    expect(typeof parsed.timestamp).toBe('string');

    await transport.close();
    stdin.end();
    stdout.end();
  });

  it('receives a message from stdin and calls the handler', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const transport = new StdioTransport({ stdin, stdout });

    const handler = vi.fn();
    transport.onMessage(handler);

    const msg = createEnvelope('hello');
    stdin.write(`${JSON.stringify(msg)}\n`);

    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        id: msg.id,
        type: 'hello',
        version: PROTOCOL_VERSION,
      }),
    );

    await transport.close();
    stdin.end();
    stdout.end();
  });

  it('supports multiple handlers', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const transport = new StdioTransport({ stdin, stdout });

    const handler1 = vi.fn();
    const handler2 = vi.fn();
    transport.onMessage(handler1);
    transport.onMessage(handler2);

    const msg = createEnvelope('multi');
    stdin.write(`${JSON.stringify(msg)}\n`);

    await new Promise((r) => setTimeout(r, 10));

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);

    await transport.close();
    stdin.end();
    stdout.end();
  });

  it('unsubscribes handler via returned function', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const transport = new StdioTransport({ stdin, stdout });

    const handler = vi.fn();
    const unsub = transport.onMessage(handler);
    unsub();

    const msg = createEnvelope('after-unsub');
    stdin.write(`${JSON.stringify(msg)}\n`);

    await new Promise((r) => setTimeout(r, 10));

    expect(handler).not.toHaveBeenCalled();

    await transport.close();
    stdin.end();
    stdout.end();
  });

  it('close prevents further sends and stops receiving', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const transport = new StdioTransport({ stdin, stdout });

    await transport.close();

    expect(() => transport.send(createEnvelope('after-close'))).toThrow('Transport closed');

    const handler = vi.fn();
    transport.onMessage(handler);

    const msg = createEnvelope('after-close');
    stdin.write(`${JSON.stringify(msg)}\n`);

    await new Promise((r) => setTimeout(r, 10));

    expect(handler).not.toHaveBeenCalled();

    stdin.end();
    stdout.end();
  });

  it('logs error on malformed JSON without crashing', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = new StdioTransport({ stdin, stdout });

    const handler = vi.fn();
    transport.onMessage(handler);

    stdin.write('not-valid-json\n');

    await new Promise((r) => setTimeout(r, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse JSON line'),
      expect.any(String),
    );
    expect(handler).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    await transport.close();
    stdin.end();
    stdout.end();
  });

  it('logs error on invalid message format (missing fields) without crashing', async () => {
    const stdout = new PassThrough();
    const stdin = new PassThrough();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = new StdioTransport({ stdin, stdout });

    const handler = vi.fn();
    transport.onMessage(handler);

    stdin.write('{"type":"foo"}\n');

    await new Promise((r) => setTimeout(r, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid message format'),
      expect.any(String),
    );
    expect(handler).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    await transport.close();
    stdin.end();
    stdout.end();
  });
});
