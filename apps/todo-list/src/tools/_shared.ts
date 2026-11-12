/**
 * Todo List Agent App — Shared tool utilities
 *
 * User isolation, input validation, structured results, and typed error conversion.
 * Adapted from the original MCA _shared.ts for the @agentapps/sdk ToolContext.
 */

import type { ToolContext } from '@agentapps/sdk';
import { TodoError } from '../lib/index.js';

// =============================================================================
// ERROR CONVERSION
// =============================================================================

export function toToolError(error: unknown): never {
  if (error instanceof TodoError) {
    const suggestion = error.suggestion ? ` ${error.suggestion}` : '';
    throw new Error(`[${error.code}] ${error.message}${suggestion}`);
  }
  // Surface CIRCULAR_MOVE errors thrown by store.ts as plain Error with code prefix
  if (error instanceof Error && error.message.startsWith('CIRCULAR_MOVE:')) {
    throw new Error(`[CIRCULAR_MOVE] ${error.message.replace('CIRCULAR_MOVE: ', '')}`);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

// =============================================================================
// USER ISOLATION
// =============================================================================

/**
 * Extracts userId from the SDK execution context. Required on every handler —
 * without userId nothing is persisted or read (per-user isolation).
 */
export function requireUserId(context: ToolContext): string {
  const userId = context.execution?.userId;
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new TodoError(
      'NO_USER_CONTEXT',
      'User context missing — SDK did not pass execution.userId.',
      'This is an SDK bug, not a user error.',
    );
  }
  return userId;
}

// =============================================================================
// EVENT EMISSION
// =============================================================================

import type { TodoEventName, TodoEventPayloads } from '../lib/events.js';

/**
 * Emit an event to the host via ctx.emit().
 * Events are best-effort — never let emission failure break a tool call.
 */
export function emitEvent<K extends TodoEventName>(
  context: ToolContext,
  eventName: K,
  payload: TodoEventPayloads[K],
): void {
  try {
    context.emit(eventName, payload as Record<string, unknown>);
  } catch {
    // Events are best-effort — never let emission failure break a tool call
  }
}
