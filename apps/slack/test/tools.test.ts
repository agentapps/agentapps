/**
 * Read tools (one or more per area), error paths and the health check of the Slack Agent
 * App. Writing tools have their happy paths in writes.test.ts.
 *
 * Every test queues the Slack answers it expects (`mockSlack`) and asserts the requests the
 * app sent: the Web API method, which token signed it and the arguments.
 */

import { describe, expect, it } from 'vitest';
import {
  CH,
  CURATED_BOOKMARK,
  CURATED_CALL,
  CURATED_CHANNEL,
  CURATED_FILE,
  CURATED_MESSAGE,
  CURATED_REMOTE_FILE,
  FILE_ID,
  RAW_BOOKMARK,
  RAW_CALL,
  RAW_CHANNEL,
  RAW_FILE,
  RAW_MESSAGE,
  RAW_REMOTE_FILE,
  RAW_USER,
  T0_ISO,
  TEAM,
  TS,
  U,
  U2,
} from './fixtures.js';
import {
  callTool,
  errorOf,
  fetchMock,
  installationSecrets,
  mockSlack,
  pendingReplies,
  runHealthCheck,
  type SlackReply,
  slackError,
  slackRequests,
  systemSecrets,
} from './harness.js';

type Sent = [method: string, token: 'user' | 'bot', body: Record<string, unknown>];

interface ReadCase {
  name: string;
  tool: string;
  args: Record<string, unknown>;
  replies: SlackReply[];
  sends: Sent[];
  result: unknown;
}

const NO_CURSOR = { response_metadata: { next_cursor: '' } };
const PERMALINK = `https://example.slack.com/archives/${CH}/p1700000000000100`;

const COMPACT_CHANNEL = {
  id: CH,
  name: 'general',
  isPrivate: false,
  isArchived: false,
  isMember: true,
  numMembers: 12,
  topic: 'Company news',
  purpose: 'Announcements',
  created: T0_ISO,
};
const COMPACT_MESSAGE = {
  ts: TS,
  channel: CH,
  user: U,
  userName: null,
  text: 'hello',
  subtype: null,
  threadTs: null,
  replyCount: 0,
  reactions: [{ name: 'tada', count: 1, users: [U2] }],
  permalink: null,
  createdAt: T0_ISO,
};
const COMPACT_USER = {
  id: U,
  name: 'ada',
  realName: 'Ada Example',
  displayName: 'ada',
  email: 'ada@example.com',
  imageUrl: 'https://avatars.example.com/ada_192.png',
  isBot: false,
  isAdmin: true,
  isOwner: false,
  deleted: false,
  tz: 'Europe/Madrid',
};
const BOT_USER = {
  ...RAW_USER,
  id: 'U0BOT000001',
  name: 'deploybot',
  is_bot: true,
  is_admin: false,
  profile: {
    real_name: 'Deploy Bot',
    display_name: '',
    image_48: 'https://avatars.example.com/b.png',
  },
};
const DELETED_USER = { ...RAW_USER, id: 'U0GONE00001', name: 'gone', deleted: true };

const READS: ReadCase[] = [
  // --- Channels -------------------------------------------------------------------------
  {
    name: 'list-channels lists public and private channels, 100 per page',
    tool: 'list-channels',
    args: {},
    replies: [
      { ok: true, channels: [RAW_CHANNEL], response_metadata: { next_cursor: 'dGVhbTpD' } },
    ],
    sends: [
      [
        'conversations.list',
        'user',
        { types: 'public_channel,private_channel', limit: 100, exclude_archived: true },
      ],
    ],
    result: { channels: [COMPACT_CHANNEL], total: 1, hasMore: true, nextCursor: 'dGVhbTpD' },
  },
  {
    name: 'list-channels passes types, cursor and archived, and caps limit at 1000',
    tool: 'list-channels',
    args: { types: 'im', limit: 5000, cursor: 'dGVhbTpD', excludeArchived: false, fields: ['id'] },
    replies: [{ ok: true, channels: [RAW_CHANNEL], ...NO_CURSOR }],
    sends: [
      [
        'conversations.list',
        'user',
        { types: 'im', limit: 1000, cursor: 'dGVhbTpD', exclude_archived: false },
      ],
    ],
    result: { channels: [{ id: CH }], total: 1, hasMore: false, nextCursor: null },
  },
  {
    name: 'get-channel returns the curated channel',
    tool: 'get-channel',
    args: { channelId: CH },
    replies: [{ ok: true, channel: RAW_CHANNEL }],
    sends: [['conversations.info', 'user', { channel: CH }]],
    result: CURATED_CHANNEL,
  },

  // --- Messages and search --------------------------------------------------------------
  {
    name: 'list-messages reads the channel history, 50 per page',
    tool: 'list-messages',
    args: { channel: CH },
    replies: [{ ok: true, messages: [RAW_MESSAGE], has_more: true, ...NO_CURSOR }],
    sends: [['conversations.history', 'user', { channel: CH, limit: 50, inclusive: false }]],
    result: {
      messages: [COMPACT_MESSAGE],
      total: 1,
      hasMore: true,
      nextCursor: null,
      isThread: false,
    },
  },
  {
    name: 'list-messages with threadTs reads the replies of the thread',
    tool: 'list-messages',
    args: { channel: CH, threadTs: TS, limit: 999, oldest: '1699999999.000000', inclusive: true },
    replies: [{ ok: true, messages: [], has_more: false, ...NO_CURSOR }],
    sends: [
      [
        'conversations.replies',
        'user',
        { channel: CH, ts: TS, limit: 200, oldest: '1699999999.000000', inclusive: true },
      ],
    ],
    result: { messages: [], total: 0, hasMore: false, nextCursor: null, isThread: true },
  },
  {
    name: 'get-permalink returns the permanent URL of a message',
    tool: 'get-permalink',
    args: { channel: CH, ts: TS },
    replies: [{ ok: true, channel: CH, permalink: PERMALINK }],
    sends: [['chat.getPermalink', 'user', { channel: CH, message_ts: TS }]],
    result: { channel: CH, ts: TS, permalink: PERMALINK },
  },
  {
    name: 'search-messages searches by score, 20 per page',
    tool: 'search-messages',
    args: { query: 'in:#general hello' },
    replies: [
      {
        ok: true,
        query: 'in:#general hello',
        messages: {
          total: 1,
          pagination: { total_count: 1, page: 1, per_page: 20, page_count: 1, first: 1, last: 1 },
          paging: { count: 20, total: 1, page: 1, pages: 1 },
          matches: [
            {
              iid: '7c1b-synthetic',
              team: TEAM,
              score: 0,
              channel: { id: CH, name: 'general', is_private: false },
              type: 'message',
              user: U,
              username: 'ada',
              ts: TS,
              text: 'hello',
              permalink: PERMALINK,
            },
          ],
        },
      },
    ],
    sends: [
      [
        'search.messages',
        'user',
        {
          query: 'in:#general hello',
          sort: 'score',
          sort_dir: 'desc',
          count: 20,
          page: 1,
          highlight: false,
        },
      ],
    ],
    result: {
      matches: [
        {
          ts: TS,
          channel: CH,
          channelName: 'general',
          user: U,
          userName: 'ada',
          text: 'hello',
          permalink: PERMALINK,
          score: 0,
        },
      ],
      total: 1,
      page: 1,
      pagination: { total_count: 1, page: 1, per_page: 20, page_count: 1, first: 1, last: 1 },
    },
  },

  // --- Users and presence ---------------------------------------------------------------
  {
    name: 'list-users drops deleted users and keeps bots by default',
    tool: 'list-users',
    args: {},
    replies: [
      {
        ok: true,
        members: [RAW_USER, BOT_USER, DELETED_USER],
        cache_ts: 1700000000,
        response_metadata: { next_cursor: 'dXNlcjpV' },
      },
    ],
    sends: [['users.list', 'user', { limit: 100, include_locale: false }]],
    result: {
      users: [
        COMPACT_USER,
        {
          ...COMPACT_USER,
          id: 'U0BOT000001',
          name: 'deploybot',
          realName: 'Deploy Bot',
          displayName: '',
          email: null,
          imageUrl: 'https://avatars.example.com/b.png',
          isBot: true,
          isAdmin: false,
        },
      ],
      total: 2,
      hasMore: true,
      nextCursor: 'dXNlcjpV',
    },
  },
  {
    name: 'get-user looks a user up by email',
    tool: 'get-user',
    args: { email: ' ada@example.com ' },
    replies: [{ ok: true, user: RAW_USER }],
    sends: [['users.lookupByEmail', 'user', { email: 'ada@example.com' }]],
    result: {
      ...COMPACT_USER,
      title: 'Engineer',
      phone: '',
      statusText: '',
      statusEmoji: '',
      tzOffset: 3600,
      tzLabel: 'Central European Time',
      isRestricted: false,
      isUltraRestricted: false,
      updated: T0_ISO,
    },
  },
  {
    name: 'get-user-presence returns the presence of a user',
    tool: 'get-user-presence',
    args: { userId: U2 },
    replies: [
      {
        ok: true,
        presence: 'active',
        online: true,
        auto_away: false,
        manual_away: false,
        connection_count: 1,
        last_activity: 1700000000,
      },
    ],
    sends: [['users.getPresence', 'user', { user: U2 }]],
    result: {
      user: U2,
      presence: 'active',
      online: true,
      autoAway: false,
      manualAway: false,
      connectionCount: 1,
      lastActivity: T0_ISO,
    },
  },
  {
    name: 'get-dnd returns the do-not-disturb status of a user',
    tool: 'get-dnd',
    args: { userId: U2 },
    replies: [
      {
        ok: true,
        dnd_enabled: true,
        next_dnd_start_ts: 1700000000,
        next_dnd_end_ts: 1700030000,
        snooze_enabled: false,
      },
    ],
    sends: [['dnd.info', 'user', { user: U2 }]],
    result: {
      snoozeEnabled: false,
      snoozeEndtime: null,
      snoozeRemaining: null,
      nextDndStart: T0_ISO,
      nextDndEnd: '2023-11-15T06:33:20.000Z',
    },
  },

  // --- Files ----------------------------------------------------------------------------
  {
    name: 'list-files lists the files of a channel, 20 per page',
    tool: 'list-files',
    args: { channel: CH },
    replies: [{ ok: true, files: [RAW_FILE], paging: { count: 20, total: 1, page: 1, pages: 1 } }],
    sends: [['files.list', 'user', { channel: CH, count: 20, page: 1, types: 'all' }]],
    result: {
      files: [CURATED_FILE],
      total: 1,
      paging: { count: 20, total: 1, page: 1, pages: 1 },
    },
  },
  {
    name: 'get-upload-url asks for an external upload URL',
    tool: 'get-upload-url',
    args: { filename: 'big.zip', length: 1048576, altTxt: 'An archive' },
    replies: [
      { ok: true, upload_url: 'https://files.slack.com/upload/v1/synthetic', file_id: FILE_ID },
    ],
    sends: [
      [
        'files.getUploadURLExternal',
        'user',
        { filename: 'big.zip', length: 1048576, alt_txt: 'An archive' },
      ],
    ],
    result: {
      uploadUrl: 'https://files.slack.com/upload/v1/synthetic',
      fileId: FILE_ID,
      filename: 'big.zip',
      length: 1048576,
    },
  },
  {
    name: 'get-remote-file reads a remote file with the bot token',
    tool: 'get-remote-file',
    args: { externalId: 'doc-42' },
    replies: [{ ok: true, file: RAW_REMOTE_FILE }],
    sends: [['files.remote.info', 'bot', { external_id: 'doc-42' }]],
    result: CURATED_REMOTE_FILE,
  },

  // --- Reactions, pins, stars, bookmarks ------------------------------------------------
  {
    name: 'get-reactions returns the reactions of a message',
    tool: 'get-reactions',
    args: { channel: CH, timestamp: TS },
    replies: [
      { ok: true, type: 'message', channel: CH, message: { ...RAW_MESSAGE, permalink: PERMALINK } },
    ],
    sends: [['reactions.get', 'user', { channel: CH, timestamp: TS, full: true }]],
    result: {
      reactions: [{ name: 'tada', count: 1, users: [U2] }],
      type: 'message',
      target: { channel: CH, timestamp: TS },
    },
  },
  {
    name: 'list-pins returns pinned messages and files',
    tool: 'list-pins',
    args: { channel: CH },
    replies: [
      {
        ok: true,
        items: [
          {
            type: 'message',
            created: 1700000000,
            created_by: U,
            channel: CH,
            message: RAW_MESSAGE,
          },
          { type: 'file', created: 1700000000, created_by: U2, file: RAW_FILE },
        ],
      },
    ],
    sends: [['pins.list', 'user', { channel: CH }]],
    result: {
      pins: [
        { type: 'message', createdAt: T0_ISO, createdBy: U, message: CURATED_MESSAGE },
        { type: 'file', createdAt: T0_ISO, createdBy: U2, file: CURATED_FILE },
      ],
      count: 2,
    },
  },
  {
    name: 'list-stars returns the saved items',
    tool: 'list-stars',
    args: { count: 5 },
    replies: [
      {
        ok: true,
        items: [
          { type: 'message', channel: CH, message: RAW_MESSAGE, date_create: 1700000000 },
          { type: 'file', file: RAW_FILE, date_create: 1700000000 },
        ],
        paging: { per_page: 5, spill: 0, page: 1, total: 2, pages: 1 },
      },
    ],
    sends: [['stars.list', 'user', { count: 5 }]],
    result: {
      items: [
        { type: 'message', channel: CH, ts: TS, fileId: null },
        { type: 'file', channel: null, ts: null, fileId: FILE_ID },
      ],
      count: 2,
      nextCursor: null,
      hasMore: false,
    },
  },
  {
    name: 'list-bookmarks returns the bookmarks of a channel',
    tool: 'list-bookmarks',
    args: { channel: CH },
    replies: [{ ok: true, bookmarks: [RAW_BOOKMARK] }],
    sends: [['bookmarks.list', 'user', { channel_id: CH }]],
    result: { bookmarks: [CURATED_BOOKMARK], count: 1 },
  },

  // --- Team, emoji, auth ----------------------------------------------------------------
  {
    name: 'get-team-info returns the workspace',
    tool: 'get-team-info',
    args: {},
    replies: [
      {
        ok: true,
        team: {
          id: TEAM,
          name: 'Example Workspace',
          url: 'https://example.slack.com/',
          domain: 'example',
          email_domain: 'example.com',
          icon: {
            image_default: false,
            image_44: 'https://avatars.example.com/team_44.png',
            image_132: 'https://avatars.example.com/team_132.png',
          },
        },
      },
    ],
    sends: [['team.info', 'user', {}]],
    result: {
      id: TEAM,
      name: 'Example Workspace',
      domain: 'example',
      emailDomain: 'example.com',
      iconUrl: 'https://avatars.example.com/team_132.png',
      enterpriseId: null,
      enterpriseName: null,
    },
  },
  {
    name: 'list-emoji returns custom emoji and their aliases',
    tool: 'list-emoji',
    args: {},
    replies: [
      {
        ok: true,
        emoji: {
          party: 'https://emoji.slack-edge.com/T0123456789/party/synthetic.png',
          shipit: 'alias:squirrel',
        },
        cache_ts: '1700000000.000000',
      },
    ],
    sends: [['emoji.list', 'user', {}]],
    result: {
      emojis: [
        {
          name: 'party',
          url: 'https://emoji.slack-edge.com/T0123456789/party/synthetic.png',
          isAlias: false,
          aliasFor: null,
        },
        { name: 'shipit', url: 'alias:squirrel', isAlias: true, aliasFor: 'squirrel' },
      ],
      count: 2,
    },
  },
  {
    name: 'list-auth-teams returns the workspaces of the token',
    tool: 'list-auth-teams',
    args: {},
    replies: [{ ok: true, teams: [{ id: TEAM, name: 'Example Workspace' }], ...NO_CURSOR }],
    sends: [['auth.teams.list', 'user', { include_icon: false, limit: 100 }]],
    result: {
      teams: [
        { id: TEAM, name: 'Example Workspace', domain: null, iconUrl: null, enterpriseId: null },
      ],
      count: 1,
      nextCursor: null,
      hasMore: false,
    },
  },

  // --- Calls, lists, Slack Connect ------------------------------------------------------
  {
    name: 'get-call returns the curated call',
    tool: 'get-call',
    args: { callId: 'R0123456789' },
    replies: [{ ok: true, call: RAW_CALL }],
    sends: [['calls.info', 'user', { id: 'R0123456789' }]],
    result: CURATED_CALL,
  },
  {
    name: 'list-list-items returns the rows of a list, 50 per page',
    tool: 'list-list-items',
    args: { listId: 'F0LIST00001' },
    replies: [
      {
        ok: true,
        items: [
          {
            id: 'Rec0123456789',
            list_id: 'F0LIST00001',
            date_created: 1700000000,
            fields: [{ key: 'name', column_id: 'Col0001', value: 'First', text: 'First' }],
            updated_timestamp: '1700000000',
          },
        ],
        ...NO_CURSOR,
      },
    ],
    sends: [['slackLists.items.list', 'user', { list_id: 'F0LIST00001', limit: 50 }]],
    result: {
      listId: 'F0LIST00001',
      items: [
        {
          id: 'Rec0123456789',
          listId: 'F0LIST00001',
          fields: [{ key: 'name', column_id: 'Col0001', value: 'First', text: 'First' }],
          createdAt: T0_ISO,
          updatedAt: null,
        },
      ],
      count: 1,
      nextCursor: null,
      hasMore: false,
    },
  },
  {
    name: 'list-connect-invites lists the Slack Connect invites with the bot token',
    tool: 'list-connect-invites',
    args: { count: 500, teamId: TEAM },
    replies: [
      {
        ok: true,
        invites: [
          {
            id: 'I0123456789',
            direction: 'incoming',
            status: 'pending',
            date_created: 1700000000,
            invite_type: 'channel',
            channel: { id: CH, is_private: false, is_im: false, name: 'partners' },
          },
        ],
        ...NO_CURSOR,
      },
    ],
    sends: [['conversations.listConnectInvites', 'bot', { count: 100, team_id: TEAM }]],
    result: {
      invites: [
        {
          inviteId: 'I0123456789',
          status: 'pending',
          channel: CH,
          teamId: null,
          invitedTeamId: null,
          invitedUser: null,
          dateCreated: T0_ISO,
          expirationAt: null,
        },
      ],
      count: 1,
      nextCursor: null,
      hasMore: false,
    },
  },
];

describe('Slack: read tools', () => {
  for (const c of READS) {
    it(c.name, async () => {
      mockSlack(...c.replies);
      const res = await callTool(c.tool, c.args);

      expect(errorOf(res)).toBe('');
      expect(slackRequests.map((r) => [r.method, r.token, r.body])).toEqual(c.sends);
      for (const r of slackRequests) expect(r.url).toBe(`https://slack.com/api/${r.method}`);
      expect(pendingReplies()).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res.result).toEqual(c.result);
    });
  }

  it('returns the raw Slack objects with includeRaw', async () => {
    mockSlack({ ok: true, channel: RAW_CHANNEL });
    const res = await callTool('get-channel', { channelId: CH, includeRaw: true });
    expect(res.result).toEqual(RAW_CHANNEL);
  });

  // get-list calls client.slackLists.info and list-list-fields calls
  // client.slackLists.fields.list: @slack/web-api 7.19.0 has neither, so both tools throw
  // a TypeError before any request.
  it.todo('get-list returns the list and its schema');
  it.todo('list-list-fields returns the columns of a list');
  // A page of 1000 channels (the documented maximum of `limit`) is about 200,000 characters
  // of JSON. The tool returns it whole, so the SDK cuts it at 50,000 characters into a
  // string of broken JSON and the caller loses `nextCursor`. The same happens to list-users
  // at limit 200 and to list-messages at limit 200 with long messages.
  it.todo('list-channels at limit 1000 returns valid JSON with nextCursor under 50,000 characters');
});

describe('Slack: arguments rejected before any request', () => {
  const POST_AT_PAST = Math.floor(Date.now() / 1000) - 60;
  const BAD: Array<[tool: string, args: Record<string, unknown>, message: string]> = [
    ['send-message', { channel: CH, text: '   ' }, 'text must be a non-empty string'],
    ['send-message', { channel: CH, text: 'x', blocks: '{"a":1}' }, 'Invalid blocks JSON'],
    ['send-thread-reply', { channel: CH, threadTs: '123', text: 'x' }, 'Invalid threadTs'],
    ['send-ephemeral', { channel: CH, user: 'ada', text: 'x' }, 'Invalid user'],
    ['send-me-message', { channel: 'general', text: 'x' }, 'Invalid channel'],
    ['update-message', { channel: CH, ts: TS }, 'Provide at least one of: text, blocks'],
    ['delete-message', { channel: CH, ts: 'yesterday' }, 'Invalid ts'],
    ['delete-message', { channel: '#general', ts: TS }, 'Invalid channel'],
    [
      'schedule-message',
      { channel: CH, text: 'x', postAt: POST_AT_PAST },
      'postAt must be in the future',
    ],
    [
      'delete-scheduled-message',
      { channel: CH, scheduledMessageId: ' ' },
      'scheduledMessageId must be a non-empty string',
    ],
    ['unfurl-link', { channel: CH, ts: TS, unfurls: '[]' }, 'Invalid unfurls JSON'],
    ['create-channel', { name: 'Has Spaces' }, 'Invalid name "Has Spaces"'],
    ['archive-channel', { channelId: 'general' }, 'Invalid channelId'],
    ['unarchive-channel', { channelId: 'general' }, 'Invalid channelId'],
    ['rename-channel', { channelId: CH, name: 'x'.repeat(81) }, 'name too long'],
    ['set-channel-topic', { channelId: CH, topic: 'x'.repeat(251) }, 'topic too long'],
    ['set-channel-purpose', { channelId: CH, purpose: 'x'.repeat(251) }, 'purpose too long'],
    ['invite-to-channel', { channelId: CH, userIds: [] }, 'userIds must be a non-empty array'],
    ['invite-to-channel', { channelId: CH, userIds: [U, 'bob'] }, 'Invalid userIds[1]'],
    ['kick-from-channel', { channelId: CH, userId: 'bob' }, 'Invalid userId'],
    ['join-channel', { channelId: 'x' }, 'Invalid channelId'],
    ['leave-channel', { channelId: 'x' }, 'Invalid channelId'],
    ['mark-channel-read', { channelId: CH, timestamp: 'now' }, 'Invalid timestamp'],
    ['open-dm', { users: [] }, 'users must be a non-empty array'],
    ['open-dm', { users: Array(9).fill(U) }, 'at most 8 users'],
    ['add-reaction', { channel: CH, timestamp: TS, name: ':tada:' }, 'Invalid emoji name'],
    ['remove-reaction', { channel: CH, timestamp: TS, name: 'Tada' }, 'Invalid emoji name'],
    ['pin-message', { channel: CH, timestamp: 'x' }, 'Invalid timestamp'],
    ['unpin-message', { channel: 'x', timestamp: TS }, 'Invalid channel'],
    ['star-item', {}, 'Provide exactly one of'],
    ['star-item', { channel: CH, timestamp: TS, file: FILE_ID }, 'Provide exactly one of'],
    ['unstar-item', { file: 'report.pdf' }, 'Invalid file'],
    [
      'add-bookmark',
      { channel: CH, title: 'x', link: 'ftp://example.com' },
      'link must be an http',
    ],
    ['edit-bookmark', { channel: CH, bookmarkId: 'Bk1' }, 'Provide at least one field to update'],
    ['remove-bookmark', { channel: CH, bookmarkId: '' }, 'bookmarkId must be a non-empty string'],
    ['delete-file', { fileId: 'report.pdf' }, 'Invalid fileId'],
    ['share-file-public', { fileId: 'x' }, 'Invalid fileId'],
    ['revoke-file-public', { fileId: 'x' }, 'Invalid fileId'],
    ['upload-file', { filePath: 'notes.txt' }, 'filePath must be absolute'],
    ['upload-file', { filePath: '/nonexistent/slack-app-test/notes.txt' }, 'Could not read file'],
    ['complete-upload', { files: '[]' }, 'files must be a non-empty JSON array'],
    ['complete-upload', { files: '[{"title":"x"}]' }, 'files[0] must have an "id" string field'],
    [
      'add-remote-file',
      { externalId: 'd', externalUrl: 'docs.example.com', title: 'x' },
      'externalUrl must be an http',
    ],
    ['update-remote-file', { externalId: 'd' }, 'Provide at least one field to update'],
    ['update-remote-file', { externalId: 'd', fileId: FILE_ID, title: 'x' }, 'not both'],
    ['remove-remote-file', {}, 'Provide externalId or fileId'],
    ['share-remote-file', { externalId: 'd', channels: 'general' }, 'Invalid channels[0]'],
    ['create-canvas', { title: ' ' }, 'title must be a non-empty string'],
    ['create-channel-canvas', { channelId: 'x' }, 'Invalid channelId'],
    [
      'edit-canvas',
      { canvasId: 'F0CANVAS001', changes: '[{"operation":"replace"}]' },
      'changes[0].section_id is required',
    ],
    ['edit-canvas', { canvasId: 'F0CANVAS001', changes: '[]' }, 'at least one operation'],
    ['delete-canvas', { canvasId: '' }, 'canvasId must be a non-empty string'],
    ['add-call', { externalUniqueId: 'm', joinUrl: 'meet.example.com' }, 'joinUrl must be an http'],
    ['update-call', { callId: 'R0123456789' }, 'Provide at least one field to update'],
    ['end-call', { callId: 'R0123456789', duration: -1 }, 'duration must be a non-negative number'],
    [
      'add-call-participants',
      { callId: 'R0123456789', users: '[{"externalId":"ext-1"}]' },
      'displayName is required',
    ],
    ['remove-call-participants', { callId: 'R0123456789', users: '[{}]' }, 'must have slackId'],
    ['set-dnd', { numMinutes: 1441 }, 'numMinutes must be between 1 and 1440'],
    ['update-user-profile', {}, 'Provide at least one field to update'],
    ['update-user-profile', { statusText: 'x'.repeat(101) }, 'statusText too long'],
    ['accept-shared-invite', { channelName: 'partners' }, 'Provide inviteId or channelId'],
    ['approve-shared-invite', { inviteId: ' ' }, 'inviteId must be a non-empty string'],
    ['decline-shared-invite', { inviteId: ' ' }, 'inviteId must be a non-empty string'],
    ['invite-shared', { channel: CH }, 'Provide emails or userIds'],
    ['get-user', {}, 'Provide exactly one of userId or email'],
    ['search-messages', { query: ' ' }, 'query must be a non-empty string'],
    ['get-reactions', { channel: CH }, 'Provide either (channel + timestamp) OR file'],
  ];

  for (const [tool, args, message] of BAD) {
    it(`${tool} rejects ${JSON.stringify(args).slice(0, 60)}`, async () => {
      const res = await callTool(tool, args);
      expect(res.success).toBe(false);
      expect(errorOf(res)).toContain(message);
      expect(slackRequests).toEqual([]);
    });
  }
});

describe('Slack: errors from the API', () => {
  it('classifies an API error and does not retry a write', async () => {
    mockSlack(slackError('channel_not_found'));
    const res = await callTool('send-message', { channel: CH, text: 'hello' });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toBe('[NOT_FOUND] channel_not_found');
    expect(slackRequests).toHaveLength(1);
  });

  it('does not retry a write when Slack answers a transient error', async () => {
    mockSlack(slackError('internal_error'));
    const res = await callTool('delete-message', { channel: CH, ts: TS });
    expect(errorOf(res)).toBe('[DEPENDENCY_UNAVAILABLE] internal_error');
    expect(slackRequests).toHaveLength(1);
  });

  it('retries a read once Slack answers a transient error', async () => {
    mockSlack(slackError('internal_error'), { ok: true, channel: RAW_CHANNEL });
    const res = await callTool('get-channel', { channelId: CH });
    expect(res.success).toBe(true);
    expect(slackRequests.map((r) => r.method)).toEqual([
      'conversations.info',
      'conversations.info',
    ]);
  });

  it('does not retry a read on an error that will not go away', async () => {
    mockSlack(slackError('channel_not_found'));
    const res = await callTool('get-channel', { channelId: CH });
    expect(errorOf(res)).toBe('[NOT_FOUND] channel_not_found');
    expect(slackRequests).toHaveLength(1);
  });

  it('reports a missing scope, an invalid token and an archived channel by code', async () => {
    mockSlack(
      slackError('missing_scope', { needed: 'pins:write', provided: 'chat:write' }),
      slackError('invalid_auth'),
      slackError('is_archived'),
    );
    const scope = await callTool('pin-message', { channel: CH, timestamp: TS });
    expect(errorOf(scope)).toContain('[SCOPE_MISSING] missing_scope');
    const auth = await callTool('add-reaction', { channel: CH, timestamp: TS, name: 'tada' });
    expect(errorOf(auth)).toBe('[AUTH_INVALID] invalid_auth');
    const archived = await callTool('send-me-message', { channel: CH, text: 'x' });
    expect(errorOf(archived)).toBe('[CHANNEL_ARCHIVED] is_archived');
    expect(errorOf(scope) + errorOf(auth)).not.toContain('xoxp-');
  });

  it('reports a network failure as TIMEOUT without the token', async () => {
    mockSlack(new Error('getaddrinfo ENOTFOUND slack.com'));
    const res = await callTool('kick-from-channel', { channelId: CH, userId: U2 });
    expect(errorOf(res)).toBe('[TIMEOUT] getaddrinfo ENOTFOUND slack.com');
    expect(slackRequests).toHaveLength(1);
  });

  it('treats "already done" answers as success where the tool says it is idempotent', async () => {
    mockSlack(
      slackError('already_pinned'),
      slackError('no_pin'),
      slackError('already_starred'),
      slackError('not_starred'),
      slackError('snooze_not_active'),
    );
    expect((await callTool('pin-message', { channel: CH, timestamp: TS })).result).toEqual({
      channel: CH,
      timestamp: TS,
      pinned: true,
    });
    expect((await callTool('unpin-message', { channel: CH, timestamp: TS })).success).toBe(true);
    expect((await callTool('star-item', { file: FILE_ID })).success).toBe(true);
    expect((await callTool('unstar-item', { file: FILE_ID })).success).toBe(true);
    expect((await callTool('end-dnd', {})).result).toEqual({ snoozeEnabled: false });
    expect(pendingReplies()).toBe(0);
  });

  it('share-file-public explains not_allowed as a workspace setting', async () => {
    mockSlack(slackError('not_allowed'));
    const res = await callTool('share-file-public', { fileId: FILE_ID });
    expect(errorOf(res)).toBe('[FEATURE_GATED] not_allowed');
  });

  it('archive-channel still succeeds when the follow-up info call fails', async () => {
    mockSlack({ ok: true }, slackError('channel_not_found'));
    const res = await callTool('archive-channel', { channelId: CH });
    expect(res.result).toEqual({ id: CH, name: '', isArchived: true });
    expect(slackRequests.map((r) => r.method)).toEqual([
      'conversations.archive',
      'conversations.info',
    ]);
  });

  it('create-channel keeps the channel when setting the topic fails', async () => {
    mockSlack({ ok: true, channel: RAW_CHANNEL }, slackError('not_in_channel'));
    const res = await callTool('create-channel', { name: 'general', topic: 'Launch' });
    expect(res.result).toEqual(CURATED_CHANNEL);
  });

  it('create-canvas reports FEATURE_GATED when Slack answers without a canvas id', async () => {
    mockSlack({ ok: true });
    const res = await callTool('create-canvas', { title: 'Plan' });
    expect(errorOf(res)).toBe('[FEATURE_GATED] canvas_disabled_or_empty_response');
  });
});

describe('Slack: secrets', () => {
  it('uses the user token for bot-token tools when no bot token was installed', async () => {
    delete installationSecrets.BOT_ACCESS_TOKEN;
    mockSlack({ ok: true, channel: RAW_CHANNEL });
    const res = await callTool('join-channel', { channelId: CH });
    expect(res.success).toBe(true);
    expect(slackRequests.map((r) => [r.method, r.token])).toEqual([['conversations.join', 'user']]);
  });

  it('fails without an access token before any request', async () => {
    delete installationSecrets.ACCESS_TOKEN;
    const res = await callTool('send-message', { channel: CH, text: 'hello' });
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('Slack workspace not connected');
    expect(slackRequests).toEqual([]);
  });

  it('fails without the OAuth client before any request', async () => {
    delete systemSecrets.CLIENT_ID;
    const res = await callTool('list-channels', {});
    expect(res.success).toBe(false);
    expect(errorOf(res)).toContain('Slack OAuth credentials not configured');
    expect(slackRequests).toEqual([]);
  });
});

describe('Slack: health check', () => {
  it('is ready when auth.test accepts the user token', async () => {
    mockSlack({
      ok: true,
      url: 'https://example.slack.com/',
      team: 'Example Workspace',
      user: 'ada',
      team_id: TEAM,
      user_id: U,
    });
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(health.message).toBe('Slack connected');
    expect(slackRequests.map((r) => [r.method, r.token, r.body])).toEqual([
      ['auth.test', 'user', {}],
    ]);
  });

  it('is not_ready with SYSTEM_NOT_CONFIGURED without the OAuth client', async () => {
    delete systemSecrets.CLIENT_SECRET;
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('SYSTEM_NOT_CONFIGURED');
    expect(slackRequests).toEqual([]);
  });

  it('is not_ready with USER_NOT_AUTHENTICATED without an access token', async () => {
    delete installationSecrets.ACCESS_TOKEN;
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Slack workspace not connected');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('USER_NOT_AUTHENTICATED');
    expect(slackRequests).toEqual([]);
  });

  it('is not_ready with AUTH_INVALID when Slack rejects the token', async () => {
    mockSlack(slackError('invalid_auth'));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Slack: invalid_auth');
    expect(health.issues).toEqual([
      { code: 'AUTH_INVALID', message: 'invalid_auth', severity: 'error' },
    ]);
  });

  it('is not_ready when Slack is unreachable', async () => {
    mockSlack(new Error('getaddrinfo ENOTFOUND slack.com'));
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect((health.issues as Array<{ code: string }>)[0].code).toBe('TIMEOUT');
  });
});
