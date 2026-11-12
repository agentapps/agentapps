/**
 * Agent Apps Protocol v2.0 — message envelope.
 *
 * Two planes share one envelope:
 * - Control plane (host ↔ app station): no `sessionId`.
 * - Session plane (host ↔ instance, proxied by the app station): carries `sessionId`.
 *
 * Spec: Agent Apps Protocol v2.0 — REQ-1.
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const PROTOCOL_VERSION = '2.0' as const;

export const MessageBaseSchema = z.object({
  /** Unique identifier for request/response correlation. */
  id: z.string(),
  /** Message type discriminator. */
  type: z.string(),
  /** ISO 8601 timestamp. */
  timestamp: z.string(),
  /** Protocol version. */
  version: z.literal(PROTOCOL_VERSION),
  /** Present ⟺ session-plane message (REQ-1). */
  sessionId: z.string().optional(),
});

export type MessageBase = z.infer<typeof MessageBaseSchema>;

/** Generate a unique message id. */
export function generateMessageId(): string {
  return `msg_${randomUUID()}`;
}

/** Create an envelope with common fields filled in. */
export function createEnvelope(type: string, sessionId?: string): MessageBase {
  return {
    id: generateMessageId(),
    type,
    timestamp: new Date().toISOString(),
    version: PROTOCOL_VERSION,
    ...(sessionId !== undefined ? { sessionId } : {}),
  };
}

// ----------------------------------------------------------------------------
// Session-plane base, shared by every session-plane family (session-plane.ts,
// hooks.ts) without an import cycle.
// ----------------------------------------------------------------------------

/** Session-plane base: sessionId is required (not optional). */
export const SessionMessageBaseSchema = MessageBaseSchema.extend({
  sessionId: z.string(),
});
export type SessionMessageBase = z.infer<typeof SessionMessageBaseSchema>;

/**
 * Context passed with tool calls — identifies the user/tenant for the
 * session. Lighter than v1.0's `McaExecutionContext`: fields that are
 * now implicit in the session (`appId`, `mcaId`) or superseded by the
 * session connection (`callbackUrl`) are removed.
 */
export const ExecutionContextSchema = z.object({
  /** User who initiated the request. */
  userId: z.string(),
  /** Workspace context (optional). */
  workspaceId: z.string().optional(),
  /** Installation id (matches session_open). */
  installationId: z.string(),
  /** Channel where the request originated (optional, host-specific). */
  channelId: z.string().optional(),
  /** Agent handling the request (optional). */
  agentId: z.string().optional(),
  /** Unique request id for correlation. */
  requestId: z.string().optional(),
  /** Display name of the initiating user (optional). */
  userDisplayName: z.string().optional(),
  /** Avatar URL of the initiating user (optional). */
  userAvatarUrl: z.string().optional(),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
