/**
 * Conversation hook types for app authors (docs/specs/hooks/conversation-hooks.md).
 *
 * A handler receives one context object, passed twice so both styles work:
 * `handler: ({ input, signal }) => …` and `handler: async ({ input }, ctx) => …`.
 */

import type {
  ContextBlock,
  ConversationTurn,
  ExecutionContext,
  HookHost,
  HookInputs,
  HookMessage,
  HookPoint,
  HookVeto,
  HostInfo,
  NotifyHookPoint,
  ShapingHookPoint,
} from '@agentapps/protocol';
import type { AuthAccess, SecretsAccess } from './types.js';

/** What a shaping handler may return; anything not allowed at the point is dropped. */
export interface ShapingHookResult {
  /** Context blocks, at most 8 (HOOK-REQ-7). */
  context?: ContextBlock[];
  /** Veto the user's message (`pre-turn` only, needs `hooksVeto`). */
  veto?: HookVeto;
  /** The transformed message (`pre-turn` with `transform: true` only, needs `hooksTransform`). */
  message?: HookMessage;
}

/** A page of a closed conversation (HOOK-REQ-27). */
export interface ConversationPage {
  turns: ConversationTurn[];
  /** Absent on the last page. */
  nextCursor?: string;
}

/**
 * Reads a conversation the app was notified about at `on-dream`.
 *
 * @spec HOOK-REQ-27
 */
export interface ConversationAccess {
  /** Every turn of the conversation, page after page. */
  read(conversationId: string, options?: { limit?: number }): AsyncIterable<ConversationTurn>;
  /** One page, starting at `cursor`. */
  readPage(
    conversationId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<ConversationPage>;
}

/**
 * What a hook handler receives.
 *
 * @spec HOOK-REQ-8
 */
export interface HookContext<P extends HookPoint = HookPoint> {
  /** The point's input (HOOK-REQ-4, HOOK-REQ-5). */
  readonly input: HookInputs[P];
  /** The Host as hooks see it: name, `supports`, budgets (HOOK-REQ-3). */
  readonly hookHost: HookHost;
  /** The Host behind this session (HOSTCAP-REQ-2). */
  readonly host: HostInfo | undefined;
  /** Who and where. */
  readonly execution: ExecutionContext;
  /** Aborted when the Host's timeout fires; never aborted at notify points. */
  readonly signal: AbortSignal;
  readonly secrets: SecretsAccess;
  readonly auth: AuthAccess;
  /** Read the notified conversation (meaningful at `on-dream`). */
  readonly conversation: ConversationAccess;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown): void;
}

type Awaitable<T> = T | Promise<T>;

/** A handler for a point: shaping handlers may return a result, notify handlers return nothing. */
export type HookHandler<P extends HookPoint = HookPoint> = (
  context: HookContext<P>,
  ctx: HookContext<P>,
) => P extends ShapingHookPoint
  ? Awaitable<ShapingHookResult | undefined | void>
  : P extends NotifyHookPoint
    ? Awaitable<void>
    : Awaitable<ShapingHookResult | undefined | void>;

/** `app.hook(point, config)` options (HOOK-REQ-8). */
export interface HookConfig<P extends HookPoint = HookPoint> {
  handler: HookHandler<P>;
  description?: string;
  /** Most tokens the app intends to contribute. */
  maxTokens?: number;
  /** The app's requested timeout in milliseconds. */
  timeoutMs?: number;
  /** Previous turns needed in a `pre-turn` input, 0 to 5. */
  history?: number;
  /** A `pre-turn` handler that transforms the message. */
  transform?: boolean;
}

/** @internal A hook as the app builder stores it. */
export interface RegisteredHook {
  point: HookPoint;
  description?: string;
  transform?: boolean;
  handler: HookHandler;
}
