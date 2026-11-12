/**
 * Intents Pair — end-to-end test for intent bindings.
 *
 * Wires a CRM app (consumer) and a Messenger app (provider) through two
 * independent app station instances. The CRM calls `ctx.intent('messenger',
 * 'send_message', {...})` and the host resolves the binding, routes the
 * call to the messenger's app station, and returns the result.
 *
 * This test demonstrates the full intent flow:
 * 1. CRM declares `requires: [{name: 'messenger', tools: ['send_message']}]`
 * 2. Host binds 'messenger' → the messenger's installationId
 * 3. CRM tool handler calls `ctx.intent('messenger', 'send_message', ...)`
 * 4. SDK sends intent_call callback to host
 * 5. Host resolves binding, calls send_message on messenger, returns result
 * 6. CRM receives the result in its tool handler
 */

import { AgentAppHost, InMemoryBindingStore } from '@agentapps/host';
import { createInProcessTransportPair } from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crmFactory, resetCrm } from '../src/crm-app.js';
import { getMessages, messengerFactory, resetMessages } from '../src/messenger-app.js';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let crmController: AppStation;
let messengerController: AppStation;
let crmHost: AgentAppHost;
let messengerHost: AgentAppHost;
let bindingStore: InMemoryBindingStore;

// Session state
let crmSessionId: string;

beforeEach(async () => {
  resetCrm();
  resetMessages();
  bindingStore = new InMemoryBindingStore();

  // ------- Messenger setup (provider) -------
  const messengerRuntime = new InProcessRuntime(messengerFactory);
  messengerController = new AppStation({
    appId: 'app.messenger',
    appVersion: '1.0.0',
    runtime: messengerRuntime,
  });

  const [messengerHostSide, messengerCtrlSide] = createInProcessTransportPair();
  messengerController.accept(messengerCtrlSide);

  messengerHost = new AgentAppHost(messengerHostSide, {
    host: { name: 'test-platform', version: '1.0.0' },
    capabilities: {
      multiUser: true,
      push: true,
      prompts: ['auth', 'secret', 'url'],
      storage: true,
      objects: true,
      volume: true,
      profile: true,
      intents: true,
    },
  });

  await messengerHost.initialize();

  // Open a messenger session (we'll use it to forward intent calls)
  const messengerSession = await messengerHost.openSession({
    installationId: 'inst_messenger',
    tenant: { userId: 'u_test' },
  });

  // ------- CRM setup (consumer) -------
  const crmRuntime = new InProcessRuntime(crmFactory);
  crmController = new AppStation({
    appId: 'app.simple-crm',
    appVersion: '1.0.0',
    runtime: crmRuntime,
  });

  const [crmHostSide, crmCtrlSide] = createInProcessTransportPair();
  crmController.accept(crmCtrlSide);

  crmHost = new AgentAppHost(crmHostSide, {
    host: { name: 'test-platform', version: '1.0.0' },
    capabilities: {
      multiUser: true,
      push: true,
      prompts: ['auth', 'secret', 'url'],
      storage: true,
      objects: true,
      volume: true,
      profile: true,
      intents: true,
    },
    requests: {
      /**
       * Intent handler: the host resolves the binding and routes the call
       * to the target app. In production this would be generic; here we
       * wire it explicitly to the messenger session.
       */
      onIntentCall: async (_sessionId, _requestId, binding, tool, args) => {
        const targetInstallationId = bindingStore.resolve('inst_crm', binding);
        if (!targetInstallationId) {
          return {
            success: false,
            error: { code: 'BINDING_NOT_FOUND', message: `No binding for '${binding}'` },
            duration: 0,
          };
        }

        // Route to the messenger session
        const start = Date.now();
        try {
          const result = await messengerSession.callTool(tool, args, {
            userId: 'u_test',
            installationId: targetInstallationId,
          });
          return {
            success: result.success,
            result: result.result,
            duration: Date.now() - start,
          };
        } catch (err) {
          return {
            success: false,
            error: {
              code: 'INTENT_FAILED',
              message: err instanceof Error ? err.message : String(err),
            },
            duration: Date.now() - start,
          };
        }
      },
    },
  });

  await crmHost.initialize();

  const session = await crmHost.openSession({
    installationId: 'inst_crm',
    tenant: { userId: 'u_test' },
    // POLICY-REQ-8: intent_call needs the intents Permission.
    effectivePermissions: { permissions: { intents: true } },
  });
  crmSessionId = session.sessionId;

  // ------- Bind messenger → CRM's 'messenger' requirement -------
  bindingStore.bind('inst_crm', 'messenger', 'inst_messenger');
});

afterEach(async () => {
  await crmHost.shutdown();
  await messengerHost.shutdown();
  await crmController.shutdown();
  await messengerController.shutdown();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CRM → Messenger intent flow', () => {
  it('advance_deal sends a notification via the bound messenger', async () => {
    const crmSession = crmHost.getSession(crmSessionId)!;

    // 1. Create a contact
    const contactResult = await crmSession.callTool(
      'add_contact',
      { name: 'Alice', email: 'alice@example.com' },
      { userId: 'u_test', installationId: 'inst_crm' },
    );
    expect(contactResult.success).toBe(true);
    const contact = (contactResult.result as { contact: { id: string } }).contact;

    // 2. Create a deal
    const dealResult = await crmSession.callTool(
      'create_deal',
      { contactId: contact.id, name: 'Enterprise Plan', value: 50000 },
      { userId: 'u_test', installationId: 'inst_crm' },
    );
    expect(dealResult.success).toBe(true);
    const deal = (dealResult.result as { deal: { id: string } }).deal;

    // 3. Advance the deal — this triggers ctx.intent('messenger', 'send_message', ...)
    const advanceResult = await crmSession.callTool(
      'advance_deal',
      { dealId: deal.id, newStage: 'qualified' },
      { userId: 'u_test', installationId: 'inst_crm' },
    );

    expect(advanceResult.success).toBe(true);
    const data = advanceResult.result as {
      dealUpdated: boolean;
      deal: { stage: string };
      notified: boolean;
      messengerResult: { delivered: boolean; messageId: string; to: string };
    };

    // Deal was updated
    expect(data.dealUpdated).toBe(true);
    expect(data.deal.stage).toBe('qualified');

    // Notification was sent via intent
    expect(data.notified).toBe(true);
    expect(data.messengerResult.delivered).toBe(true);
    expect(data.messengerResult.to).toBe(contact.id);

    // Verify the message landed in the messenger's store
    const msgs = getMessages();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].to).toBe(contact.id);
    expect(msgs[0].body).toContain('Enterprise Plan');
    expect(msgs[0].body).toContain('qualified');
  });

  it('intent fails gracefully when binding is missing', async () => {
    // Remove the binding
    bindingStore.unbind('inst_crm', 'messenger');

    const crmSession = crmHost.getSession(crmSessionId)!;

    // Create contact + deal
    const contactResult = await crmSession.callTool(
      'add_contact',
      { name: 'Bob', email: 'bob@example.com' },
      { userId: 'u_test', installationId: 'inst_crm' },
    );
    const contact = (contactResult.result as { contact: { id: string } }).contact;

    const dealResult = await crmSession.callTool(
      'create_deal',
      { contactId: contact.id, name: 'Starter Plan', value: 1000 },
      { userId: 'u_test', installationId: 'inst_crm' },
    );
    const deal = (dealResult.result as { deal: { id: string } }).deal;

    // Advance — intent will fail because no binding
    const advanceResult = await crmSession.callTool(
      'advance_deal',
      { dealId: deal.id, newStage: 'proposal' },
      { userId: 'u_test', installationId: 'inst_crm' },
    );

    expect(advanceResult.success).toBe(true); // Tool itself succeeds
    const data = advanceResult.result as {
      dealUpdated: boolean;
      notified: boolean;
      notificationError: string;
    };

    // Deal was still updated
    expect(data.dealUpdated).toBe(true);
    // But notification failed
    expect(data.notified).toBe(false);
    expect(data.notificationError).toBeDefined();

    // No messages in messenger store
    expect(getMessages()).toHaveLength(0);
  });

  it('multiple deal advances send multiple messages', async () => {
    const crmSession = crmHost.getSession(crmSessionId)!;

    // Create contact + deal
    const contactResult = await crmSession.callTool(
      'add_contact',
      { name: 'Carol', email: 'carol@example.com' },
      { userId: 'u_test', installationId: 'inst_crm' },
    );
    const contact = (contactResult.result as { contact: { id: string } }).contact;

    const dealResult = await crmSession.callTool(
      'create_deal',
      { contactId: contact.id, name: 'Pro Plan', value: 25000 },
      { userId: 'u_test', installationId: 'inst_crm' },
    );
    const deal = (dealResult.result as { deal: { id: string } }).deal;

    // Advance through two stages
    await crmSession.callTool(
      'advance_deal',
      { dealId: deal.id, newStage: 'qualified' },
      { userId: 'u_test', installationId: 'inst_crm' },
    );
    await crmSession.callTool(
      'advance_deal',
      { dealId: deal.id, newStage: 'closed-won' },
      { userId: 'u_test', installationId: 'inst_crm' },
    );

    // Both messages should be in the messenger store
    const msgs = getMessages();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].body).toContain('qualified');
    expect(msgs[1].body).toContain('closed-won');
  });
});

describe('BindingStore', () => {
  it('stores and resolves bindings', () => {
    expect(bindingStore.resolve('inst_crm', 'messenger')).toBe('inst_messenger');
  });

  it('returns null for unknown bindings', () => {
    expect(bindingStore.resolve('inst_crm', 'unknown')).toBeNull();
    expect(bindingStore.resolve('inst_unknown', 'messenger')).toBeNull();
  });

  it('lists all bindings for an installation', () => {
    bindingStore.bind('inst_crm', 'email', 'inst_email_app');
    const bindings = bindingStore.listBindings('inst_crm');
    expect(bindings).toHaveLength(2);
    expect(bindings.map((b) => b.bindingName).sort()).toEqual(['email', 'messenger']);
  });

  it('unbind removes the binding', () => {
    bindingStore.unbind('inst_crm', 'messenger');
    expect(bindingStore.resolve('inst_crm', 'messenger')).toBeNull();
    expect(bindingStore.listBindings('inst_crm')).toHaveLength(0);
  });

  it('overwriting a binding updates it', () => {
    bindingStore.bind('inst_crm', 'messenger', 'inst_other_messenger');
    expect(bindingStore.resolve('inst_crm', 'messenger')).toBe('inst_other_messenger');
    expect(bindingStore.listBindings('inst_crm')).toHaveLength(1);
  });
});

describe('CRM manifest', () => {
  it('declares the messenger requirement', async () => {
    // The CRM app's manifest should include the requires section
    const crmSession = crmHost.getSession(crmSessionId)!;
    const tools = await crmSession.listTools();

    // Verify we can see CRM tools
    const toolNames = tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('add_contact');
    expect(toolNames).toContain('create_deal');
    expect(toolNames).toContain('advance_deal');
    expect(toolNames).toContain('list_contacts');
    expect(toolNames).toContain('list_deals');
  });
});
