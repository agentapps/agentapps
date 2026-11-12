/**
 * Tests for the Google Contacts Agent App.
 *
 * Mocks the Google People API so tests run without real credentials.
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
  timeoutMs = 3000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = received.find((m) => predicate(m as Record<string, unknown>));
    if (found) return found as Record<string, unknown>;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('Timeout waiting for message');
}

async function waitForType(type: string, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return waitFor((m) => m.type === type, timeoutMs);
}

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
    installationId: 'inst_google_contacts',
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
    context: { userId: 'u_test', installationId: 'inst_google_contacts' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Secrets for the message handler
// ---------------------------------------------------------------------------

const SYSTEM_SECRETS = {
  CLIENT_ID: 'test-client-id',
  CLIENT_SECRET: 'test-client-secret',
};

const USER_SECRETS = {
  ACCESS_TOKEN: 'test-access-token',
  REFRESH_TOKEN: 'test-refresh-token',
  EXPIRY_DATE: String(Date.now() + 3600 * 1000), // 1 hour from now
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('{}'),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.google.contacts',
    appVersion: '2.0.0',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  host.onMessage((msg) => {
    const m = msg as Record<string, unknown>;
    const type = m.type as string;
    const sessionId = m.sessionId as string;
    const requestId = (m.requestId as string) ?? (m.id as string);

    if (type === 'get_system_secrets') {
      host.send({
        ...createEnvelope('system_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: SYSTEM_SECRETS,
      } as MessageBase);
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: USER_SECRETS,
      } as MessageBase);
    }

    if (type === 'update_installation_secrets') {
      host.send({
        ...createEnvelope('user_secrets_updated', sessionId),
        id: requestId,
        requestId,
        success: true,
      } as MessageBase);
    }

    if (type === 'request_auth') {
      host.send({
        ...createEnvelope('auth_result', sessionId),
        id: requestId,
        requestId,
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
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
// Tests
// ---------------------------------------------------------------------------

describe('Google Contacts Agent App', () => {
  // -------------------------------------------------------------------------
  // Tool listing
  // -------------------------------------------------------------------------

  it('lists all 13 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-contacts-to-group',
      'create-contact',
      'create-contact-group',
      'delete-contact',
      'delete-contact-group',
      'get-contact',
      'get-contact-group',
      'list-contact-groups',
      'list-contacts',
      'remove-contacts-from-group',
      'search-contacts',
      'update-contact',
      'update-contact-group',
    ]);
  });

  // -------------------------------------------------------------------------
  // Health check
  // -------------------------------------------------------------------------

  it('health check reports ready when secrets are present and API responds', async () => {
    // The health handler returns { status: 'ready' } after successfully
    // verifying credentials against the People API, and the SDK reports 'ready'.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({ resourceName: 'people/me', names: [{ displayName: 'Test User' }] }),
          ),
        json: () =>
          Promise.resolve({ resourceName: 'people/me', names: [{ displayName: 'Test User' }] }),
      }),
    );

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    // The health handler returns { status: 'ready' } on the success path.
    expect(health.status).toBe('ready');
  });

  it('health check reports not_ready when system secrets are missing', async () => {
    // Override the secret handler to return empty system secrets
    const runtime = new InProcessRuntime(factory);
    const ctrl = new AppStation({
      appId: 'app.google.contacts',
      appVersion: '2.0.0',
      runtime,
    });
    const [hostSide2, ctrlSide2] = createInProcessTransportPair();
    const received2: MessageBase[] = [];
    hostSide2.onMessage((msg) => received2.push(msg));

    hostSide2.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      const type = m.type as string;
      const sessionId = m.sessionId as string;
      const requestId = (m.requestId as string) ?? (m.id as string);

      if (type === 'get_system_secrets') {
        hostSide2.send({
          ...createEnvelope('system_secrets', sessionId),
          id: requestId,
          requestId,
          secrets: {},
        } as MessageBase);
      }

      if (type === 'get_installation_secrets') {
        hostSide2.send({
          ...createEnvelope('installation_secrets', sessionId),
          id: requestId,
          requestId,
          secrets: USER_SECRETS,
        } as MessageBase);
      }
    });

    ctrl.accept(ctrlSide2);

    // Initialize
    hostSide2.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);

    const waitForMsg = async (type: string): Promise<Record<string, unknown>> => {
      const start = Date.now();
      while (Date.now() - start < 3000) {
        const found = received2.find((m) => (m as Record<string, unknown>).type === type);
        if (found) return found as Record<string, unknown>;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error(`Timeout waiting for ${type}`);
    };

    await waitForMsg('initialized');
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_google_contacts_2',
      tenant: { userId: 'u_test' },
    } as MessageBase);
    const opened = await waitForMsg('session_opened');
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('health_check'),
      sessionId: (opened as Record<string, unknown>).sessionId as string,
    } as MessageBase);

    const health = await waitForMsg('health_status');
    expect(health.status).toBe('not_ready');

    await ctrl.shutdown();
  });

  // -------------------------------------------------------------------------
  // list-contacts
  // -------------------------------------------------------------------------

  it('list-contacts returns formatted contacts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              connections: [
                {
                  resourceName: 'people/c1',
                  names: [{ displayName: 'Alice Smith', givenName: 'Alice', familyName: 'Smith' }],
                  emailAddresses: [{ value: 'alice@example.com' }],
                  phoneNumbers: [{ value: '+1234567890', type: 'mobile' }],
                  organizations: [{ name: 'Acme Corp', title: 'Engineer' }],
                  photos: [{ url: 'https://photo.example.com/alice.jpg' }],
                },
                {
                  resourceName: 'people/c2',
                  names: [{ displayName: 'Bob Jones', givenName: 'Bob', familyName: 'Jones' }],
                  emailAddresses: [{ value: 'bob@example.com' }],
                },
              ],
              totalItems: 2,
              nextPageToken: 'next_page_abc',
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', { pageSize: 50 });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const contacts = data.contacts as Array<Record<string, unknown>>;
    expect(contacts).toHaveLength(2);
    expect(contacts[0].name).toBe('Alice Smith');
    expect(contacts[0].givenName).toBe('Alice');
    expect(contacts[0].familyName).toBe('Smith');
    expect(contacts[0].emails).toEqual(['alice@example.com']);
    expect(contacts[0].phones).toEqual([{ value: '+1234567890', type: 'mobile' }]);
    expect(contacts[0].organization).toBe('Acme Corp');
    expect(contacts[0].title).toBe('Engineer');
    expect(contacts[0].photo).toBe('https://photo.example.com/alice.jpg');
    expect(contacts[1].name).toBe('Bob Jones');
    expect(data.totalItems).toBe(2);
    expect(data.nextPageToken).toBe('next_page_abc');
  });

  it('list-contacts returns empty array when no connections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ totalItems: 0 })),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-contacts', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const contacts = data.contacts as Array<Record<string, unknown>>;
    expect(contacts).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // create-contact
  // -------------------------------------------------------------------------

  it('create-contact creates a new contact', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            resourceName: 'people/c999',
            names: [{ displayName: 'Jane Doe' }],
          }),
        ),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-contact', {
      givenName: 'Jane',
      familyName: 'Doe',
      email: 'jane@example.com',
      phone: '+9876543210',
      organization: 'Test Inc',
      title: 'CEO',
      notes: 'Important contact',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.resourceName).toBe('people/c999');
    expect(data.name).toBe('Jane Doe');

    // Verify the fetch call was made to the correct endpoint with POST
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('people:createContact');
    expect(fetchCall[1].method).toBe('POST');

    const body = JSON.parse(fetchCall[1].body);
    expect(body.names[0].givenName).toBe('Jane');
    expect(body.names[0].familyName).toBe('Doe');
    expect(body.emailAddresses[0].value).toBe('jane@example.com');
    expect(body.phoneNumbers[0].value).toBe('+9876543210');
    expect(body.organizations[0].name).toBe('Test Inc');
    expect(body.organizations[0].title).toBe('CEO');
    expect(body.biographies[0].value).toBe('Important contact');
  });

  it('create-contact with minimal fields (givenName only)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              resourceName: 'people/c1000',
              names: [{ displayName: 'Sam' }],
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { givenName: 'Sam' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.resourceName).toBe('people/c1000');
    expect(data.name).toBe('Sam');
  });

  // -------------------------------------------------------------------------
  // search-contacts
  // -------------------------------------------------------------------------

  it('search-contacts returns matching contacts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              results: [
                {
                  person: {
                    resourceName: 'people/c5',
                    names: [{ displayName: 'Alice Wonderland' }],
                    emailAddresses: [{ value: 'alice@wonderland.com' }],
                    phoneNumbers: [{ value: '+1111111111' }],
                    organizations: [{ name: 'Wonderland Inc' }],
                    photos: [{ url: 'https://photo.example.com/alice_w.jpg' }],
                  },
                },
              ],
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-contacts', { query: 'Alice' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const contacts = data.contacts as Array<Record<string, unknown>>;
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe('Alice Wonderland');
    expect(contacts[0].emails).toEqual(['alice@wonderland.com']);
    expect(contacts[0].phones).toEqual(['+1111111111']);
    expect(contacts[0].organization).toBe('Wonderland Inc');
  });

  it('search-contacts returns empty when no matches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'search-contacts', { query: 'zzz_nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const contacts = data.contacts as Array<Record<string, unknown>>;
    expect(contacts).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // get-contact
  // -------------------------------------------------------------------------

  it('get-contact returns detailed contact info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              resourceName: 'people/c42',
              etag: 'etag_abc',
              names: [{ displayName: 'Charlie Brown', givenName: 'Charlie', familyName: 'Brown' }],
              emailAddresses: [{ value: 'charlie@example.com', type: 'work' }],
              phoneNumbers: [{ value: '+5555555555', type: 'home' }],
              organizations: [{ name: 'Peanuts Inc', title: 'Manager' }],
              addresses: [
                { formattedValue: '123 Main St', type: 'home', city: 'Springfield', country: 'US' },
              ],
              biographies: [{ value: 'Good grief' }],
              birthdays: [{ date: { year: 1950, month: 10, day: 2 } }],
              urls: [{ value: 'https://charlie.example.com', type: 'blog' }],
              photos: [{ url: 'https://photo.example.com/charlie.jpg' }],
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-contact', { resourceName: 'people/c42' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.resourceName).toBe('people/c42');
    expect(data.etag).toBe('etag_abc');
    expect(data.name).toBe('Charlie Brown');
    expect(data.givenName).toBe('Charlie');
    expect(data.familyName).toBe('Brown');
    expect(data.photo).toBe('https://photo.example.com/charlie.jpg');

    const emails = data.emails as Array<Record<string, unknown>>;
    expect(emails[0].value).toBe('charlie@example.com');
    expect(emails[0].type).toBe('work');

    const biographies = data.biographies as string[];
    expect(biographies[0]).toBe('Good grief');
  });

  // -------------------------------------------------------------------------
  // delete-contact
  // -------------------------------------------------------------------------

  it('delete-contact deletes the contact', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'delete-contact', { resourceName: 'people/c42' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.resourceName).toBe('people/c42');
    expect(data.deleted).toBe(true);

    // Verify DELETE method was used
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall[0]).toContain('people/c42:deleteContact');
    expect(fetchCall[1].method).toBe('DELETE');
  });

  // -------------------------------------------------------------------------
  // update-contact
  // -------------------------------------------------------------------------

  it('update-contact fetches current contact and applies changes', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((_url: string) => {
      callCount++;
      if (callCount === 1) {
        // First call: GET current contact for etag
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                resourceName: 'people/c42',
                etag: 'etag_123',
                names: [{ givenName: 'Charlie', familyName: 'Brown' }],
                emailAddresses: [{ value: 'old@example.com' }],
                organizations: [{ name: 'Old Corp', title: 'Old Title' }],
              }),
            ),
        });
      }
      // Second call: PATCH update
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              resourceName: 'people/c42',
              names: [{ displayName: 'Charlie Updated' }],
            }),
          ),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'update-contact', {
      resourceName: 'people/c42',
      givenName: 'Charlie',
      familyName: 'Updated',
      email: 'new@example.com',
    });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    expect(data.success).toBe(true);
    expect(data.resourceName).toBe('people/c42');

    // Verify the PATCH call includes etag and updated fields
    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall[0]).toContain('people/c42:updateContact');
    expect(patchCall[1].method).toBe('PATCH');

    const body = JSON.parse(patchCall[1].body);
    expect(body.etag).toBe('etag_123');
    expect(body.names[0].givenName).toBe('Charlie');
    expect(body.names[0].familyName).toBe('Updated');
    expect(body.emailAddresses[0].value).toBe('new@example.com');
  });

  // -------------------------------------------------------------------------
  // list-contact-groups
  // -------------------------------------------------------------------------

  it('list-contact-groups returns groups', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              contactGroups: [
                {
                  resourceName: 'contactGroups/myContacts',
                  name: 'myContacts',
                  formattedName: 'My Contacts',
                  groupType: 'SYSTEM_CONTACT_GROUP',
                  memberCount: 42,
                },
                {
                  resourceName: 'contactGroups/abc123',
                  name: 'Work',
                  formattedName: 'Work',
                  groupType: 'USER_CONTACT_GROUP',
                  memberCount: 10,
                },
              ],
              totalItems: 2,
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'list-contact-groups', {});

    const result = await waitForType('tool_result');
    expect(result.success).toBe(true);

    const data = result.result as Record<string, unknown>;
    const groups = data.groups as Array<Record<string, unknown>>;
    expect(groups).toHaveLength(2);
    expect(groups[0].formattedName).toBe('My Contacts');
    expect(groups[0].memberCount).toBe(42);
    expect(groups[1].name).toBe('Work');
    expect(groups[1].groupType).toBe('USER_CONTACT_GROUP');
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it('returns error when Google API returns 401 (unauthorized)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: { message: 'Request had invalid authentication credentials.', code: 401 },
            }),
          ),
      }),
    );

    // Override the secret handler to omit REFRESH_TOKEN so it doesn't attempt refresh
    const runtime = new InProcessRuntime(factory);
    const ctrl = new AppStation({
      appId: 'app.google.contacts',
      appVersion: '2.0.0',
      runtime,
    });
    const [hostSide2, ctrlSide2] = createInProcessTransportPair();
    const received2: MessageBase[] = [];
    hostSide2.onMessage((msg) => received2.push(msg));

    hostSide2.onMessage((msg) => {
      const m = msg as Record<string, unknown>;
      const type = m.type as string;
      const sId = m.sessionId as string;
      const requestId = (m.requestId as string) ?? (m.id as string);

      if (type === 'get_system_secrets') {
        hostSide2.send({
          ...createEnvelope('system_secrets', sId),
          id: requestId,
          requestId,
          secrets: SYSTEM_SECRETS,
        } as MessageBase);
      }
      if (type === 'get_installation_secrets') {
        hostSide2.send({
          ...createEnvelope('installation_secrets', sId),
          id: requestId,
          requestId,
          secrets: {
            ACCESS_TOKEN: 'expired-token',
            EXPIRY_DATE: String(Date.now() + 3600 * 1000),
          },
        } as MessageBase);
      }
    });

    ctrl.accept(ctrlSide2);

    const waitForMsg = async (type: string): Promise<Record<string, unknown>> => {
      const start = Date.now();
      while (Date.now() - start < 3000) {
        const found = received2.find((m) => (m as Record<string, unknown>).type === type);
        if (found) return found as Record<string, unknown>;
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error(`Timeout waiting for ${type}`);
    };

    // Initialize + open session
    hostSide2.send({
      ...createEnvelope('initialize'),
      supportedVersions: [PROTOCOL_VERSION],
      host: { name: 'test', version: '1.0.0' },
      capabilities: { directConnection: false },
    } as MessageBase);
    await waitForMsg('initialized');
    received2.length = 0;

    hostSide2.send({
      ...createEnvelope('session_open'),
      installationId: 'inst_google_contacts_err',
      tenant: { userId: 'u_test' },
    } as MessageBase);
    const opened = await waitForMsg('session_opened');
    received2.length = 0;

    const sId = (opened as Record<string, unknown>).sessionId as string;
    hostSide2.send({
      ...createEnvelope('tool_call'),
      sessionId: sId,
      tool: 'list-contacts',
      arguments: {},
      context: { userId: 'u_test', installationId: 'inst_google_contacts_err' },
    } as MessageBase);

    const result = await waitForMsg('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('AUTH_EXPIRED');

    await ctrl.shutdown();
  });

  it('returns error when Google API returns 404 (not found)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: { message: 'Person not found.', code: 404, status: 'NOT_FOUND' },
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'get-contact', { resourceName: 'people/c_nonexistent' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('NOT_FOUND');
  });

  it('returns error when Google API returns 403 (forbidden)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: { message: 'Request had insufficient authentication scopes.', code: 403 },
            }),
          ),
      }),
    );

    const sessionId = await initAndOpen();

    received.length = 0;
    sendToolCall(sessionId, 'create-contact', { givenName: 'Forbidden' });

    const result = await waitForType('tool_result');
    expect(result.success).toBe(false);

    const error = result.error as Record<string, unknown>;
    expect(error.message as string).toContain('PERMISSION_DENIED');
  });
});
