/**
 * HttpTransport — HTTP/SSE binding for the Agent Apps Protocol v2.0.
 *
 * Sends messages via POST and receives via Server-Sent Events (SSE).
 * Supports automatic reconnection with exponential backoff.
 */

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { MessageBase } from './envelope.js';
import type { Transport, Unsubscribe } from './transport.js';

/**
 * Error info emitted when a send() POST fails after exhausting retries.
 */
export interface SendError {
  /** The message that failed to send. */
  message: MessageBase;
  /** The underlying error (network error or HTTP error). */
  error: Error;
}

export interface HttpTransportOptions {
  /** URL base del endpoint del servidor (e.g., 'https://api.example.com/agent-apps'). */
  baseUrl: string;
  /** Headers adicionales (auth, etc.). */
  headers?: Record<string, string>;
  /** Session ID para routing (opcional, para session-plane). */
  sessionId?: string;
  /** Reconexión automática (default: true). */
  autoReconnect?: boolean;
  /** Intervalo de reconexión en ms (default: 5000). */
  reconnectIntervalMs?: number;
  /** Máximo número de reconexiones (default: 10). */
  maxReconnects?: number;
}

export class HttpTransport implements Transport {
  private handlers = new Set<(msg: MessageBase) => void>();
  private errorHandlers = new Set<(err: SendError) => void>();
  private closed = false;
  private _connected = false;
  private _reconnecting = false;
  private _reconnectAttempts = 0;
  private baseUrl: string;
  private headers: Record<string, string>;
  private sessionId?: string;
  private autoReconnect: boolean;
  private reconnectIntervalMs: number;
  private maxReconnects: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sseRequest: ReturnType<typeof httpRequest> | null = null;
  private sseBuffer = '';
  private sseDataBuffer = '';

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = { ...(options.headers ?? {}) };
    this.sessionId = options.sessionId;
    this.autoReconnect = options.autoReconnect ?? true;
    this.reconnectIntervalMs = options.reconnectIntervalMs ?? 5000;
    this.maxReconnects = options.maxReconnects ?? 10;

    this.startSse();
  }

  get connected(): boolean {
    return this._connected;
  }

  get reconnecting(): boolean {
    return this._reconnecting;
  }

  get reconnectAttempts(): number {
    return this._reconnectAttempts;
  }

  private getRequestModule() {
    return this.baseUrl.startsWith('https:') ? httpsRequest : httpRequest;
  }

  private buildUrl(path: string): string {
    const url = new URL(path, this.baseUrl);
    if (this.sessionId !== undefined) {
      url.searchParams.set('sessionId', this.sessionId);
    }
    return url.toString();
  }

  private startSse(): void {
    if (this.closed) return;

    this._reconnecting = false;
    const url = this.buildUrl('/events');
    const parsedUrl = new URL(url);
    const requestModule = this.getRequestModule();

    const reqHeaders: Record<string, string> = {
      Accept: 'text/event-stream',
      ...this.headers,
    };

    this.sseRequest = requestModule(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: reqHeaders,
      },
      (res) => {
        if (res.statusCode !== 200) {
          console.error(`[HttpTransport] SSE connection failed with status ${res.statusCode}`);
          this._connected = false;
          this.scheduleReconnect();
          return;
        }

        this._connected = true;
        this._reconnectAttempts = 0;
        this.sseBuffer = '';
        this.sseDataBuffer = '';

        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          this.sseBuffer += chunk;
          this.processSseBuffer();
        });

        res.on('end', () => {
          this._connected = false;
          if (!this.closed) {
            this.scheduleReconnect();
          }
        });

        res.on('error', (err) => {
          console.error('[HttpTransport] SSE response error:', err.message);
          this._connected = false;
          if (!this.closed) {
            this.scheduleReconnect();
          }
        });
      },
    );

    this.sseRequest.on('error', (err) => {
      console.error('[HttpTransport] SSE request error:', err.message);
      this._connected = false;
      if (!this.closed) {
        this.scheduleReconnect();
      }
    });

    this.sseRequest.end();
  }

  private processSseBuffer(): void {
    const lines = this.sseBuffer.split('\n');
    // Keep the last (possibly incomplete) line in the buffer
    this.sseBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        this.sseDataBuffer += line.slice(6);
      } else if (line === '') {
        // Empty line means end of event
        if (this.sseDataBuffer !== '') {
          this.handleSseData(this.sseDataBuffer);
          this.sseDataBuffer = '';
        }
      } else if (line.startsWith('event: ')) {
        const eventName = line.slice(7);
        if (eventName === 'error') {
          console.error('[HttpTransport] Server sent error event');
        }
      }
      // Ignore other fields (id, retry, etc.)
    }
  }

  private handleSseData(data: string): void {
    try {
      const parsed = JSON.parse(data);
      if (this.isValidMessageBase(parsed)) {
        for (const h of this.handlers) {
          try {
            h(parsed);
          } catch (err) {
            console.error('[HttpTransport] Handler error:', err);
          }
        }
      } else {
        console.error(
          '[HttpTransport] Invalid message format (missing id, type, timestamp, or version):',
          data.slice(0, 200),
        );
      }
    } catch (err) {
      console.error(
        '[HttpTransport] Failed to parse SSE data:',
        err instanceof Error ? err.message : err,
      );
    }
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

  private scheduleReconnect(): void {
    if (this.closed || !this.autoReconnect) return;

    if (this._reconnectAttempts >= this.maxReconnects) {
      console.error(`[HttpTransport] Max reconnects (${this.maxReconnects}) reached, giving up`);
      return;
    }

    this._reconnecting = true;
    this._reconnectAttempts++;
    const backoff = Math.min(1000 * 2 ** (this._reconnectAttempts - 1), this.reconnectIntervalMs);

    console.error(
      `[HttpTransport] Reconnecting in ${backoff}ms (attempt ${this._reconnectAttempts}/${this.maxReconnects})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startSse();
    }, backoff);
  }

  send(message: MessageBase): void {
    if (this.closed) throw new Error('Transport closed');
    this.doSend(message, false);
  }

  /**
   * Register a handler for send errors. Called when a POST fails after
   * exhausting retries (one retry for transient failures). Returns an
   * unsubscribe function.
   */
  onSendError(handler: (err: SendError) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  private emitSendError(message: MessageBase, error: Error): void {
    const sendError: SendError = { message, error };
    for (const h of this.errorHandlers) {
      try {
        h(sendError);
      } catch (err) {
        console.error('[HttpTransport] Send error handler threw:', err);
      }
    }
  }

  /** Returns true if the status code represents a transient (retryable) failure. */
  private isTransientStatusCode(statusCode: number): boolean {
    return statusCode >= 500 && statusCode < 600;
  }

  private doSend(message: MessageBase, isRetry: boolean): void {
    const parsedUrl = new URL(`${this.baseUrl}/messages`);
    const requestModule = this.getRequestModule();

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers,
    };
    if (this.sessionId !== undefined) {
      reqHeaders['X-Session-Id'] = this.sessionId;
    }

    const body = JSON.stringify(message);

    const req = requestModule(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80'),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          ...reqHeaders,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        // Consume response to free the socket
        res.resume();

        if (res.statusCode && res.statusCode >= 400) {
          const err = new Error(`POST failed with status ${res.statusCode}`);
          console.error(`[HttpTransport] ${err.message}`);

          if (!isRetry && this.isTransientStatusCode(res.statusCode)) {
            setTimeout(() => {
              if (!this.closed) this.doSend(message, true);
            }, 1000);
          } else {
            this.emitSendError(message, err);
          }
        }
      },
    );

    req.on('error', (err) => {
      console.error('[HttpTransport] POST request error:', err.message);

      // Network errors are transient — retry once
      if (!isRetry) {
        setTimeout(() => {
          if (!this.closed) this.doSend(message, true);
        }, 1000);
      } else {
        this.emitSendError(message, err);
      }
    });

    req.write(body);
    req.end();
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

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this._reconnecting = false;
    this._connected = false;
    this.handlers.clear();
    this.errorHandlers.clear();

    if (this.sseRequest !== null) {
      this.sseRequest.destroy();
      this.sseRequest = null;
    }
  }
}
