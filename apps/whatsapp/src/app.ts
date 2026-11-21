import { createApp } from '@agentapps/sdk';
import { ensureDefaultSession } from './lib/ensure-default-session.js';
import { startWebhookListener } from './lib/webhook-listener.js';
import { registerTools } from './tools/index.js';

const app = createApp({
  id: 'app.whatsapp',
  version: '2.1.0',
  name: 'WhatsApp',
  description:
    'Send and receive WhatsApp messages via WAHA (WhatsApp HTTP API). Manage sessions, send text/media, and handle incoming messages. Real-time events for incoming messages, reactions, and session status changes. Account linking is always done with a numeric pairing code (request-pairing-code) — QR authentication is not supported.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  license: 'MIT',
  category: 'communication',
  keywords: ['whatsapp', 'messaging', 'waha', 'chat', 'automation'],
  runtime: { transport: 'stdio', command: 'node', args: ['dist/app.js'] },
  capabilities: { tools: true, events: true, health: true },
  auth: {
    type: 'agent',
    instructions:
      'This app connects through the agent. Ask in the chat to link your WhatsApp session: you will get a pairing code to enter in WhatsApp > Linked Devices > Link with phone number. You can also ask the agent to check the session status or disconnect.',
  },
});

// ── Events ──────────────────────────────────────────────────────────────────
// Declared event types that subscribers can listen for.

app.event('message_received', {
  description:
    'A new WhatsApp message was received from another user. Payload includes from, body, timestamp, type, hasMedia.',
});

app.event('message_sent', {
  description:
    'A WhatsApp message was sent (outgoing confirmation). Payload includes to, body, timestamp, type.',
});

app.event('message_reaction', {
  description: 'A reaction was added to or removed from a WhatsApp message.',
});

app.event('session_status', {
  description:
    'WhatsApp session status changed (e.g. WORKING, SCAN_QR_CODE, FAILED). Payload includes session, status.',
});

// ── Events from WAHA ────────────────────────────────────────────────────────
// WAHA POSTs webhooks to a small HTTP listener the app runs itself (see
// lib/webhook-listener.ts). The listener starts with the first subscriber and
// WAHA's session is pointed at it; each webhook becomes one of the Events
// declared above, emitted to every subscribed session.

app.onSubscribe(async (ctx) => {
  const { port } = await startWebhookListener(ctx);
  await ensureDefaultSession(ctx, { webhookPort: port });
});

// Health check: verify that WAHA is alive.
// Uses /ping which doesn't require auth (WAHA generates random credentials when
// WAHA_API_KEY is empty, so /api/health always returns 401 in that case).
app.health(async (_ctx) => {
  const port = process.env.WAHA_PORT || '3001';
  const pingUrl = `http://localhost:${port}/ping`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(pingUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`WAHA /ping returned HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
  return { status: 'ready' as const, message: 'WAHA server is reachable' };
});

registerTools(app);

export const factory = app.toFactory();
