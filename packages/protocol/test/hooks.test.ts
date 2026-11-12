/**
 * Conversation hook schemas (docs/specs/hooks/conversation-hooks.md).
 */

import { describe, expect, it } from 'vitest';
import {
  AppManifestSchema,
  ConversationReadRequestSchema,
  HookAckSchema,
  HookEntrySchema,
  HookMessageSchema,
  HookNotifySchema,
  HookPointSchema,
  HookRequestSchema,
  InstanceRequestSchema,
  normalizeHookEntry,
  SessionRequestSchema,
  SessionResponseSchema,
} from '../src/index.js';

const host = {
  name: 'claude-code',
  supports: {
    transform: false,
    transformAttachments: false,
    history: true,
    preservedContext: true,
    onDream: true,
    conversationRead: true,
  },
};
const context = { userId: 'u1', installationId: 'inst_1' };
const envelope = { id: 'm1', timestamp: '2026-11-09T00:00:00Z', version: '2.0', sessionId: 's1' };

describe('Hook points and declarations', () => {
  it('[HOOK-AC-2] defines exactly the six points', () => {
    expect(HookPointSchema.options).toEqual([
      'session-start',
      'pre-turn',
      'post-turn',
      'pre-compaction',
      'post-compaction',
      'on-dream',
    ]);
    expect(HookPointSchema.safeParse('pre-message').success).toBe(false);
  });

  it('[HOOK-AC-2] accepts names and objects; transform only on pre-turn', () => {
    expect(HookEntrySchema.safeParse('pre-turn').success).toBe(true);
    expect(
      HookEntrySchema.safeParse({ point: 'pre-turn', maxTokens: 200, transform: true, history: 2 })
        .success,
    ).toBe(true);
    expect(HookEntrySchema.safeParse({ point: 'session-start', transform: true }).success).toBe(
      false,
    );
    expect(HookEntrySchema.safeParse({ point: 'pre-turn', history: 6 }).success).toBe(false);
    const manifest = AppManifestSchema.shape.hooks.safeParse([
      { point: 'post-turn', transform: true },
    ]);
    expect(manifest.success).toBe(false);
  });

  it('ignores shaping options on notify points', () => {
    expect(normalizeHookEntry({ point: 'post-turn', maxTokens: 10, timeoutMs: 5 })).toEqual({
      point: 'post-turn',
    });
    expect(normalizeHookEntry('pre-turn')).toEqual({ point: 'pre-turn' });
  });
});

describe('Hook messages', () => {
  it('[HOOK-AC-3] hook_request and hook_notify require host.name and host.supports', () => {
    const request = {
      ...envelope,
      type: 'hook_request',
      requestId: 'r1',
      hookPoint: 'pre-turn',
      context,
      host,
      input: {},
    };
    expect(HookRequestSchema.safeParse(request).success).toBe(true);
    expect(HookRequestSchema.safeParse({ ...request, host: { name: 'x' } }).success).toBe(false);
    expect(SessionRequestSchema.safeParse(request).success).toBe(true);

    const notify = {
      ...envelope,
      type: 'hook_notify',
      notifyId: 'n1',
      hookPoint: 'on-dream',
      key: 'c1:1',
      context,
      host,
      input: {},
    };
    expect(HookNotifySchema.safeParse(notify).success).toBe(true);
    expect(HookNotifySchema.safeParse({ ...notify, host: undefined }).success).toBe(false);
    expect(HookNotifySchema.safeParse({ ...notify, hookPoint: 'pre-turn' }).success).toBe(false);
    expect(SessionRequestSchema.safeParse(notify).success).toBe(true);
    expect(
      SessionResponseSchema.safeParse({ ...envelope, type: 'hook_ack', notifyId: 'n1' }).success,
    ).toBe(true);
    expect(HookAckSchema.safeParse({ ...envelope, type: 'hook_ack' }).success).toBe(false);
  });

  it('[HOOK-AC-6] a message carries attachment metadata and never contents', () => {
    const attachment = { id: 'a1', name: 'cv.pdf', mimeType: 'application/pdf', size: 1024 };
    expect(HookMessageSchema.safeParse({ text: 'hi', attachments: [attachment] }).success).toBe(
      true,
    );
    expect(
      HookMessageSchema.safeParse({
        text: 'hi',
        attachments: [attachment],
        content: 'JVBERi0xLjQK',
      }).success,
    ).toBe(false);
  });

  it('conversation_read is an instance Request', () => {
    const read = {
      ...envelope,
      type: 'conversation_read',
      requestId: 'q1',
      conversationId: 'c1',
      limit: 50,
    };
    expect(ConversationReadRequestSchema.safeParse(read).success).toBe(true);
    expect(InstanceRequestSchema.safeParse(read).success).toBe(true);
  });
});
