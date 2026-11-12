/**
 * CRM App — the intent **consumer**.
 *
 * Declares a `messenger` dependency via `requires` and calls the bound
 * messenger app's `send_message` tool through `ctx.intent()`.
 *
 * The CRM doesn't know which specific messenger is bound — it only knows
 * the dependency name ('messenger') and the tools it expects ('send_message').
 * The host resolves the binding at runtime.
 *
 * @example
 * ```ts
 * // In the CRM's tool handler:
 * const result = await ctx.intent('messenger', 'send_message', {
 *   to: contact.id,
 *   body: `Hi ${contact.name}, your deal "${deal.name}" has been updated.`,
 * });
 * ```
 */

import { createApp } from '@agentapps/sdk';

// ---------------------------------------------------------------------------
// In-memory CRM store (demo only)
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  name: string;
  email: string;
}

export interface Deal {
  id: string;
  name: string;
  contactId: string;
  stage: 'lead' | 'qualified' | 'proposal' | 'closed-won' | 'closed-lost';
  value: number;
}

const contacts: Map<string, Contact> = new Map();
const deals: Map<string, Deal> = new Map();
let nextContactId = 1;
let nextDealId = 1;

/** Reset the store (used in tests). */
export function resetCrm(): void {
  contacts.clear();
  deals.clear();
  nextContactId = 1;
  nextDealId = 1;
}

// ---------------------------------------------------------------------------
// Create the app
// ---------------------------------------------------------------------------

const app = createApp({
  id: 'app.simple-crm',
  version: '1.0.0',
  name: 'Simple CRM',
  description: 'Lightweight CRM with messenger integration via intents.',
  author: { name: 'Pablo Lopez Torres', email: 'pablolopeztorres@gmail.com' },
  category: 'productivity',
  runtime: { transport: 'stdio', command: 'node', args: ['./dist/main.js'] },
  permissions: { intents: true },
  requires: [
    {
      name: 'messenger',
      tools: ['send_message'],
      suggest: 'app.messenger',
      optional: false,
    },
  ],
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

app.tool('add_contact', {
  description: 'Add a new contact to the CRM.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Contact full name' },
      email: { type: 'string', description: 'Contact email' },
    },
    required: ['name', 'email'],
  },
  handler: async (args) => {
    const contact: Contact = {
      id: `contact_${nextContactId++}`,
      name: args.name as string,
      email: args.email as string,
    };
    contacts.set(contact.id, contact);
    return { created: true, contact };
  },
});

app.tool('create_deal', {
  description: 'Create a deal for an existing contact.',
  parameters: {
    type: 'object',
    properties: {
      contactId: { type: 'string', description: 'Contact ID' },
      name: { type: 'string', description: 'Deal name' },
      value: { type: 'number', description: 'Deal value' },
    },
    required: ['contactId', 'name', 'value'],
  },
  handler: async (args) => {
    const contactId = args.contactId as string;
    const contact = contacts.get(contactId);
    if (!contact) {
      return { error: `Contact ${contactId} not found` };
    }

    const deal: Deal = {
      id: `deal_${nextDealId++}`,
      name: args.name as string,
      contactId,
      stage: 'lead',
      value: args.value as number,
    };
    deals.set(deal.id, deal);
    return { created: true, deal };
  },
});

/**
 * The key tool: advance a deal's stage and notify the contact via the
 * bound messenger. This is where `ctx.intent()` is used.
 */
app.tool('advance_deal', {
  description: 'Advance a deal to the next stage and notify the contact via messenger.',
  parameters: {
    type: 'object',
    properties: {
      dealId: { type: 'string', description: 'Deal ID' },
      newStage: {
        type: 'string',
        description: 'New stage',
        enum: ['lead', 'qualified', 'proposal', 'closed-won', 'closed-lost'],
      },
    },
    required: ['dealId', 'newStage'],
  },
  handler: async (args, ctx) => {
    const dealId = args.dealId as string;
    const deal = deals.get(dealId);
    if (!deal) {
      return { error: `Deal ${dealId} not found` };
    }

    const contact = contacts.get(deal.contactId);
    if (!contact) {
      return { error: `Contact ${deal.contactId} not found` };
    }

    const oldStage = deal.stage;
    deal.stage = args.newStage as Deal['stage'];

    ctx.log('info', `Deal ${deal.name} moved: ${oldStage} → ${deal.stage}`, {
      dealId: deal.id,
      contactId: contact.id,
    });

    // --- Intent call: notify the contact via the bound messenger ---
    let messengerResult: unknown;
    try {
      messengerResult = await ctx.intent('messenger', 'send_message', {
        to: contact.id,
        body: `Hi ${contact.name}, your deal "${deal.name}" has been updated to "${deal.stage}".`,
      });
    } catch (err) {
      ctx.log('warn', `Messenger notification failed: ${err instanceof Error ? err.message : err}`);
      return {
        dealUpdated: true,
        deal,
        notified: false,
        notificationError: err instanceof Error ? err.message : String(err),
      };
    }

    return {
      dealUpdated: true,
      deal,
      notified: true,
      messengerResult,
    };
  },
});

app.tool('list_contacts', {
  description: 'List all contacts.',
  parameters: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  handler: async () => {
    return { contacts: Array.from(contacts.values()) };
  },
});

app.tool('list_deals', {
  description: 'List all deals.',
  parameters: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  handler: async () => {
    return { deals: Array.from(deals.values()) };
  },
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const crmFactory = app.toFactory();
export default crmFactory;
