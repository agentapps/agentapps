/**
 * Integration + unit tests for the Discord Agent App.
 *
 * Migrated from mca.discord/test/unit/ (bun:test) to vitest + InProcessRuntime harness.
 *
 * Mocks:
 * - `discord.js` REST class: captures all API calls via vi.fn() spies.
 * - `fetch`: mocked globally for send-webhook-message tool.
 * - Secrets: handled via protocol message handler (get_system_secrets, get_installation_secrets).
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

// ---------------------------------------------------------------------------
// Mock discord.js before importing the app factory
// ---------------------------------------------------------------------------

const mockRestGet = vi.fn();
const mockRestPost = vi.fn();
const mockRestPut = vi.fn();
const mockRestPatch = vi.fn();
const mockRestDelete = vi.fn();
const mockSetToken = vi.fn();

vi.mock('discord.js', () => {
  class MockREST {
    options: Record<string, unknown>;
    constructor(options?: Record<string, unknown>) {
      this.options = options ?? {};
    }
    setToken(token: string) {
      mockSetToken(token);
      return this;
    }
    get = mockRestGet;
    post = mockRestPost;
    put = mockRestPut;
    patch = mockRestPatch;
    delete = mockRestDelete;
  }

  // Provide real-ish route helpers that return predictable strings
  const Routes = {
    user: (id: string) => `/users/${id}`,
    userGuilds: () => '/users/@me/guilds',
    guild: (id: string) => `/guilds/${id}`,
    guildChannels: (id: string) => `/guilds/${id}/channels`,
    guildMembers: (id: string) => `/guilds/${id}/members`,
    guildMember: (guildId: string, userId: string) => `/guilds/${guildId}/members/${userId}`,
    guildRoles: (id: string) => `/guilds/${id}/roles`,
    guildMemberRole: (guildId: string, userId: string, roleId: string) =>
      `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    guildBan: (guildId: string, userId: string) => `/guilds/${guildId}/bans/${userId}`,
    guildWebhooks: (id: string) => `/guilds/${id}/webhooks`,
    channel: (id: string) => `/channels/${id}`,
    channelMessages: (id: string) => `/channels/${id}/messages`,
    channelMessage: (channelId: string, messageId: string) =>
      `/channels/${channelId}/messages/${messageId}`,
    channelMessageReaction: (channelId: string, messageId: string, emoji: string) =>
      `/channels/${channelId}/messages/${messageId}/reactions/${emoji}/@me`,
    channelWebhooks: (id: string) => `/channels/${id}/webhooks`,
  };

  const ChannelType = {
    GuildText: 0,
    DM: 1,
    GuildVoice: 2,
    GroupDM: 3,
    GuildCategory: 4,
    GuildAnnouncement: 5,
    GuildForum: 15,
    GuildStageVoice: 13,
  };

  return { REST: MockREST, Routes, ChannelType };
});

// Import factory AFTER mock is set up
import { factory } from '../src/app.js';

// ---------------------------------------------------------------------------
// Test harness (follows elevenlabs pattern)
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
    installationId: 'inst_discord',
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
    context: { userId: 'u_test', installationId: 'inst_discord' },
  } as MessageBase);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset discord.js REST mocks
  mockRestGet.mockReset();
  mockRestPost.mockReset();
  mockRestPut.mockReset();
  mockRestPatch.mockReset();
  mockRestDelete.mockReset();
  mockSetToken.mockReset();

  // Default: validateCredentials calls rest.get(Routes.user('@me'))
  mockRestGet.mockResolvedValue({ id: 'u_123', username: 'TestBot', discriminator: '0001' });

  // Mock global fetch for webhook tests
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    }),
  );

  const runtime = new InProcessRuntime(factory);
  appStation = new AppStation({
    appId: 'app.discord',
    appVersion: '2.0.1',
    runtime,
  });
  const [hostSide, ctrlSide] = createInProcessTransportPair();
  host = hostSide;
  received = collectMessages(host);

  // Handle secret request protocol messages
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
        secrets: { CLIENT_ID: 'test-client-id', CLIENT_SECRET: 'test-client-secret' },
      } as MessageBase);
    }

    if (type === 'get_installation_secrets') {
      host.send({
        ...createEnvelope('installation_secrets', sessionId),
        id: requestId,
        requestId,
        secrets: { BOT_TOKEN: 'test-bot-token', ACCESS_TOKEN: 'test-access-token' },
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
// Integration tests via InProcessRuntime harness
// ---------------------------------------------------------------------------

describe('Discord Agent App — integration', () => {
  it('lists all 22 tools', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('list_tools'), sessionId } as MessageBase);
    const toolsList = await waitForType('tools_list');
    const tools = toolsList.tools as Array<{ name: string }>;

    expect(tools).toHaveLength(22);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add-reaction',
      'assign-role',
      'ban-member',
      'create-channel',
      'create-role',
      'create-webhook',
      'delete-channel',
      'delete-message',
      'get-channel',
      'get-guild',
      'get-member',
      'kick-member',
      'list-channels',
      'list-guilds',
      'list-members',
      'list-messages',
      'list-roles',
      'list-webhooks',
      'remove-role',
      'send-message',
      'send-webhook-message',
      'timeout-member',
    ]);
  });

  it('health check reports ready with valid credentials', async () => {
    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('ready');
  });

  it('health check reports degraded when credentials fail', async () => {
    mockRestGet.mockRejectedValue(new Error('HTTP 401'));

    const sessionId = await initAndOpen();

    host.send({ ...createEnvelope('health_check'), sessionId } as MessageBase);
    const health = await waitForType('health_status');

    expect(health.status).toBe('degraded');
    expect(health.message).toContain('Health check failed');
  });

  // ---------------------------------------------------------------------------
  // send-message tool
  // ---------------------------------------------------------------------------

  describe('send-message', () => {
    it('sends a basic message with default allowed_mentions', async () => {
      mockRestPost.mockResolvedValue({
        id: 'msg_1',
        channel_id: 'ch_1',
        content: 'hello @user',
        timestamp: '2026-06-05T00:00:00Z',
      });

      const sessionId = await initAndOpen();

      received.length = 0;
      sendToolCall(sessionId, 'send-message', { channelId: 'ch_1', content: 'hello @user' });

      const result = await waitForType('tool_result');
      expect(result.success).toBe(true);

      const data = result.result as Record<string, unknown>;
      expect(data.id).toBe('msg_1');
      expect(data.channel_id).toBe('ch_1');
      expect(data.content).toBe('hello @user');
      expect(data.url).toBe('https://discord.com/channels/@me/ch_1/msg_1');
    });

    it('default allowed_mentions: roles and users enabled, everyone disabled (regression)', async () => {
      mockRestPost.mockResolvedValue({
        id: 'msg_2',
        channel_id: 'ch_1',
        content: 'hi',
        timestamp: '2026-06-05T00:00:00Z',
      });

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-message', { channelId: 'ch_1', content: 'hi' });

      await waitForType('tool_result');

      // Inspect the body passed to rest.post
      expect(mockRestPost).toHaveBeenCalled();
      const postArgs = mockRestPost.mock.calls[0];
      const route = postArgs[0];
      const body = postArgs[1].body;

      expect(route).toBe('/channels/ch_1/messages');
      expect(body.allowed_mentions.parse).toEqual(['roles', 'users']);
      expect(body.allowed_mentions.replied_user).toBe(false);
    });

    it('mentionEveryone: true adds everyone to parse', async () => {
      mockRestPost.mockResolvedValue({
        id: 'msg_3',
        channel_id: 'ch_1',
        content: 'hey',
        timestamp: '2026-06-05T00:00:00Z',
      });

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-message', {
        channelId: 'ch_1',
        content: 'hey',
        mentionEveryone: true,
      });

      await waitForType('tool_result');

      const body = mockRestPost.mock.calls[0][1].body;
      expect(body.allowed_mentions.parse).toEqual(['everyone', 'roles', 'users']);
    });

    it('explicit mentionRoles/mentionUsers false disables them', async () => {
      mockRestPost.mockResolvedValue({
        id: 'msg_4',
        channel_id: 'ch_1',
        content: 'x',
        timestamp: '2026-06-05T00:00:00Z',
      });

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-message', {
        channelId: 'ch_1',
        content: 'x',
        mentionRoles: false,
        mentionUsers: false,
      });

      await waitForType('tool_result');

      const body = mockRestPost.mock.calls[0][1].body;
      expect(body.allowed_mentions.parse).toEqual([]);
    });

    it('reply adds message_reference with channel_id', async () => {
      mockRestPost.mockResolvedValue({
        id: 'msg_5',
        channel_id: 'ch_1',
        content: 'reply',
        timestamp: '2026-06-05T00:00:00Z',
      });

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-message', {
        channelId: 'ch_1',
        content: 'reply',
        replyToMessageId: 'msg_0',
      });

      await waitForType('tool_result');

      const body = mockRestPost.mock.calls[0][1].body;
      expect(body.message_reference).toEqual({
        message_id: 'msg_0',
        channel_id: 'ch_1',
      });
    });

    it('valid embeds JSON is parsed and included', async () => {
      mockRestPost.mockResolvedValue({
        id: 'msg_6',
        channel_id: 'ch_1',
        content: '',
        timestamp: '2026-06-05T00:00:00Z',
      });

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-message', {
        channelId: 'ch_1',
        embeds: '[{"title":"Test Embed"}]',
      });

      await waitForType('tool_result');

      const body = mockRestPost.mock.calls[0][1].body;
      expect(body.embeds).toEqual([{ title: 'Test Embed' }]);
    });

    it('invalid embeds JSON returns an error', async () => {
      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-message', {
        channelId: 'ch_1',
        embeds: '{broken',
      });

      const result = await waitForType('tool_result');
      expect(result.success).toBe(false);
    });

    it('guild message uses guild_id in the URL', async () => {
      mockRestPost.mockResolvedValue({
        id: 'm2',
        channel_id: 'ch_2',
        guild_id: 'g_9',
        content: 'guild msg',
        timestamp: '2026-06-05T00:00:00Z',
      });

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-message', { channelId: 'ch_2', content: 'guild msg' });

      const result = await waitForType('tool_result');
      expect(result.success).toBe(true);

      const data = result.result as Record<string, unknown>;
      expect(data.url).toBe('https://discord.com/channels/g_9/ch_2/m2');
    });
  });

  // ---------------------------------------------------------------------------
  // list-guilds tool
  // ---------------------------------------------------------------------------

  describe('list-guilds', () => {
    it('returns guild list with mapped fields', async () => {
      mockRestGet.mockResolvedValue([
        {
          id: 'g1',
          name: 'Test Guild',
          icon: 'abc',
          owner: true,
          permissions: '123',
          approximate_member_count: 50,
          approximate_presence_count: 10,
        },
      ]);

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'list-guilds', {});

      const result = await waitForType('tool_result');
      expect(result.success).toBe(true);

      const data = result.result as Record<string, unknown>;
      const guilds = data.guilds as Array<Record<string, unknown>>;
      expect(guilds).toHaveLength(1);
      expect(guilds[0].id).toBe('g1');
      expect(guilds[0].name).toBe('Test Guild');
      expect(data.total).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // list-channels tool
  // ---------------------------------------------------------------------------

  describe('list-channels', () => {
    it('returns channel list for a guild', async () => {
      mockRestGet.mockResolvedValue([
        { id: 'c1', type: 0, name: 'general', position: 0, parent_id: null },
        { id: 'c2', type: 2, name: 'voice', position: 1, parent_id: null },
      ]);

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'list-channels', { guildId: 'g1' });

      const result = await waitForType('tool_result');
      expect(result.success).toBe(true);

      const data = result.result as Record<string, unknown>;
      const channels = data.channels as Array<Record<string, unknown>>;
      expect(channels).toHaveLength(2);
      expect(channels[0].name).toBe('general');
      expect(data.total).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // add-reaction tool
  // ---------------------------------------------------------------------------

  describe('add-reaction', () => {
    it('adds a reaction and returns success', async () => {
      mockRestPut.mockResolvedValue(undefined);

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'add-reaction', {
        channelId: 'ch_1',
        messageId: 'msg_1',
        emoji: '👍',
      });

      const result = await waitForType('tool_result');
      expect(result.success).toBe(true);

      const data = result.result as Record<string, unknown>;
      expect(data.success).toBe(true);
      expect(data.message).toContain('👍');
    });
  });

  // ---------------------------------------------------------------------------
  // send-webhook-message tool (uses global fetch)
  // ---------------------------------------------------------------------------

  describe('send-webhook-message', () => {
    it('sends a webhook message via fetch', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'wh_msg_1',
            channel_id: 'ch_w1',
            content: 'webhook content',
          }),
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', fetchMock);

      const sessionId = await initAndOpen();
      received.length = 0;
      sendToolCall(sessionId, 'send-webhook-message', {
        webhookId: 'wh_1',
        webhookToken: 'wh_token_1',
        content: 'webhook content',
      });

      const result = await waitForType('tool_result');
      expect(result.success).toBe(true);

      const data = result.result as Record<string, unknown>;
      expect(data.id).toBe('wh_msg_1');
      expect(data.success).toBe(true);

      // Verify fetch was called with correct webhook URL
      const fetchCall = fetchMock.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('/webhooks/'),
      );
      expect(fetchCall).toBeDefined();
      expect(fetchCall![0]).toContain('webhooks/wh_1/wh_token_1');
      expect(fetchCall![1].method).toBe('POST');
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests for discord-client.ts helpers (migrated from old tests)
// ---------------------------------------------------------------------------

import { buildEmbed, handleDiscordError } from '../src/lib/discord-client.js';

describe('handleDiscordError — error classification', () => {
  it.each([
    [
      'rate limit text',
      'You are being rate limited',
      'Discord rate limit hit during op. Please retry in a moment.',
    ],
    [
      '429 status',
      'Request failed with status 429',
      'Discord rate limit hit during op. Please retry in a moment.',
    ],
    [
      '401 status',
      'HTTP 401',
      'Discord authentication failed during op. Please reconnect your account.',
    ],
    [
      'Unauthorized',
      'Unauthorized',
      'Discord authentication failed during op. Please reconnect your account.',
    ],
    [
      '403 status',
      'HTTP 403',
      'Discord permission denied during op. Check bot permissions or OAuth scopes.',
    ],
    [
      'Forbidden',
      'Forbidden',
      'Discord permission denied during op. Check bot permissions or OAuth scopes.',
    ],
    ['404 status', 'HTTP 404', 'Discord resource not found during op. Check IDs and names.'],
    [
      '50001',
      'DiscordAPIError[50001]',
      'Discord missing access during op. The bot/user lacks required permissions.',
    ],
    [
      '50013',
      'DiscordAPIError[50013]',
      'Discord missing permissions during op. The bot needs higher role or additional permissions.',
    ],
    ['generic error', 'Something broke', 'Discord op failed: Something broke'],
  ])('%s -> classified error message', (_label, input, expected) => {
    expect(() => handleDiscordError(new Error(input), 'op')).toThrow(expected);
  });

  it('non-Error value -> Unknown error with String()', () => {
    expect(() => handleDiscordError('weird', 'op')).toThrow('Unknown error during op: weird');
  });
});

describe('buildEmbed', () => {
  it('only includes provided fields', () => {
    expect(buildEmbed({ title: 'T', description: 'D' })).toEqual({
      title: 'T',
      description: 'D',
    });
  });

  it('color 0 (black) IS included — check is !== undefined, not falsy', () => {
    expect(buildEmbed({ color: 0 })).toEqual({ color: 0 });
  });

  it('full embed with all fields', () => {
    const full = {
      title: 'T',
      description: 'D',
      color: 0x5865f2,
      url: 'https://x',
      timestamp: '2026-06-05T00:00:00Z',
      footer: { text: 'f' },
      image: { url: 'https://i' },
      thumbnail: { url: 'https://t' },
      author: { name: 'a' },
      fields: [{ name: 'n', value: 'v', inline: true }],
    };
    expect(buildEmbed(full)).toEqual(full);
  });

  it('empty object -> empty embed', () => {
    expect(buildEmbed({})).toEqual({});
  });
});
