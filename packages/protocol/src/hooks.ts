/**
 * Conversation hooks: the low-level lifecycle of an LLM conversation.
 *
 * Shaping hooks (`hook_request` / `hook_response`) let apps contribute
 * context, veto or transform the user's message; notify hooks
 * (`hook_notify` / `hook_ack`) tell apps what happened without making the
 * conversation wait. `conversation_read` lets an app read a closed
 * conversation page by page.
 *
 * Spec: docs/specs/hooks/conversation-hooks.md (HOOK).
 */

import { z } from 'zod';
import { ExecutionContextSchema, SessionMessageBaseSchema } from './envelope.js';
import { ProtocolErrorSchema } from './errors.js';

// ----------------------------------------------------------------------------
// Hook points (HOOK-REQ-1)
// ----------------------------------------------------------------------------

/** Points where the Host waits for the app's answer, within a timeout. */
export const ShapingHookPointSchema = z.enum(['session-start', 'pre-turn', 'pre-compaction']);
export type ShapingHookPoint = z.infer<typeof ShapingHookPointSchema>;

/** Points where the Host hands the app what happened and moves on. */
export const NotifyHookPointSchema = z.enum(['post-turn', 'post-compaction', 'on-dream']);
export type NotifyHookPoint = z.infer<typeof NotifyHookPointSchema>;

/**
 * The six hook points.
 *
 * @spec HOOK-REQ-1
 */
export const HookPointSchema = z.enum([
  'session-start',
  'pre-turn',
  'post-turn',
  'pre-compaction',
  'post-compaction',
  'on-dream',
]);
export type HookPoint = z.infer<typeof HookPointSchema>;

/**
 * Whether a point is a shaping point (the Host waits for the answer).
 *
 * @spec HOOK-REQ-1
 */
export function isShapingHookPoint(point: string): point is ShapingHookPoint {
  return ShapingHookPointSchema.safeParse(point).success;
}

/**
 * Whether a point is a notify point (fire and forget).
 *
 * @spec HOOK-REQ-1
 */
export function isNotifyHookPoint(point: string): point is NotifyHookPoint {
  return NotifyHookPointSchema.safeParse(point).success;
}

// ----------------------------------------------------------------------------
// Manifest declaration (HOOK-REQ-2)
// ----------------------------------------------------------------------------

/** Most previous turns an app may ask for in a `pre-turn` input. */
export const MAX_HOOK_HISTORY = 5;

/** The object form of a manifest `hooks` entry. */
export const HookDeclarationSchema = z
  .object({
    point: HookPointSchema,
    /** Most tokens the app intends to contribute. */
    maxTokens: z.number().int().positive().optional(),
    /** The app's requested timeout in milliseconds. */
    timeoutMs: z.number().int().positive().optional(),
    /** Previous turns the app needs in a `pre-turn` input, 0 to 5. */
    history: z.number().int().min(0).max(MAX_HOOK_HISTORY).optional(),
    /** Marks a `pre-turn` handler that transforms the message. */
    transform: z.boolean().optional(),
  })
  .refine((d) => d.transform === undefined || d.point === 'pre-turn', {
    message: '`transform` is only allowed on the pre-turn hook point',
    path: ['transform'],
  });
export type HookDeclaration = z.infer<typeof HookDeclarationSchema>;

/**
 * A manifest `hooks` entry: a point name, or an object with the point and
 * its options.
 *
 * @spec HOOK-REQ-2
 */
export const HookEntrySchema = z.union([HookPointSchema, HookDeclarationSchema]);
export type HookEntry = z.infer<typeof HookEntrySchema>;

/** The object form of a manifest `hooks` entry; notify points drop the shaping options. */
export function normalizeHookEntry(entry: HookEntry): HookDeclaration {
  const declaration: HookDeclaration = typeof entry === 'string' ? { point: entry } : entry;
  if (isNotifyHookPoint(declaration.point)) return { point: declaration.point };
  return declaration;
}

// ----------------------------------------------------------------------------
// Messages and context blocks (HOOK-REQ-6, HOOK-REQ-7)
// ----------------------------------------------------------------------------

/**
 * Attachment metadata. Contents are never inlined; `url` is a host-issued,
 * time-limited link for apps holding `hooksTransform` or `hooksConversation`.
 */
export const HookAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
  url: z.string().optional(),
});
export type HookAttachment = z.infer<typeof HookAttachmentSchema>;

/**
 * A user message as hooks see it.
 *
 * @spec HOOK-REQ-6
 */
export const HookMessageSchema = z
  .object({
    text: z.string(),
    attachments: z.array(HookAttachmentSchema),
  })
  .strict();
export type HookMessage = z.infer<typeof HookMessageSchema>;

/** Most context blocks one invocation may return (HOOK-REQ-7). */
export const MAX_CONTEXT_BLOCKS = 8;

/**
 * Text an app contributes to a context region.
 *
 * @spec HOOK-REQ-7
 */
export const ContextBlockSchema = z
  .object({
    text: z.string().min(1),
    label: z.string().max(64).optional(),
    priority: z.number().int().min(0).max(100).optional(),
  })
  .strict();
export type ContextBlock = z.infer<typeof ContextBlockSchema>;

/** A veto: blocks the user's message with a reason. */
export const HookVetoSchema = z.object({
  /** Human-readable reason for the veto. */
  reason: z.string().min(1),
  /** Machine-readable code for categorization (optional). */
  code: z.string().optional(),
});
export type HookVeto = z.infer<typeof HookVetoSchema>;

// ----------------------------------------------------------------------------
// Host description (HOOK-REQ-3)
// ----------------------------------------------------------------------------

/** What this Host implements among the optional hook capabilities. */
export const HookHostSupportsSchema = z.object({
  transform: z.boolean(),
  transformAttachments: z.boolean(),
  history: z.boolean(),
  preservedContext: z.boolean(),
  onDream: z.boolean(),
  conversationRead: z.boolean(),
});
export type HookHostSupports = z.infer<typeof HookHostSupportsSchema>;

/**
 * The Host as hooks see it, carried by every `hook_request` and `hook_notify`.
 *
 * @spec HOOK-REQ-3
 */
export const HookHostSchema = z.object({
  name: z.string(),
  supports: HookHostSupportsSchema,
  /** Token budgets in force, e.g. `{ perApp: 500, turn: 2000 }` (HOOK-REQ-20). */
  budgets: z.record(z.string(), z.number()).optional(),
  /** How long undelivered notifications are retried, as an ISO 8601 duration (HOOK-REQ-16). */
  notifyRetention: z.string().optional(),
  /** Most turns one `conversation_read` page returns (HOOK-REQ-27). */
  readPageSize: z.number().int().positive().optional(),
});
export type HookHost = z.infer<typeof HookHostSchema>;

// ----------------------------------------------------------------------------
// Inputs (HOOK-REQ-4, HOOK-REQ-5, HOOK-REQ-18, HOOK-REQ-28)
// ----------------------------------------------------------------------------

export const SessionStartInputSchema = z.object({
  conversationId: z.string(),
  reason: z.enum(['opened', 'compacted']),
  locale: z.string().optional(),
  timezone: z.string().optional(),
});
export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;

export const HistoryTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
});
export type HistoryTurn = z.infer<typeof HistoryTurnSchema>;

export const PreTurnInputSchema = z.object({
  conversationId: z.string(),
  turnId: z.string(),
  message: HookMessageSchema,
  /** ISO 8601 timestamp. */
  now: z.string(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  history: z.array(HistoryTurnSchema),
});
export type PreTurnInput = z.infer<typeof PreTurnInputSchema>;

export const PreCompactionInputSchema = z.object({
  conversationId: z.string(),
  /** Text of the history being compacted, at most 8 000 tokens. */
  segment: z.string(),
  /** The session context currently in force, as rendered. */
  sessionContext: z.string(),
  /** Ordered ids of the turns about to be compacted (HOOK-REQ-28). */
  selection: z.array(z.string()),
});
export type PreCompactionInput = z.infer<typeof PreCompactionInputSchema>;

/** A tool call made during a turn. */
export const HookToolCallSchema = z.object({
  app: z.string(),
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  status: z.enum(['success', 'error']),
  result: z.unknown().optional(),
});
export type HookToolCall = z.infer<typeof HookToolCallSchema>;

export const PostTurnInputSchema = z.object({
  conversationId: z.string(),
  turnId: z.string(),
  /** The user message as the model finally saw it, after any transform. */
  message: HookMessageSchema,
  response: z.string(),
  toolCalls: z.array(HookToolCallSchema),
});
export type PostTurnInput = z.infer<typeof PostTurnInputSchema>;

/**
 * The result of one compaction: immutable once announced.
 *
 * @spec HOOK-REQ-28
 */
export const ChunkSchema = z.object({
  /** Stable, unique within the conversation, never reused. */
  id: z.string(),
  /** Text that replaces the compacted turns in the prompt. */
  summary: z.string(),
  /** The compacted turns, the same values as the `selection`. */
  turnIds: z.array(z.string()),
  /** Ids of earlier chunks this one absorbs. */
  absorbs: z.array(z.string()).optional(),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const PostCompactionInputSchema = z.object({
  conversationId: z.string(),
  chunk: ChunkSchema,
});
export type PostCompactionInput = z.infer<typeof PostCompactionInputSchema>;

export const OnDreamInputSchema = z.object({
  conversationId: z.string(),
  /** Closure sequence for this conversation, from 1. */
  closure: z.number().int().min(1),
  closedAt: z.string(),
  /** Host-defined, such as `archived` or `inactive`. */
  reason: z.string(),
  previousClosureAt: z.string().optional(),
  turnCount: z.number().int().nonnegative(),
  firstTurnAt: z.string().optional(),
  lastTurnAt: z.string().optional(),
  /** Approximate size of the full transcript. */
  sizeBytes: z.number().int().nonnegative(),
  /** Until when the app may read this closure through `conversation_read`. */
  readableUntil: z.string(),
});
export type OnDreamInput = z.infer<typeof OnDreamInputSchema>;

/** Input schema of each hook point. */
export const HOOK_INPUT_SCHEMAS = {
  'session-start': SessionStartInputSchema,
  'pre-turn': PreTurnInputSchema,
  'pre-compaction': PreCompactionInputSchema,
  'post-turn': PostTurnInputSchema,
  'post-compaction': PostCompactionInputSchema,
  'on-dream': OnDreamInputSchema,
} as const;

/** Input type of each hook point. */
export interface HookInputs {
  'session-start': SessionStartInput;
  'pre-turn': PreTurnInput;
  'pre-compaction': PreCompactionInput;
  'post-turn': PostTurnInput;
  'post-compaction': PostCompactionInput;
  'on-dream': OnDreamInput;
}

// ----------------------------------------------------------------------------
// Wire messages (HOOK-REQ-4, HOOK-REQ-5, HOOK-REQ-27)
// ----------------------------------------------------------------------------

/**
 * Host → Instance: invoke a shaping hook and wait for the answer.
 *
 * @spec HOOK-REQ-4
 */
export const HookRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('hook_request'),
  requestId: z.string(),
  hookPoint: ShapingHookPointSchema,
  context: ExecutionContextSchema,
  host: HookHostSchema,
  input: z.record(z.string(), z.unknown()),
});
export type HookRequest = z.infer<typeof HookRequestSchema>;

/**
 * Instance → Host: a shaping hook's answer. The Host validates each part and
 * drops what is invalid or not allowed at the point.
 *
 * @spec HOOK-REQ-4
 */
export const HookResponseSchema = SessionMessageBaseSchema.extend({
  type: z.literal('hook_response'),
  requestId: z.string(),
  context: z.array(z.unknown()).optional(),
  veto: z.unknown().optional(),
  message: z.unknown().optional(),
});
export type HookResponse = z.infer<typeof HookResponseSchema>;

/**
 * Host → Instance: a notify hook. The Host does not wait for the answer.
 *
 * @spec HOOK-REQ-5
 */
export const HookNotifySchema = SessionMessageBaseSchema.extend({
  type: z.literal('hook_notify'),
  notifyId: z.string(),
  hookPoint: NotifyHookPointSchema,
  /** Idempotency key: `conversationId:turnId` or `conversationId:closure`. */
  key: z.string().optional(),
  context: ExecutionContextSchema,
  host: HookHostSchema,
  input: z.record(z.string(), z.unknown()),
});
export type HookNotify = z.infer<typeof HookNotifySchema>;

/**
 * Instance → Host: the app accepted a notification. Delivery tracking only.
 *
 * @spec HOOK-REQ-5
 */
export const HookAckSchema = SessionMessageBaseSchema.extend({
  type: z.literal('hook_ack'),
  notifyId: z.string(),
});
export type HookAck = z.infer<typeof HookAckSchema>;

/** One turn of a conversation as `conversation_read` returns it. */
export const ConversationTurnSchema = z.object({
  turnId: z.string(),
  at: z.string(),
  message: HookMessageSchema,
  response: z.string().optional(),
  toolCalls: z.array(HookToolCallSchema),
  /** Present on a vetoed turn, which has no response. */
  vetoes: z.array(HookVetoSchema.extend({ app: z.string() })).optional(),
});
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

/**
 * Instance → Host: read a page of a closed conversation.
 *
 * @spec HOOK-REQ-27
 */
export const ConversationReadRequestSchema = SessionMessageBaseSchema.extend({
  type: z.literal('conversation_read'),
  requestId: z.string(),
  conversationId: z.string(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().optional(),
});
export type ConversationReadRequest = z.infer<typeof ConversationReadRequestSchema>;

/**
 * Host → Instance: a page of turns; `nextCursor` is absent on the last page.
 *
 * @spec HOOK-REQ-27
 */
export const ConversationReadResultSchema = SessionMessageBaseSchema.extend({
  type: z.literal('conversation_read_result'),
  requestId: z.string(),
  turns: z.array(ConversationTurnSchema),
  nextCursor: z.string().optional(),
  error: ProtocolErrorSchema.optional(),
});
export type ConversationReadResult = z.infer<typeof ConversationReadResultSchema>;
