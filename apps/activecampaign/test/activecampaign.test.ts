/**
 * Integration tests for the ActiveCampaign Agent App.
 *
 * Mocks the ActiveCampaign API (global fetch) so tests run without real credentials.
 * Uses InProcessRuntime + AppStation from the Agent Apps SDK.
 */

import {
  createEnvelope,
  createInProcessTransportPair,
  type MessageBase,
  PROTOCOL_VERSION,
  type Transport,
} from '@agentapps/protocol';
import { AppStation, InProcessRuntime } from '@agentapps/station';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { factory } from '../src/app.js';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let appStation: AppStation;
let host: Transport;
let received: MessageBase[];

function collectMessages(transport: Transport): MessageBase[] {
  const msgs: MessageBase[] = [];
  transport.onMessage((msg) => msgs.push(msg));
  return msgs;
}

async function waitFor(
  predicate: (msg: Record<string, unknown>) => boolean,
  timeoutMs = 5000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return waitFor((m) => m.type === type, timeoutMs);
}

/** Track fetch calls for assertion. */
interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const fetchCalls: FetchCall[] = [];

/** Current mock response generator; tests override this. */
let nextResponse: () => Response;

function makeFetchMock() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({
      url: typeof input === 'string' ? input : (input as URL).toString(),
      method: (init?.method as string) ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: init?.body as string | undefined,
    });
    return nextResponse();
  });
}

const USER_SECRETS = {
  ACTIVECAMPAIGN_BASE_URL: 'https://test.api-us1.com',
  ACTIVECAMPAIGN_API_TOKEN: 'token-abc',
};

async function initAndOpen(): Promise<string> {
  host.send({
    ...createEnvelope('initialize'),
    supportedVersions: [PROTOCOL_VERSION],
    host: { name: 'test', version: '1.0.0' },
    capabilities: { directConnection: false },
  } as MessageBase);
  await waitForType('initialized');

  received.length = 0;
  host.send({
    ...createEnvelope('session_open'),
    installationId: 'inst_activecampaign',
    tenant: { userId: 'u_test' },
  } as MessageBase);
  const opened = await waitForType('session_opened');
  received.length = 0;
  return opened.sessionId as string;
}

function sendToolCall(sessionId: string, tool: string, args: Record<string, unknown>): void {
  host.send({
    ...createEnvelope('tool_call'),
    sessionId,
    tool,
    arguments: args,
    context: { userId: 'u_test', installationId: 'inst_activecampaign' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchCalls.length = 0;
  nextResponse = () =>
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  vi.stubGlobal('fetch', makeFetchMock());

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.activecampaign',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Respond to protocol secret requests with ActiveCampaign credentials.
  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    const type = m.type as string;
    const sessionId = m.sessionId as string;
    const requestId = (m.requestId as string) ?? (m.id as string);

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: USER_SECRETS,
      } as MessageBase);
    }
    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: {},
      } as MessageBase);
    }
  });

  appStation.accept(ctrlSide);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await appStation.shutdown();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Narrow tool_result.result.structuredContent for structured assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sc = (result: Record<string, unknown>): any =>
  (result.result as Record<string, unknown>)?.structuredContent;

// ---------------------------------------------------------------------------
// Tests — tool listing
// ---------------------------------------------------------------------------

describe('ActiveCampaign Agent App', () => {
  it('lists all 14 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-tag-to-contact',
      'create-contact',
      'create-deal',
      'delete-contact',
      'get-campaign',
      'get-contact',
      'get-deal',
      'list-campaigns',
      'list-contacts',
      'list-deals',
      'list-lists',
      'list-tags',
      'subscribe-contact-to-list',
      'update-contact',
    ]);
  });

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  it('health check reports ready when API is reachable', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ user: { id: '1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check reports not_ready when credentials are missing', async () => {
    // Shutdown the existing app station and create a new one with empty installation secrets.
    await appStation.shutdown();

    vi.stubGlobal('fetch', makeFetchMock());
    const runtime2 = new InProcessRuntime(factory);
    const ctrl2 = new AppStation({
      appId: 'app.activecampaign',
      appVersion: '2.0.0',
      runtime: runtime2,
    });
    const [hostSide2, ctrlSide2] = createInProcessTransportPair();
    const received2 = collectMessages(hostSide2);
    hostSide2.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      const type = m.type as string;
      const sid = m.sessionId as string;
      const rid = (m.requestId as string) ?? (m.id as string);
      if (type === 'get_installation_secrets') {
        hostSide2.send({
          ...createEnvelope('installation_secrets', sid),
          id: rid,
          requestId: rid,
          secrets: {},
        } as MessageBase);
      }
      if (type === 'get_system_secrets') {
        hostSide2.send({
          ...createEnvelope('system_secrets', sid),
          id: rid,
          requestId: rid,
          secrets: {},
        } as MessageBase);
      }
    });
    ctrl2.accept(ctrlSide2);

    // Initialize and open session
    hostSide2.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (received2.find((m) => (m as Record<string, unknown>).type === 'initialized')) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_ac_no_creds',
      tenant: { userId: 'u_test' },
    } as MessageBase);
    let opened: Record<string, unknown> | undefined;
    const start2 = Date.now();
    while (Date.now() - start2 < 5000) {
      opened = received2.find((m) => (m as Record<string, unknown>).type === 'session_opened') as
        | Record<string, unknown>
        | undefined;
      if (opened) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const sessionId2 = opened!.sessionId as string;
    received2.length = 0;

    hostSide2.send({ ...createEnvelope('health_check'), sessionId: sessionId2 } as MessageBase);
    const start3 = Date.now();
    let health: Record<string, unknown> | undefined;
    while (Date.now() - start3 < 5000) {
      health = received2.find((m) => (m as Record<string, unknown>).type === 'health_status') as
        | Record<string, unknown>
        | undefined;
      if (health) break;
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(health!.status).toBe('not_ready');
    expect((health!.issues as unknown[])?.length).toBeGreaterThan(0);

    // Replace app station for afterEach cleanup
    appStation = ctrl2;
  });

  // -------------------------------------------------------------------------
  // list-contacts
  // -------------------------------------------------------------------------

  it('list-contacts returns paginated curated contacts', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          contacts: [
            { id: '1', email: 'a@x.com', firstName: 'Ann', lastName: 'X' },
            { id: '2', email: 'b@x.com', firstName: 'Bob', lastName: 'Y' },
          ],
          meta: { total: '5' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', { limit: 2, offset: 0 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = sc(result);
    expect(data.contacts).toEqual([
      {
        id: '1',
        email: 'a@x.com',
        firstName: 'Ann',
        lastName: 'X',
        phone: '',
        cdate: '',
        udate: '',
      },
      {
        id: '2',
        email: 'b@x.com',
        firstName: 'Bob',
        lastName: 'Y',
        phone: '',
        cdate: '',
        udate: '',
      },
    ]);
    expect(data.total).toBe(5);
    expect(data.nextOffset).toBe(2);
  });

  it('list-contacts clamps limit to [1, 100]', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ contacts: [], meta: { total: '0' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'list-contacts', { limit: 9999 });

    await waitForType('tool_result');
    expect(fetchCalls.some((c) => c.url.includes('limit=100'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // get-contact
  // -------------------------------------------------------------------------

  it('get-contact returns curated contact', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ contact: { id: '42', email: 'x@y.z', firstName: 'X' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'get-contact', { id: '42' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(sc(result).contact).toEqual({
      id: '42',
      email: 'x@y.z',
      firstName: 'X',
      lastName: '',
      phone: '',
      cdate: '',
      udate: '',
    });
    expect(fetchCalls.some((c) => c.url.includes('/contacts/42'))).toBe(true);
  });

  it('get-contact fails when id missing', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-contact', { id: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // create-contact
  // -------------------------------------------------------------------------

  it('create-contact posts to /contact/sync with curated body', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ contact: { id: '99', email: 'jane@acme.com', firstName: 'Jane' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'create-contact', {
      email: 'jane@acme.com',
      firstName: 'Jane',
      phone: '+1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = sc(result);
    expect(data.contact).toEqual({
      id: '99',
      email: 'jane@acme.com',
      firstName: 'Jane',
      lastName: '',
      phone: '',
      cdate: '',
      udate: '',
    });

    const postCall = fetchCalls.find((c) => c.url.includes('/contact/sync'));
    expect(postCall).toBeDefined();
    expect(postCall!.method).toBe('POST');
    const body = JSON.parse(postCall!.body!);
    expect(body.contact).toEqual({ email: 'jane@acme.com', firstName: 'Jane', phone: '+1' });
    expect(body.contact.lastName).toBeUndefined();
  });

  it('create-contact rejects invalid email', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { email: 'not-an-email' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('create-contact rejects blank email', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { email: '  ' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // update-contact
  // -------------------------------------------------------------------------

  it('update-contact PUTs only provided fields', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ contact: { id: '1', email: 'new@x.com' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'update-contact', { id: '1', email: 'new@x.com' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const putCall = fetchCalls.find((c) => c.method === 'PUT');
    expect(putCall).toBeDefined();
    expect(putCall!.url).toContain('/contacts/1');
    const body = JSON.parse(putCall!.body!);
    expect(body).toEqual({ contact: { email: 'new@x.com' } });
  });

  it('update-contact requires at least one update field', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'update-contact', { id: '1' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('update-contact rejects a malformed email', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'update-contact', { id: '1', email: 'not-an-email' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    // Should not have made any API call
    expect(fetchCalls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // delete-contact
  // -------------------------------------------------------------------------

  it('delete-contact returns deleted: true', async () => {
    nextResponse = () => new Response(null, { status: 204 });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'delete-contact', { id: '7' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = sc(result);
    expect(data).toEqual({ id: '7', deleted: true });

    const deleteCall = fetchCalls.find((c) => c.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(deleteCall!.url).toContain('/contacts/7');
  });

  // -------------------------------------------------------------------------
  // subscribe-contact-to-list
  // -------------------------------------------------------------------------

  it('subscribe-contact-to-list maps subscribed -> 1', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ contactList: { id: '99', contact: '1', list: '5', status: '1' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'subscribe-contact-to-list', { contactId: '1', listId: '5' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const postCall = fetchCalls.find((c) => c.url.includes('/contactLists'));
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall!.body!);
    expect(body.contactList.status).toBe(1);
    expect(body.contactList.list).toBe('5');
    expect(body.contactList.contact).toBe('1');
  });

  it('subscribe-contact-to-list maps unsubscribed -> 2', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ contactList: { id: '99' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'subscribe-contact-to-list', {
      contactId: '1',
      listId: '5',
      status: 'unsubscribed',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const postCall = fetchCalls.find((c) => c.url.includes('/contactLists'));
    expect(JSON.parse(postCall!.body!).contactList.status).toBe(2);
  });

  // -------------------------------------------------------------------------
  // list-deals
  // -------------------------------------------------------------------------

  it('list-deals builds filter query params', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ deals: [], meta: { total: '0' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'list-deals', {
      search: 'big',
      pipelineId: 'p1',
      stageId: 's1',
      status: 'won',
    });

    await waitForType('tool_result');

    const dealCall = fetchCalls.find((c) => c.url.includes('/deals'));
    expect(dealCall).toBeDefined();
    expect(dealCall!.url).toContain('filters%5Bsearch%5D=big');
    expect(dealCall!.url).toContain('filters%5Bgroup%5D=p1');
    expect(dealCall!.url).toContain('filters%5Bstage%5D=s1');
    expect(dealCall!.url).toContain('filters%5Bstatus%5D=1');
  });

  // -------------------------------------------------------------------------
  // create-deal
  // -------------------------------------------------------------------------

  it('create-deal converts value to cents', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ deal: { id: '1', value: '150000', currency: 'usd' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'create-deal', {
      title: 'Big sale',
      value: 1500,
      pipelineId: 'p1',
      stageId: 's1',
      ownerId: 'u1',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const postCall = fetchCalls.find((c) => c.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse(postCall!.body!);
    expect(body.deal.value).toBe(150000);
    expect(body.deal.currency).toBe('usd');
    expect(body.deal.group).toBe('p1');
    expect(sc(result).deal.value).toBe(1500);
  });

  it('create-deal rejects missing required fields', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'create-deal', {
      title: '',
      value: 1,
      pipelineId: 'p',
      stageId: 's',
      ownerId: 'o',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  it('create-deal rejects a negative value', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'create-deal', {
      title: 'X',
      value: -5,
      pipelineId: 'p',
      stageId: 's',
      ownerId: 'o',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
    expect(fetchCalls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // get-deal
  // -------------------------------------------------------------------------

  it('get-deal returns curated deal', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({ deal: { id: '5', title: 'Big', value: '150000', currency: 'usd' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'get-deal', { id: '5' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(fetchCalls.some((c) => c.url.includes('/deals/5'))).toBe(true);
    expect(sc(result).deal).toEqual({
      id: '5',
      title: 'Big',
      description: '',
      value: 1500,
      currency: 'USD',
      status: 0,
      contact: null,
      account: null,
      pipeline: null,
      stage: null,
      owner: null,
      cdate: '',
      udate: '',
    });
  });

  it('get-deal fails when id missing', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-deal', { id: '  ' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // get-campaign
  // -------------------------------------------------------------------------

  it('get-campaign maps send_amt to recipients', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          campaign: {
            id: '7',
            name: 'Spring',
            send_amt: '500',
            opens: '320',
            uniqueopens: '300',
            linkclicks: '42',
            uniquelinkclicks: '40',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'get-campaign', { id: '7' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(fetchCalls.some((c) => c.url.includes('/campaigns/7'))).toBe(true);
    expect(sc(result).campaign).toEqual({
      id: '7',
      name: 'Spring',
      type: '',
      status: '',
      sendDate: null,
      fromName: '',
      fromEmail: '',
      subject: '',
      totalRecipients: 500,
      totalOpens: 320,
      totalLinks: 42,
      uniqueOpens: 300,
      uniqueLinks: 40,
      cdate: '',
    });
  });

  it('get-campaign fails when id missing', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-campaign', { id: '' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // list-campaigns
  // -------------------------------------------------------------------------

  it('list-campaigns curates items with pagination', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          campaigns: [{ id: '1', name: 'Spring', send_amt: '200' }],
          meta: { total: '1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'list-campaigns', { limit: 1, offset: 0 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = sc(result);
    expect(data).toEqual({
      campaigns: [
        {
          id: '1',
          name: 'Spring',
          type: '',
          status: '',
          sendDate: null,
          fromName: '',
          fromEmail: '',
          subject: '',
          totalRecipients: 200,
          totalOpens: 0,
          totalLinks: 0,
          uniqueOpens: 0,
          uniqueLinks: 0,
          cdate: '',
        },
      ],
      total: 1,
      nextOffset: null,
    });
    expect(fetchCalls.some((c) => c.url.includes('/campaigns') && c.url.includes('limit=1'))).toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // list-lists
  // -------------------------------------------------------------------------

  it('list-lists curates items', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          lists: [{ id: '3', name: 'NL', stringid: 'nl', subscriber_count: 10 }],
          meta: { total: '1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'list-lists', { limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(sc(result)).toEqual({
      lists: [{ id: '3', name: 'NL', stringid: 'nl', subscriberCount: 10, cdate: '' }],
      total: 1,
      nextOffset: null,
    });
  });

  // -------------------------------------------------------------------------
  // list-tags
  // -------------------------------------------------------------------------

  it('list-tags passes search and curates tags', async () => {
    nextResponse = () =>
      new Response(
        JSON.stringify({
          tags: [{ id: '2', tag: 'vip', tagType: 'contact' }],
          meta: { total: '1' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'list-tags', { search: 'vi', limit: 10 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    expect(sc(result)).toEqual({
      tags: [{ id: '2', name: 'vip', description: '', tagType: 'contact', cdate: '' }],
      total: 1,
      nextOffset: null,
    });
    expect(fetchCalls.some((c) => c.url.includes('/tags') && c.url.includes('search=vi'))).toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // add-tag-to-contact
  // -------------------------------------------------------------------------

  it('add-tag-to-contact POSTs to /contactTags', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ contactTag: { id: '9', contact: '1', tag: '2' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    fetchCalls.length = 0;
    sendToolCall(sessionId, 'add-tag-to-contact', { contactId: '1', tagId: '2' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);
    expect(sc(result)).toEqual({ contactTag: { id: '9', contact: '1', tag: '2' } });

    const postCall = fetchCalls.find((c) => c.url.includes('/contactTags'));
    expect(postCall).toBeDefined();
    expect(postCall!.method).toBe('POST');
    expect(JSON.parse(postCall!.body!)).toEqual({ contactTag: { contact: '1', tag: '2' } });
  });

  it('add-tag-to-contact fails when ids missing', async () => {
    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'add-tag-to-contact', { contactId: '', tagId: '2' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // API error propagation
  // -------------------------------------------------------------------------

  it('tool call fails on API 401 error', async () => {
    nextResponse = () =>
      new Response(JSON.stringify({ errors: [{ title: 'invalid token' }] }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });

    const sessionId = await initAndOpen();
    received.length = 0;
    sendToolCall(sessionId, 'get-contact', { id: '42' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);
  });
});
