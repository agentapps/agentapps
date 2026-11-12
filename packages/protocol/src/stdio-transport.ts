/**
 * StdioTransport — MCP stdio binding for the Agent Apps Protocol v2.0.
 *
 * Framing: JSON lines (each message is one line terminated by \n).
 * Reads from a ReadableStream, writes to a WritableStream.
 * Used by LocalProcessRuntime to communicate with child processes.
 */

import { createInterface } from 'node:readline';
import type { MessageBase } from './envelope.js';
import type { Transport, Unsubscribe } from './transport.js';

export class StdioTransport implements Transport {
  private handlers = new Set<(msg: MessageBase) => void>();
  private closed = false;
  private rl: ReturnType<typeof createInterface> | null = null;
  private stdout: NodeJS.WritableStream;
  private stdin: NodeJS.ReadableStream;
  private draining = false;
  private pendingWrites: string[] = [];
  private onDrain = (): void => this.flushPending();

  constructor(
    options: {
      stdin?: NodeJS.ReadableStream;
      stdout?: NodeJS.WritableStream;
    } = {},
  ) {
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.startReading();
  }

  private startReading(): void {
    this.rl = createInterface({
      input: this.stdin,
      crlfDelay: Infinity,
    });

    this.rl.on('line', (line) => {
      if (this.closed) return;
      if (!line.trim()) return;

      try {
        const parsed = JSON.parse(line);
        if (this.isValidMessageBase(parsed)) {
          for (const h of this.handlers) {
            try {
              h(parsed);
            } catch (err) {
              console.error('[StdioTransport] Handler error:', err);
            }
          }
        } else {
          console.error(
            '[StdioTransport] Invalid message format (missing id, type, timestamp, or version):',
            line.slice(0, 200),
          );
        }
      } catch (err) {
        console.error(
          '[StdioTransport] Failed to parse JSON line:',
          err instanceof Error ? err.message : err,
        );
      }
    });

    this.rl.on('close', () => {
      if (!this.closed) {
        console.error('[StdioTransport] stdin closed (EOF)');
      }
    });
  }

  private isValidMessageBase(msg: unknown): msg is MessageBase {
    if (typeof msg !== 'object' || msg === null) return false;
    const m = msg as Record<string, unknown>;
    return (
      typeof m.id === 'string' &&
      typeof m.type === 'string' &&
      typeof m.timestamp === 'string' &&
      typeof m.version === 'string'
    );
  }

  send(message: MessageBase): void {
    if (this.closed) throw new Error('Transport closed');
    const line = `${JSON.stringify(message)}\n`;

    if (this.draining) {
      this.pendingWrites.push(line);
      return;
    }

    const ok = this.stdout.write(line);
    if (!ok) {
      this.draining = true;
      this.stdout.once('drain', this.onDrain);
    }
  }

  private flushPending(): void {
    while (this.pendingWrites.length > 0) {
      if (this.closed) break;
      const line = this.pendingWrites.shift();
      if (!line) break;
      const ok = this.stdout.write(line);
      if (!ok) {
        this.stdout.once('drain', this.onDrain);
        return;
      }
    }
    this.draining = false;
  }

  onMessage(handler: (message: MessageBase) => void): Unsubscribe {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();
    this.pendingWrites.length = 0;
    this.draining = false;
    this.stdout.removeListener('drain', this.onDrain);
    this.rl?.close();

    // Only close streams if they were explicitly provided (not process stdio)
    if (this.stdin !== process.stdin) {
      (this.stdin as NodeJS.ReadStream).destroy?.();
    }
    if (this.stdout !== process.stdout) {
      const writable = this.stdout as NodeJS.WritableStream & {
        end?: (() => void) | (() => NodeJS.WritableStream);
      };
      if (typeof writable.end === 'function') {
        writable.end();
      }
    }
  }
}
