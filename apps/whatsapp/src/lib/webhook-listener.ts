/**
 * WAHA webhook listener.
 *
 * WAHA notifies the app of incoming messages, reactions and session changes by
 * POSTing to an HTTP endpoint. How an app receives webhooks is the app's own
 * business, not the protocol's: this module runs a small `node:http` server
 * inside the app process, maps each WAHA payload to one of the app's declared
 * Events and emits it to every session that subscribed.
 *
 * The listener starts on the first subscription (`app.onSubscribe`) and is a
 * process-wide singleton. WAHA is told where to POST through the session's
 * webhook config (see ensure-default-session.ts).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { ToolContext } from '@agentapps/sdk';

export const WEBHOOK_PATH = '/webhooks/whatsapp';
const DEFAULT_PORT = 3000;
const MAX_BODY_BYTES = 1024 * 1024;

/** Port the listener binds to. WAHA must be able to reach it on localhost. */
export function webhookPort(): number {
  return Number(process.env.WHATSAPP_WEBHOOK_PORT || DEFAULT_PORT);
}

/** A declared app Event with its payload, derived from a WAHA webhook. */
export interface MappedEvent {
  event: 'message_received' | 'message_sent' | 'message_reaction' | 'session_status';
  data: Record<string, unknown>;
}

/**
 * Map one WAHA webhook payload to the app Event it stands for.
 * Returns null for event types the app does not surface.
 */
export function mapWahaEvent(payload: Record<string, unknown>): MappedEvent | null {
  const event = payload.event as string | undefined;
  const data = (payload.payload ?? payload) as Record<string, unknown>;

  switch (event) {
    case 'message':
      return {
        event: 'message_received',
        data: {
          id: data.id,
          from: data.from,
          to: data.to,
          body: data.body,
          timestamp: data.timestamp,
          type: data.type,
          hasMedia: data.hasMedia ?? false,
          pushName: data._data ? (data._data as Record<string, unknown>).pushName : undefined,
        },
      };
    case 'message.any':
      if (!data.fromMe) return null;
      return {
        event: 'message_sent',
        data: {
          id: data.id,
          to: data.to,
          body: data.body,
          timestamp: data.timestamp,
          type: data.type,
        },
      };
    case 'message.reaction':
      return {
        event: 'message_reaction',
        data: {
          id: data.id,
          from: data.from,
          to: data.to,
          reaction: data.reaction ?? data.body,
          timestamp: data.timestamp,
        },
      };
    case 'session.status':
      return {
        event: 'session_status',
        data: {
          session: (payload.session as string | undefined) ?? 'default',
          status: data.status,
        },
      };
    default:
      return null;
  }
}

/** Sessions that subscribed to events; each gets every mapped event it still listens to. */
const subscribers = new Set<ToolContext>();
let server: Server | null = null;

/** Deliver a mapped event to every subscriber that still listens to it. */
export function deliver(mapped: MappedEvent): number {
  let delivered = 0;
  for (const ctx of subscribers) {
    try {
      if (!ctx.hasSubscribers(mapped.event)) continue;
      ctx.emit(mapped.event, mapped.data);
      delivered++;
    } catch {
      // A session that is gone cannot receive anything more; forget it.
      subscribers.delete(ctx);
    }
  }
  return delivered;
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (req.method !== 'POST' || url.pathname !== WEBHOOK_PATH) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  try {
    const payload = await readJsonBody(req);
    const mapped = mapWahaEvent(payload);
    const delivered = mapped ? deliver(mapped) : 0;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ received: true, event: payload.event ?? null, delivered }));
  } catch (err) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
}

/**
 * Register a subscribing session and make sure the listener is running.
 * Idempotent: the server is created once per process.
 */
export async function startWebhookListener(
  ctx: ToolContext,
  port = webhookPort(),
): Promise<{ port: number }> {
  subscribers.add(ctx);
  if (server) {
    const address = server.address();
    return { port: typeof address === 'object' && address ? address.port : port };
  }
  server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server?.once('error', reject);
    server?.listen(port, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const bound = typeof address === 'object' && address ? address.port : port;
  ctx.log('info', `WAHA webhook listener on http://127.0.0.1:${bound}${WEBHOOK_PATH}`);
  return { port: bound };
}

/** Stop the listener and forget every subscriber (tests and shutdown). */
export async function stopWebhookListener(): Promise<void> {
  subscribers.clear();
  const current = server;
  server = null;
  if (!current) return;
  await new Promise<void>((resolve) => current.close(() => resolve()));
}
