/**
 * One happy path for every Slack tool that writes (all of them are `sensitive`; the
 * irreversible ones are also `destructiveHint`). Each case asserts the requests the app
 * sent to Slack (Web API method, which token, arguments) and what the tool returned.
 *
 * Slack's Web API is POST only, so "URL, method, body" is the API method name in the URL
 * (`https://slack.com/api/<method>`) plus the arguments. See harness.ts for the mock.
 *
 * A tool that cannot have a happy path today is listed in BROKEN with the reason, shows as
 * a `todo`, and is reported as a bug. The last test fails when a writing tool is in neither
 * list.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CH,
  CH2,
  CURATED_BOOKMARK,
  CURATED_CALL,
  CURATED_CHANNEL,
  CURATED_FILE,
  CURATED_MESSAGE,
  CURATED_REMOTE_FILE,
  DM,
  FILE_ID,
  RAW_BOOKMARK,
  RAW_CALL,
  RAW_CHANNEL,
  RAW_FILE,
  RAW_MESSAGE,
  RAW_REMOTE_FILE,
  T0_ISO,
  TS,
  TS2,
  U,
  U2,
} from './fixtures.js';
import {
  callTool,
  errorOf,
  fetchMock,
  listTools,
  mockSlack,
  pendingReplies,
  type SlackReply,
  slackRequests,
} from './harness.js';

type Sent = [method: string, token: 'user' | 'bot', body: Record<string, unknown>];

interface Case {
  tool: string;
  args: Record<string, unknown>;
  /** What Slack answers, in order. */
  replies: SlackReply[];
  /** The requests the tool must send, in order. */
  sends: Sent[];
  /** What the tool returns. */
  result: unknown;
}

const OK = { ok: true };
const POST_AT = Math.floor(Date.now() / 1000) + 3600;

const tmp = mkdtempSync(join(tmpdir(), 'slack-app-test-'));
const UPLOAD_PATH = join(tmp, 'notes.txt');
writeFileSync(UPLOAD_PATH, 'hello slack');
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const CASES: Case[] = [
  // --- Messages -------------------------------------------------------------------------
  {
    tool: 'send-message',
    args: { channel: CH, text: 'hello', blocks: '[{"type":"divider"}]', unfurlLinks: false },
    replies: [{ ok: true, channel: CH, ts: TS, message: RAW_MESSAGE }],
    sends: [
      [
        'chat.postMessage',
        'user',
        {
          channel: CH,
          text: 'hello',
          blocks: [{ type: 'divider' }],
          unfurl_links: false,
          unfurl_media: true,
        },
      ],
    ],
    // `permalink` is always null: see the todo below.
    result: { ts: TS, channel: CH, message: CURATED_MESSAGE, permalink: null },
  },
  {
    tool: 'send-thread-reply',
    args: { channel: CH, threadTs: TS, text: 'reply', broadcast: true },
    replies: [
      { ok: true, channel: CH, ts: TS2, message: { ...RAW_MESSAGE, ts: TS2, thread_ts: TS } },
    ],
    sends: [
      [
        'chat.postMessage',
        'user',
        { channel: CH, thread_ts: TS, text: 'reply', reply_broadcast: true },
      ],
    ],
    result: {
      ts: TS2,
      channel: CH,
      threadTs: TS,
      broadcast: true,
      message: { ...CURATED_MESSAGE, ts: TS2, threadTs: TS, createdAt: '2023-11-14T22:14:10.000Z' },
    },
  },
  {
    tool: 'send-ephemeral',
    args: { channel: CH, user: U2, text: 'only you', threadTs: TS },
    replies: [{ ok: true, message_ts: TS2 }],
    sends: [
      ['chat.postEphemeral', 'user', { channel: CH, user: U2, text: 'only you', thread_ts: TS }],
    ],
    result: { channel: CH, user: U2, messageTs: TS2 },
  },
  {
    tool: 'send-me-message',
    args: { channel: CH, text: 'is testing' },
    replies: [{ ok: true, channel: CH, ts: TS }],
    sends: [['chat.meMessage', 'user', { channel: CH, text: 'is testing' }]],
    result: { ts: TS, channel: CH },
  },
  {
    tool: 'update-message',
    args: { channel: CH, ts: TS, text: 'edited', attachments: '[]' },
    replies: [
      {
        ok: true,
        channel: CH,
        ts: TS,
        text: 'edited',
        message: { ...RAW_MESSAGE, text: 'edited' },
      },
    ],
    sends: [['chat.update', 'user', { channel: CH, ts: TS, text: 'edited', attachments: [] }]],
    result: {
      ts: TS,
      channel: CH,
      text: 'edited',
      message: { ...CURATED_MESSAGE, text: 'edited', attachments: undefined },
    },
  },
  {
    tool: 'delete-message',
    args: { channel: CH, ts: TS },
    replies: [{ ok: true, channel: CH, ts: TS }],
    sends: [['chat.delete', 'user', { channel: CH, ts: TS, as_user: true }]],
    result: { channel: CH, ts: TS, deleted: true },
  },
  {
    tool: 'schedule-message',
    args: { channel: CH, text: 'later', postAt: POST_AT, threadTs: TS },
    replies: [
      { ok: true, channel: CH, scheduled_message_id: 'Q0123456789', post_at: POST_AT, message: {} },
    ],
    sends: [
      [
        'chat.scheduleMessage',
        'user',
        {
          channel: CH,
          text: 'later',
          post_at: POST_AT,
          thread_ts: TS,
          unfurl_links: true,
          unfurl_media: true,
        },
      ],
    ],
    result: {
      channel: CH,
      scheduledMessageId: 'Q0123456789',
      postAt: POST_AT,
      postAtIso: new Date(POST_AT * 1000).toISOString(),
    },
  },
  {
    tool: 'delete-scheduled-message',
    args: { channel: CH, scheduledMessageId: 'Q0123456789', asUser: false },
    replies: [OK],
    sends: [
      [
        'chat.deleteScheduledMessage',
        'user',
        { channel: CH, scheduled_message_id: 'Q0123456789', as_user: false },
      ],
    ],
    result: { channel: CH, scheduledMessageId: 'Q0123456789', deleted: true },
  },
  {
    tool: 'unfurl-link',
    args: {
      channel: CH,
      ts: TS,
      unfurls: '{"https://example.com/a":{"text":"Preview"}}',
      userAuthRequired: false,
    },
    replies: [OK],
    sends: [
      [
        'chat.unfurl',
        'user',
        {
          channel: CH,
          ts: TS,
          unfurls: { 'https://example.com/a': { text: 'Preview' } },
          user_auth_required: false,
        },
      ],
    ],
    result: { channel: CH, ts: TS, unfurled: true, links: ['https://example.com/a'] },
  },

  // --- Channels -------------------------------------------------------------------------
  {
    tool: 'create-channel',
    args: { name: 'proj-x', isPrivate: true, topic: ' Launch ' },
    replies: [
      {
        ok: true,
        channel: { ...RAW_CHANNEL, id: CH2, name: 'proj-x', is_private: true, is_general: false },
      },
      OK,
    ],
    sends: [
      ['conversations.create', 'bot', { name: 'proj-x', is_private: true }],
      ['conversations.setTopic', 'bot', { channel: CH2, topic: 'Launch' }],
    ],
    result: {
      ...CURATED_CHANNEL,
      id: CH2,
      name: 'proj-x',
      isPrivate: true,
      isGeneral: false,
      topic: 'Launch',
    },
  },
  {
    tool: 'archive-channel',
    args: { channelId: CH },
    replies: [OK, { ok: true, channel: { ...RAW_CHANNEL, is_archived: true } }],
    sends: [
      ['conversations.archive', 'bot', { channel: CH }],
      ['conversations.info', 'bot', { channel: CH }],
    ],
    result: { ...CURATED_CHANNEL, isArchived: true },
  },
  {
    tool: 'unarchive-channel',
    args: { channelId: CH },
    replies: [OK, { ok: true, channel: RAW_CHANNEL }],
    sends: [
      ['conversations.unarchive', 'bot', { channel: CH }],
      ['conversations.info', 'bot', { channel: CH }],
    ],
    result: CURATED_CHANNEL,
  },
  {
    tool: 'rename-channel',
    args: { channelId: CH, name: 'general-2' },
    replies: [{ ok: true, channel: { ...RAW_CHANNEL, name: 'general-2' } }],
    sends: [['conversations.rename', 'bot', { channel: CH, name: 'general-2' }]],
    result: { ...CURATED_CHANNEL, name: 'general-2' },
  },
  {
    tool: 'set-channel-topic',
    args: { channelId: CH, topic: 'New topic' },
    replies: [{ ok: true, channel: RAW_CHANNEL }],
    sends: [['conversations.setTopic', 'user', { channel: CH, topic: 'New topic' }]],
    result: { channelId: CH, topic: 'New topic' },
  },
  {
    tool: 'set-channel-purpose',
    args: { channelId: CH, purpose: 'New purpose' },
    replies: [{ ok: true, channel: RAW_CHANNEL }],
    sends: [['conversations.setPurpose', 'user', { channel: CH, purpose: 'New purpose' }]],
    result: { channelId: CH, purpose: 'New purpose' },
  },
  {
    tool: 'invite-to-channel',
    args: { channelId: CH, userIds: [U, U2] },
    replies: [{ ok: true, channel: RAW_CHANNEL }],
    sends: [['conversations.invite', 'user', { channel: CH, users: `${U},${U2}` }]],
    result: { channel: CURATED_CHANNEL, invitedUserIds: [U, U2] },
  },
  {
    tool: 'kick-from-channel',
    args: { channelId: CH, userId: U2 },
    replies: [OK],
    sends: [['conversations.kick', 'user', { channel: CH, user: U2 }]],
    result: { channelId: CH, userId: U2, kicked: true },
  },
  {
    tool: 'join-channel',
    args: { channelId: CH },
    replies: [{ ok: true, channel: RAW_CHANNEL }],
    sends: [['conversations.join', 'bot', { channel: CH }]],
    result: CURATED_CHANNEL,
  },
  {
    tool: 'leave-channel',
    args: { channelId: CH },
    replies: [{ ok: true, not_in_channel: true }],
    sends: [['conversations.leave', 'user', { channel: CH }]],
    result: { channelId: CH, notInChannel: true },
  },
  {
    tool: 'mark-channel-read',
    args: { channelId: CH, timestamp: TS },
    replies: [OK],
    sends: [['conversations.mark', 'user', { channel: CH, ts: TS }]],
    result: { channelId: CH, timestamp: TS, marked: true },
  },
  {
    tool: 'open-dm',
    args: { users: [U2] },
    replies: [
      {
        ok: true,
        no_op: true,
        already_open: true,
        channel: { id: DM, created: 1700000000, is_im: true, is_org_shared: false, user: U2 },
      },
    ],
    sends: [['conversations.open', 'user', { users: U2, return_im: true }]],
    result: {
      channel: {
        id: DM,
        name: '',
        isPrivate: false,
        isArchived: false,
        isMember: false,
        numMembers: null,
        topic: '',
        purpose: '',
        created: T0_ISO,
        creator: null,
        isOrgShared: false,
      },
      alreadyOpen: true,
      noOp: true,
    },
  },

  // --- Reactions, pins, stars, bookmarks ------------------------------------------------
  {
    tool: 'add-reaction',
    args: { channel: CH, timestamp: TS, name: 'thumbsup' },
    replies: [OK],
    sends: [['reactions.add', 'user', { channel: CH, timestamp: TS, name: 'thumbsup' }]],
    result: { channel: CH, timestamp: TS, name: 'thumbsup' },
  },
  {
    tool: 'remove-reaction',
    args: { channel: CH, timestamp: TS, name: '+1' },
    replies: [OK],
    sends: [['reactions.remove', 'user', { channel: CH, timestamp: TS, name: '+1' }]],
    result: { channel: CH, timestamp: TS, name: '+1' },
  },
  {
    tool: 'pin-message',
    args: { channel: CH, timestamp: TS },
    replies: [OK],
    sends: [['pins.add', 'user', { channel: CH, timestamp: TS }]],
    result: { channel: CH, timestamp: TS, pinned: true },
  },
  {
    tool: 'unpin-message',
    args: { channel: CH, timestamp: TS },
    replies: [OK],
    sends: [['pins.remove', 'user', { channel: CH, timestamp: TS }]],
    result: { channel: CH, timestamp: TS, unpinned: true },
  },
  {
    tool: 'star-item',
    args: { channel: CH, timestamp: TS },
    replies: [OK],
    sends: [['stars.add', 'user', { channel: CH, timestamp: TS }]],
    result: {
      type: 'message',
      target: { channel: CH, timestamp: TS, file: null, fileComment: null },
      starred: true,
    },
  },
  {
    tool: 'unstar-item',
    args: { file: FILE_ID },
    replies: [OK],
    sends: [['stars.remove', 'user', { file: FILE_ID }]],
    result: {
      type: 'file',
      target: { channel: null, timestamp: null, file: FILE_ID, fileComment: null },
      unstarred: true,
    },
  },
  {
    tool: 'add-bookmark',
    args: {
      channel: CH,
      title: 'Runbook',
      link: 'https://example.com/runbook',
      emoji: ':notebook:',
    },
    replies: [{ ok: true, bookmark: RAW_BOOKMARK }],
    sends: [
      [
        'bookmarks.add',
        'user',
        {
          channel_id: CH,
          title: 'Runbook',
          link: 'https://example.com/runbook',
          type: 'link',
          emoji: ':notebook:',
        },
      ],
    ],
    result: CURATED_BOOKMARK,
  },
  {
    tool: 'edit-bookmark',
    args: { channel: CH, bookmarkId: 'Bk0123456789', title: 'Runbook v2' },
    replies: [{ ok: true, bookmark: { ...RAW_BOOKMARK, title: 'Runbook v2' } }],
    sends: [
      [
        'bookmarks.edit',
        'user',
        { channel_id: CH, bookmark_id: 'Bk0123456789', title: 'Runbook v2' },
      ],
    ],
    result: { ...CURATED_BOOKMARK, title: 'Runbook v2' },
  },
  {
    tool: 'remove-bookmark',
    args: { channel: CH, bookmarkId: 'Bk0123456789' },
    replies: [OK],
    sends: [['bookmarks.remove', 'user', { channel_id: CH, bookmark_id: 'Bk0123456789' }]],
    result: { channel: CH, bookmarkId: 'Bk0123456789', removed: true },
  },

  // --- Files ----------------------------------------------------------------------------
  {
    tool: 'delete-file',
    args: { fileId: FILE_ID },
    replies: [OK],
    sends: [['files.delete', 'user', { file: FILE_ID }]],
    result: { fileId: FILE_ID, deleted: true },
  },
  {
    tool: 'share-file-public',
    args: { fileId: FILE_ID },
    replies: [
      {
        ok: true,
        file: {
          ...RAW_FILE,
          permalink_public: 'https://slack-files.com/T0123456789-F0123456789-abc',
        },
      },
    ],
    sends: [['files.sharedPublicURL', 'user', { file: FILE_ID }]],
    result: {
      fileId: FILE_ID,
      permalinkPublic: 'https://slack-files.com/T0123456789-F0123456789-abc',
    },
  },
  {
    tool: 'revoke-file-public',
    args: { fileId: FILE_ID },
    replies: [{ ok: true, file: RAW_FILE }],
    sends: [['files.revokePublicURL', 'user', { file: FILE_ID }]],
    result: { fileId: FILE_ID, revoked: true },
  },
  {
    tool: 'complete-upload',
    args: {
      files: `[{"id":"${FILE_ID}","title":"Report"}]`,
      channelId: CH,
      initialComment: 'Here it is',
      threadTs: TS,
    },
    replies: [{ ok: true, files: [RAW_FILE] }],
    sends: [
      [
        'files.completeUploadExternal',
        'user',
        {
          files: [{ id: FILE_ID, title: 'Report' }],
          channel_id: CH,
          initial_comment: 'Here it is',
          thread_ts: TS,
        },
      ],
    ],
    result: { files: [CURATED_FILE], count: 1 },
  },
  {
    tool: 'add-remote-file',
    args: {
      externalId: 'doc-42',
      externalUrl: 'https://docs.example.com/d/42',
      title: 'Design doc',
      fileType: 'gdoc',
    },
    replies: [{ ok: true, file: RAW_REMOTE_FILE }],
    sends: [
      [
        'files.remote.add',
        'bot',
        {
          external_id: 'doc-42',
          external_url: 'https://docs.example.com/d/42',
          title: 'Design doc',
          filetype: 'gdoc',
        },
      ],
    ],
    result: CURATED_REMOTE_FILE,
  },
  {
    tool: 'update-remote-file',
    args: { externalId: 'doc-42', title: 'Design doc v2' },
    replies: [{ ok: true, file: { ...RAW_REMOTE_FILE, title: 'Design doc v2' } }],
    sends: [['files.remote.update', 'bot', { external_id: 'doc-42', title: 'Design doc v2' }]],
    result: { ...CURATED_REMOTE_FILE, title: 'Design doc v2' },
  },
  {
    tool: 'remove-remote-file',
    args: { fileId: FILE_ID },
    replies: [OK],
    sends: [['files.remote.remove', 'bot', { file: FILE_ID }]],
    result: { externalId: null, fileId: FILE_ID, removed: true },
  },
  {
    tool: 'share-remote-file',
    args: { externalId: 'doc-42', channels: `${CH}, ${CH2}` },
    replies: [{ ok: true, file: { ...RAW_REMOTE_FILE, channels: [CH, CH2] } }],
    sends: [['files.remote.share', 'bot', { external_id: 'doc-42', channels: `${CH},${CH2}` }]],
    result: { ...CURATED_REMOTE_FILE, channels: [CH, CH2] },
  },

  // --- Canvases -------------------------------------------------------------------------
  {
    tool: 'create-canvas',
    args: { title: 'Plan', contentMarkdown: '# Plan' },
    replies: [{ ok: true, canvas_id: 'F0CANVAS001' }],
    sends: [
      [
        'canvases.create',
        'user',
        { title: 'Plan', document_content: { type: 'markdown', markdown: '# Plan' } },
      ],
    ],
    result: {
      id: 'F0CANVAS001',
      title: '',
      channelId: null,
      isStandalone: true,
      createdAt: null,
      updatedAt: null,
      ownerUserId: null,
    },
  },
  {
    tool: 'create-channel-canvas',
    args: { channelId: CH, title: 'Channel notes' },
    replies: [{ ok: true, canvas_id: 'F0CANVAS002' }],
    sends: [['conversations.canvases.create', 'user', { channel_id: CH, title: 'Channel notes' }]],
    result: {
      id: 'F0CANVAS002',
      title: '',
      channelId: CH,
      isStandalone: true,
      createdAt: null,
      updatedAt: null,
      ownerUserId: null,
    },
  },
  {
    tool: 'edit-canvas',
    args: {
      canvasId: 'F0CANVAS001',
      changes:
        '[{"operation":"insert_at_end","documentContent":{"type":"markdown","markdown":"More"}},{"operation":"delete","sectionId":"temp:C:abc"}]',
    },
    replies: [OK],
    sends: [
      [
        'canvases.edit',
        'user',
        {
          canvas_id: 'F0CANVAS001',
          changes: [
            {
              operation: 'insert_at_end',
              document_content: { type: 'markdown', markdown: 'More' },
            },
            { operation: 'delete', section_id: 'temp:C:abc' },
          ],
        },
      ],
    ],
    result: {
      id: 'F0CANVAS001',
      title: '',
      channelId: null,
      isStandalone: true,
      createdAt: null,
      updatedAt: null,
      ownerUserId: null,
    },
  },
  {
    tool: 'delete-canvas',
    args: { canvasId: 'F0CANVAS001' },
    replies: [OK],
    sends: [['canvases.delete', 'user', { canvas_id: 'F0CANVAS001' }]],
    result: { canvasId: 'F0CANVAS001', deleted: true },
  },

  // --- Lists: every writing tool is in BROKEN below ---------------------------------------

  // --- Calls ----------------------------------------------------------------------------
  {
    tool: 'add-call',
    args: {
      externalUniqueId: 'meet-42',
      joinUrl: 'https://meet.example.com/42',
      title: 'Standup',
      users: `[{"slackId":"${U}"},{"externalId":"ext-1","displayName":"Guest"}]`,
      dateStart: 1700000000,
    },
    replies: [{ ok: true, call: RAW_CALL }],
    sends: [
      [
        'calls.add',
        'user',
        {
          external_unique_id: 'meet-42',
          join_url: 'https://meet.example.com/42',
          title: 'Standup',
          users: [{ slack_id: U }, { external_id: 'ext-1', display_name: 'Guest' }],
          date_start: 1700000000,
        },
      ],
    ],
    result: CURATED_CALL,
  },
  {
    tool: 'update-call',
    args: { callId: 'R0123456789', title: 'Standup (moved)' },
    replies: [{ ok: true, call: { ...RAW_CALL, title: 'Standup (moved)' } }],
    sends: [['calls.update', 'user', { id: 'R0123456789', title: 'Standup (moved)' }]],
    result: { ...CURATED_CALL, title: 'Standup (moved)' },
  },
  {
    tool: 'end-call',
    args: { callId: 'R0123456789', duration: 900 },
    replies: [OK],
    sends: [['calls.end', 'user', { id: 'R0123456789', duration: 900 }]],
    result: { callId: 'R0123456789', ended: true, duration: 900 },
  },
  {
    tool: 'add-call-participants',
    args: { callId: 'R0123456789', users: `[{"slack_id":"${U2}"}]` },
    replies: [OK],
    sends: [['calls.participants.add', 'user', { id: 'R0123456789', users: [{ slack_id: U2 }] }]],
    result: { callId: 'R0123456789', added: 1, participants: [{ slack_id: U2 }] },
  },
  {
    tool: 'remove-call-participants',
    args: { callId: 'R0123456789', users: `[{"slackId":"${U2}"}]` },
    replies: [OK],
    sends: [
      ['calls.participants.remove', 'user', { id: 'R0123456789', users: [{ slack_id: U2 }] }],
    ],
    result: { callId: 'R0123456789', removed: 1, participants: [{ slack_id: U2 }] },
  },

  // --- Do not disturb, profile ----------------------------------------------------------
  {
    tool: 'set-dnd',
    args: { numMinutes: 30 },
    replies: [
      { ok: true, snooze_enabled: true, snooze_endtime: 1700001800, snooze_remaining: 1800 },
    ],
    sends: [['dnd.setSnooze', 'user', { num_minutes: 30 }]],
    result: {
      snoozeEnabled: true,
      snoozeEndtime: '2023-11-14T22:43:20.000Z',
      snoozeRemaining: 1800,
    },
  },
  {
    tool: 'end-dnd',
    args: {},
    replies: [{ ok: true, dnd_enabled: false, snooze_enabled: false }],
    sends: [['dnd.endSnooze', 'user', {}]],
    result: { snoozeEnabled: false },
  },
  {
    tool: 'update-user-profile',
    args: {
      statusText: 'In a meeting',
      statusEmoji: ':calendar:',
      statusExpiration: 1700003600,
      customFields: '{"Xf0001":{"value":"Madrid"}}',
    },
    replies: [{ ok: true, profile: { status_text: 'In a meeting', status_emoji: ':calendar:' } }],
    sends: [
      [
        'users.profile.set',
        'user',
        {
          profile: JSON.stringify({
            status_text: 'In a meeting',
            status_emoji: ':calendar:',
            status_expiration: 1700003600,
            fields: { Xf0001: { value: 'Madrid' } },
          }),
        },
      ],
    ],
    result: {
      userId: null,
      updated: ['status_text', 'status_emoji', 'status_expiration', 'fields'],
      profile: { status_text: 'In a meeting', status_emoji: ':calendar:' },
    },
  },
  {
    tool: 'delete-user-photo',
    args: {},
    replies: [OK],
    sends: [['users.deletePhoto', 'user', {}]],
    result: { deleted: true },
  },

  // --- Slack Connect --------------------------------------------------------------------
  {
    tool: 'accept-shared-invite',
    args: { channelName: 'partners', inviteId: 'I0123456789' },
    replies: [{ ok: true, implicit_approval: true, channel_id: CH2, invite_id: 'I0123456789' }],
    sends: [
      [
        'conversations.acceptSharedInvite',
        'bot',
        {
          channel_name: 'partners',
          invite_id: 'I0123456789',
          is_private: false,
          free_trial_accepted: false,
        },
      ],
    ],
    result: { channelId: CH2, inviteId: 'I0123456789', accepted: true },
  },
  {
    tool: 'approve-shared-invite',
    args: { inviteId: 'I0123456789', targetTeam: 'T0987654321' },
    replies: [OK],
    sends: [
      [
        'conversations.approveSharedInvite',
        'bot',
        { invite_id: 'I0123456789', target_team: 'T0987654321' },
      ],
    ],
    result: { inviteId: 'I0123456789', approved: true },
  },
  {
    tool: 'decline-shared-invite',
    args: { inviteId: 'I0123456789' },
    replies: [OK],
    sends: [['conversations.declineSharedInvite', 'bot', { invite_id: 'I0123456789' }]],
    result: { inviteId: 'I0123456789', declined: true },
  },
  {
    tool: 'invite-shared',
    args: { channel: CH, emails: 'ada@example.com, grace@example.com' },
    replies: [{ ok: true, invite_id: 'I0123456789', is_legacy_shared_channel: false }],
    sends: [
      [
        'conversations.inviteShared',
        'bot',
        {
          channel: CH,
          emails: ['ada@example.com', 'grace@example.com'],
          external_limited: false,
        },
      ],
    ],
    result: { channel: CH, inviteId: 'I0123456789', link: null, isLegacySharedChannel: false },
  },

  // --- Auth -----------------------------------------------------------------------------
  {
    tool: 'revoke-auth',
    args: {},
    replies: [{ ok: true, revoked: true }],
    sends: [['auth.revoke', 'user', { test: false }]],
    result: { revoked: true, test: false },
  },
];

/**
 * Writing tools with no happy path today. Reported as bugs; the app is not changed here.
 * "No such method" means `@slack/web-api` 7.19.0 has no such binding, so the handler
 * throws a TypeError before any request.
 */
const BROKEN: Record<string, string> = {
  'add-emoji': 'calls client.emoji.add: no such method in the SDK (only admin.emoji.add)',
  'remove-emoji': 'calls client.emoji.remove: no such method in the SDK (only admin.emoji.remove)',
  'create-list':
    'reads result.list; slackLists.create answers { list_id, list_metadata }, so the tool reports FEATURE_GATED after Slack created the list',
  'delete-list': 'calls client.slackLists.delete: no such method in the SDK',
  'create-list-field': 'calls client.slackLists.fields.create: the SDK has no slackLists.fields',
  'update-list-field': 'calls client.slackLists.fields.update: the SDK has no slackLists.fields',
  'delete-list-field': 'calls client.slackLists.fields.delete: the SDK has no slackLists.fields',
  'update-list':
    'sends list_id (plus description and schema); slackLists.update takes id, name, description_blocks, todo_mode',
  'create-list-item': 'sends fields as an object; slackLists.items.create takes initial_fields[]',
  'update-list-item': 'sends item_id and fields; slackLists.items.update takes list_id and cells[]',
  'delete-list-item': 'sends item_id; slackLists.items.delete takes list_id and id',
  'start-stream':
    'reads stream_id from the answer; chat.startStream answers { channel, ts } and has no stream id',
  'append-stream':
    'sends { stream_id, content }; chat.appendStream takes { channel, ts, markdown_text }',
  'stop-stream': 'sends { stream_id }; chat.stopStream takes { channel, ts }',
};

describe('Slack: every writing tool, happy path', () => {
  for (const c of CASES) {
    it(`${c.tool} sends ${c.sends.map((s) => s[0]).join(' + ')}`, async () => {
      mockSlack(...c.replies);
      const res = await callTool(c.tool, c.args);

      expect(errorOf(res)).toBe('');
      expect(res.success).toBe(true);
      expect(slackRequests.map((r) => [r.method, r.token, r.body])).toEqual(c.sends);
      for (const r of slackRequests) expect(r.url).toBe(`https://slack.com/api/${r.method}`);
      expect(pendingReplies()).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(res.result).toEqual(c.result);
    });
  }

  it('upload-file asks for an upload URL, posts the bytes there and completes the upload', async () => {
    mockSlack(
      { ok: true, upload_url: 'https://files.slack.com/upload/v1/synthetic', file_id: FILE_ID },
      { ok: true }, // the answer of the upload URL
      { ok: true, files: [{ id: FILE_ID, title: 'Notes' }] },
    );
    const res = await callTool('upload-file', {
      filePath: UPLOAD_PATH,
      channels: [CH],
      title: 'Notes',
      initialComment: 'FYI',
      threadTs: TS,
    });

    expect(errorOf(res)).toBe('');
    expect(slackRequests.map((r) => [r.method, r.token])).toEqual([
      ['files.getUploadURLExternal', 'user'],
      ['https://files.slack.com/upload/v1/synthetic', 'user'],
      ['files.completeUploadExternal', 'user'],
    ]);
    expect(slackRequests[0].body).toEqual({ filename: 'notes.txt', length: 11 });
    expect(Buffer.from(slackRequests[1].body.body as Uint8Array).toString()).toBe('hello slack');
    expect(slackRequests[2].body).toEqual({
      files: [{ id: FILE_ID, title: 'Notes' }],
      channel_id: CH,
      initial_comment: 'FYI',
      thread_ts: TS,
    });
    expect(res.result).toMatchObject({ id: FILE_ID, title: 'Notes', size: 0, channels: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  for (const [tool, reason] of Object.entries(BROKEN)) {
    it.todo(`${tool}: ${reason}`);
  }

  // send-message: `domain` is always '' (src/tools/send-message.ts), so buildPermalink
  // always returns null although the description promises a permalink.
  it.todo('send-message returns the permalink of the message it posted');
  // upload-file joins several channels into `channel_id`, which takes one channel id.
  it.todo('upload-file shares a file with more than one channel');

  it('covers every tool that is sensitive or destructive', async () => {
    const writing = (await listTools())
      .filter((t) => t.annotations?.sensitive === true || t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();
    const covered = [...CASES.map((c) => c.tool), 'upload-file', ...Object.keys(BROKEN)].sort();
    expect(covered).toEqual(writing);
  });
});
