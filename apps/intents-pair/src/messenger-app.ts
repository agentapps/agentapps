/**
 * Messenger App — the intent **provider**.
 *
 * Exposes `send_message` and `list_conversations` tools that the CRM app
 * calls via `ctx.intent('messenger', 'send_message', {...})`.
 *
 * This side doesn't know about intents — it's just a regular app. The host
 * resolves the CRM's binding to this installation and routes the intent
 * as a normal tool call.
 */

import { createApp } from '@agentapps/sdk';

// ---------------------------------------------------------------------------
// In-memory message store (demo only)
// ---------------------------------------------------------------------------

export interface Message {
  id: string;
  to: string;
  body: string;
  sentAt: string;
}

const messages: Message[] = [];
let nextId = 1;

/** Reset the store (used in tests). */
export function resetMessages(): void {
  messages.length = 0;
  nextId = 1;
}

/** Get all messages (used in tests). */
export function getMessages(): readonly Message[] {
  return messages;
}

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.messenger',
  version: '1.0.0',
  name: 'Messenger',
  description: 'Simple messenger — send and list messages.',
  author: { name: 'Pablo López Torres', email: 'pablolopeztorres@gmail.com' },
  category: 'communication',
  runtime: { transport: 'stdio', command: 'node', args: ['./dist/main.js'] },
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

app.tool('send_message', {
  description: 'Send a message to a user.',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient user id' },
      body: { type: 'string', description: 'Message body' },
    },
    required: ['to', 'body'],
  },
  handler: async (args, ctx) => {
    const msg: Message = {
      id: `msg_${nextId++}`,
      to: args.to as string,
      body: args.body as string,
      sentAt: new Date().toISOString(),
    };
    messages.push(msg);

    ctx.log('info', `Message sent to ${msg.to}`, { messageId: msg.id });

    return {
      delivered: true,
      messageId: msg.id,
      to: msg.to,
    };
  },
});

app.tool('list_conversations', {
  description: 'List recent messages.',
  parameters: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max messages to return (default 10)' },
    },
  },
  annotations: { readOnlyHint: true },
  handler: async (args) => {
    const limit = (args.limit as number) ?? 10;
    return {
      messages: messages.slice(-limit).map((m) => ({
        id: m.id,
        to: m.to,
        body: m.body,
        sentAt: m.sentAt,
      })),
      total: messages.length,
    };
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const messengerFactory = app.toFactory();
export default messengerFactory;
