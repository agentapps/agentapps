/**
 * HookDispatcher: the reference implementation of conversation hooks on the
 * Host side (docs/specs/hooks/conversation-hooks.md, HOOK-REQ-24).
 *
 * The Host tells the dispatcher what happens to a conversation (a session
 * starts, a user turn arrives, a turn completes, history is compacted, the
 * conversation closes); the dispatcher invokes the eligible apps, enforces
 * the hook Permissions, applies timeouts, keeps every failure fail-open,
 * renders the context regions and delivers notifications until acknowledged.
 *
 * What counts as a conversation, when it is closed and in which order
 * transforming apps run is Host policy, passed in as options.
 */

import {
  type AppPermissions,
  type Chunk,
  type ContextBlock,
  ContextBlockSchema,
  type ConversationTurn,
  ErrorCode,
  type ExecutionContext,
  type HistoryTurn,
  type HookEntry,
  type HookHost,
  type HookMessage,
  HookMessageSchema,
  type HookPoint,
  type HookToolCall,
  type HookVeto,
  HookVetoSchema,
  MAX_CONTEXT_BLOCKS,
  type NotifyHookPoint,
  normalizeHookEntry,
  type ShapingHookPoint,
} from '@agentapps/protocol';
import {
  approximateTokens,
  type ContextContribution,
  type RegionAttribution,
  renderContextRegion,
} from './context-region.js';
import { HookTimeoutError } from './session.js';
import type { HookResult } from './types.js';

// ---------------------------------------------------------------------------
// Inputs from the Host
// ---------------------------------------------------------------------------

/** What the dispatcher needs from a session to an app instance. */
export interface HookSession {
  readonly sessionId: string;
  sendHook(
    point: ShapingHookPoint,
    request: { context: ExecutionContext; host: HookHost; input: Record<string, unknown> },
    timeoutMs: number,
  ): Promise<HookResult>;
  sendNotify(
    point: NotifyHookPoint,
    notification: {
      key?: string;
      context: ExecutionContext;
      host: HookHost;
      input: Record<string, unknown>;
    },
    ackTimeoutMs: number,
  ): Promise<boolean>;
}

/** An installed app as hooks see it. */
export interface HookApp {
  appId: string;
  /** Shown to the model in the context fence. */
  appName: string;
  installationId: string;
  /** Agents that have this app installed (HOOK-REQ-10). */
  agentIds: string[];
  /** The manifest `hooks` array. */
  hooks: HookEntry[];
  /** The approved Permissions. */
  permissions: AppPermissions;
  /** The current session to the app, or undefined while it is unavailable. */
  session: HookSession | undefined;
}

/** A conversation as the Host identifies it. */
export interface ConversationRef {
  conversationId: string;
  agentId: string;
  userId: string;
  workspaceId?: string;
  locale?: string;
  timezone?: string;
}

/** Ceilings in milliseconds (HOOK-REQ-13); the defaults are the reference values. */
export interface HookCeilings {
  preTurnApp: number;
  chain: number;
  sessionStart: number;
  preCompaction: number;
}

export const REFERENCE_CEILINGS: HookCeilings = {
  preTurnApp: 2_000,
  chain: 3_000,
  sessionStart: 5_000,
  preCompaction: 5_000,
};

/** One line of the invocation log (HOOK-NFR-3). */
export interface HookLogEntry {
  appId: string;
  point: HookPoint;
  durationMs: number;
  outcome:
    | 'ok'
    | 'empty'
    | 'timeout'
    | 'error'
    | 'dropped-by-grant'
    | 'delivered'
    | 'retried'
    | 'expired'
    | 'rejected';
  tokens: number;
  detail?: string;
}

export interface HookDispatcherOptions {
  /** Name, `supports`, budgets, retention and page size reported to apps (HOOK-REQ-3). */
  host: HookHost;
  /** The installed apps right now; read on every dispatch and delivery attempt. */
  apps: () => HookApp[];
  ceilings?: Partial<HookCeilings>;
  /** Order of the transform chain (Host policy); defaults to app id. */
  transformOrder?: (apps: HookApp[]) => HookApp[];
  /** Per-app and per-region token ceilings; defaults to `host.budgets`. */
  budgets?: { perApp?: number; session?: number; turn?: number; preserved?: number };
  /** The Host's tokenizer; defaults to `ceil(characters / 4)`. */
  countTokens?: (text: string) => number;
  /** How long one delivery attempt waits for `hook_ack`. */
  ackTimeoutMs?: number;
  /** Delays between delivery attempts; the last one repeats. */
  retryDelaysMs?: number[];
  /** How long notifications are retried (HOOK-REQ-16); defaults to `host.notifyRetention` or 24 h. */
  notifyRetentionMs?: number;
  /** How long a closure stays readable after it is notified (HOOK-REQ-18); defaults to 7 days. */
  readableForMs?: number;
  /** Receives one entry per invocation; defaults to stderr. */
  log?: (entry: HookLogEntry) => void;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// Results to the Host
// ---------------------------------------------------------------------------

/** One veto, attributed. */
export interface AttributedVeto extends HookVeto {
  app: string;
}

/** Everything the Host records about a turn (HOOK-REQ-22). */
export interface TurnAttribution {
  region: RegionAttribution;
  transformations: Array<{ app: string; message: HookMessage }>;
  rejectedTransformations: Array<{ app: string; reason: string }>;
  vetoes: AttributedVeto[];
  timeouts: string[];
  failures: string[];
  droppedByGrant: Array<{ app: string; what: 'context' | 'veto' | 'message' | 'history' }>;
}

export interface PreTurnOutcome {
  vetoed: boolean;
  vetoes: AttributedVeto[];
  /** The message the model sees: the transform chain's output. */
  message: HookMessage;
  /** The rendered turn region; empty when vetoed. */
  region: string;
  attribution: TurnAttribution;
  /** The original message and every accepted transformation (HOOK-REQ-11). */
  audit: { original: HookMessage; transformations: Array<{ app: string; message: HookMessage }> };
}

export interface ShapingOutcome {
  region: string;
  attribution: TurnAttribution;
}

// ---------------------------------------------------------------------------
// Conversation record
// ---------------------------------------------------------------------------

interface ConversationState {
  ref: ConversationRef;
  turns: ConversationTurn[];
  closures: Array<{ closure: number; closedAt: string; turnCount: number }>;
  chunks: Chunk[];
  chunkSeq: number;
  sessionRegion: string;
  preservedRegion: string;
  interfaceContext: Map<string, ContextBlock[]>;
}

interface Readable {
  conversationId: string;
  closure: number;
  turnCount: number;
  readableUntil: number;
}

interface PendingNotify {
  point: NotifyHookPoint;
  key?: string;
  conversation: ConversationRef;
  input: Record<string, unknown>;
  enqueuedAt: number;
  attempts: number;
  /** For on-dream: what the app may read once delivered. */
  readable?: Readable;
}

const SHAPING_CEILING: Record<ShapingHookPoint, keyof HookCeilings> = {
  'session-start': 'sessionStart',
  'pre-turn': 'preTurnApp',
  'pre-compaction': 'preCompaction',
};

/**
 * The reference dispatcher.
 *
 * @spec HOOK-REQ-24
 */
export class HookDispatcher {
  private readonly ceilings: HookCeilings;
  private readonly countTokens: (text: string) => number;
  private readonly now: () => Date;
  private readonly log: (entry: HookLogEntry) => void;
  private readonly conversations = new Map<string, ConversationState>();
  /** Per app installation and conversation: notifications waiting, in order (HOOK-REQ-16). */
  private readonly queues = new Map<string, PendingNotify[]>();
  private readonly draining = new Set<string>();
  /** Per app installation: closures it was notified about (HOOK-REQ-27). */
  private readonly readable = new Map<string, Readable[]>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private stopped = false;

  constructor(private readonly options: HookDispatcherOptions) {
    this.ceilings = { ...REFERENCE_CEILINGS, ...options.ceilings };
    this.countTokens = options.countTokens ?? approximateTokens;
    this.now = options.now ?? (() => new Date());
    this.log =
      options.log ??
      ((e) =>
        // eslint-disable-next-line no-console
        console.error(
          `[hooks] app=${e.appId} point=${e.point} outcome=${e.outcome} duration=${e.durationMs}ms tokens=${e.tokens}${e.detail ? ` ${e.detail}` : ''}`,
        ));
  }

  /** Stop retrying deliveries. */
  stop(): void {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // -------------------------------------------------------------------------
  // Eligibility (HOOK-REQ-2, HOOK-REQ-9, HOOK-REQ-10)
  // -------------------------------------------------------------------------

  /** Apps invoked at a point in a conversation: declared, in scope, and granted for notify points. */
  private eligible(point: HookPoint, ref: ConversationRef): HookApp[] {
    return this.options.apps().filter((app) => {
      if (!declaration(app, point)) return false;
      const inScope =
        app.agentIds.includes(ref.agentId) || app.permissions.hooksWorkspaceWide === true;
      if (!inScope) return false;
      // HOOK-REQ-9: notify points carry conversation content.
      if (isNotify(point) && app.permissions.hooksConversation !== true) {
        this.log({
          appId: app.appId,
          point,
          durationMs: 0,
          outcome: 'dropped-by-grant',
          tokens: 0,
          detail: 'hooksConversation not granted',
        });
        return false;
      }
      return true;
    });
  }

  private state(ref: ConversationRef): ConversationState {
    let s = this.conversations.get(ref.conversationId);
    if (!s) {
      s = {
        ref,
        turns: [],
        closures: [],
        chunks: [],
        chunkSeq: 0,
        sessionRegion: '',
        preservedRegion: '',
        interfaceContext: new Map(),
      };
      this.conversations.set(ref.conversationId, s);
    }
    s.ref = { ...s.ref, ...ref };
    return s;
  }

  private context(app: HookApp, ref: ConversationRef): ExecutionContext {
    return {
      userId: ref.userId,
      ...(ref.workspaceId !== undefined ? { workspaceId: ref.workspaceId } : {}),
      installationId: app.installationId,
      agentId: ref.agentId,
    };
  }

  // -------------------------------------------------------------------------
  // Shaping invocations (HOOK-REQ-13, HOOK-REQ-14)
  // -------------------------------------------------------------------------

  /** Invoke one app; any failure is an empty answer. */
  private async invoke(
    app: HookApp,
    point: ShapingHookPoint,
    ref: ConversationRef,
    input: Record<string, unknown>,
    ceilingMs: number,
    attribution: TurnAttribution,
  ): Promise<HookResult | null> {
    const declared = declaration(app, point)?.timeoutMs;
    const timeoutMs = Math.max(1, Math.min(declared ?? ceilingMs, ceilingMs));
    const started = Date.now();
    if (!app.session) {
      attribution.failures.push(app.appId);
      this.log({
        appId: app.appId,
        point,
        durationMs: 0,
        outcome: 'error',
        tokens: 0,
        detail: 'instance unavailable',
      });
      return null;
    }
    try {
      const result = await app.session.sendHook(
        point,
        { context: this.context(app, ref), host: this.options.host, input },
        timeoutMs,
      );
      const empty =
        result.context === undefined && result.veto === undefined && result.message === undefined;
      this.log({
        appId: app.appId,
        point,
        durationMs: Date.now() - started,
        outcome: empty ? 'empty' : 'ok',
        tokens: tokensOf(result.context, this.countTokens),
      });
      return result;
    } catch (err) {
      const timedOut = err instanceof HookTimeoutError;
      (timedOut ? attribution.timeouts : attribution.failures).push(app.appId);
      this.log({
        appId: app.appId,
        point,
        durationMs: Date.now() - started,
        outcome: timedOut ? 'timeout' : 'error',
        tokens: 0,
        ...(timedOut ? {} : { detail: err instanceof Error ? err.message : String(err) }),
      });
      return null;
    }
  }

  /** Granted, valid context blocks of an answer (HOOK-REQ-7, HOOK-REQ-9). */
  private contextOf(
    app: HookApp,
    point: ShapingHookPoint,
    result: HookResult | null,
    attribution: TurnAttribution,
  ): ContextContribution | null {
    if (!result?.context || result.context.length === 0) return null;
    if (app.permissions.hooksContext !== true) {
      attribution.droppedByGrant.push({ app: app.appId, what: 'context' });
      this.logDrop(app, point, 'context without hooksContext');
      return null;
    }
    const blocks = result.context
      .filter((b): b is ContextBlock => ContextBlockSchema.safeParse(b).success)
      .slice(0, MAX_CONTEXT_BLOCKS);
    if (blocks.length === 0) return null;
    const declared = declaration(app, point)?.maxTokens;
    return {
      appId: app.appId,
      appName: app.appName,
      blocks,
      ...(declared !== undefined ? { maxTokens: declared } : {}),
      source: 'hook',
    };
  }

  private vetoOf(
    app: HookApp,
    result: HookResult | null,
    attribution: TurnAttribution,
  ): AttributedVeto | null {
    if (result?.veto === undefined) return null;
    const parsed = HookVetoSchema.safeParse(result.veto);
    if (!parsed.success) return null;
    if (app.permissions.hooksVeto !== true) {
      attribution.droppedByGrant.push({ app: app.appId, what: 'veto' });
      this.logDrop(app, 'pre-turn', 'veto without hooksVeto');
      return null;
    }
    return { app: app.appId, ...parsed.data };
  }

  private logDrop(app: HookApp, point: HookPoint, detail: string): void {
    this.log({
      appId: app.appId,
      point,
      durationMs: 0,
      outcome: 'dropped-by-grant',
      tokens: 0,
      detail,
    });
  }

  private budget(region: 'session' | 'turn' | 'preserved'): { perApp?: number; total?: number } {
    const fromHost = this.options.host.budgets ?? {};
    const b = this.options.budgets ?? {};
    return {
      perApp: b.perApp ?? fromHost.perApp,
      total: b[region] ?? fromHost[region],
    };
  }

  private render(
    region: 'session' | 'turn' | 'preserved',
    contributions: ContextContribution[],
  ): { text: string; attribution: RegionAttribution } {
    const { perApp, total } = this.budget(region);
    return renderContextRegion(region, contributions, {
      ...(perApp !== undefined ? { perAppTokens: perApp } : {}),
      ...(total !== undefined ? { totalTokens: total } : {}),
      countTokens: this.countTokens,
    });
  }

  // -------------------------------------------------------------------------
  // session-start (HOOK-REQ-12, HOOK-REQ-19)
  // -------------------------------------------------------------------------

  /**
   * Run `session-start` and keep the rendered session region until the next
   * one. Call it when the conversation opens, after each compaction, and when
   * an app with this point is installed or uninstalled mid-conversation.
   */
  async sessionStart(
    ref: ConversationRef,
    reason: 'opened' | 'compacted',
  ): Promise<ShapingOutcome> {
    const state = this.state(ref);
    const attribution = emptyAttribution();
    const input = {
      conversationId: ref.conversationId,
      reason,
      ...(ref.locale !== undefined ? { locale: ref.locale } : {}),
      ...(ref.timezone !== undefined ? { timezone: ref.timezone } : {}),
    };
    const contributions = await this.parallel(
      'session-start',
      ref,
      input,
      this.ceilings.sessionStart,
      attribution,
    );
    const rendered = this.render('session', contributions);
    attribution.region = rendered.attribution;
    state.sessionRegion = rendered.text;
    return { region: rendered.text, attribution };
  }

  /** The session region in force, reused unchanged until the next `session-start`. */
  sessionRegion(conversationId: string): string {
    return this.conversations.get(conversationId)?.sessionRegion ?? '';
  }

  /** The preserved region in force, kept until the next compaction. */
  preservedRegion(conversationId: string): string {
    return this.conversations.get(conversationId)?.preservedRegion ?? '';
  }

  /** All eligible apps at once, identical input; none sees another's answer. */
  private async parallel(
    point: ShapingHookPoint,
    ref: ConversationRef,
    input: Record<string, unknown>,
    ceilingMs: number,
    attribution: TurnAttribution,
  ): Promise<ContextContribution[]> {
    const apps = this.eligible(point, ref);
    const results = await Promise.all(
      apps.map((app) => this.invoke(app, point, ref, input, ceilingMs, attribution)),
    );
    const out: ContextContribution[] = [];
    results.forEach((result, i) => {
      const c = this.contextOf(apps[i]!, point, result, attribution);
      if (c) out.push(c);
    });
    return out;
  }

  // -------------------------------------------------------------------------
  // pre-turn (HOOK-REQ-11, HOOK-REQ-15, HOOK-REQ-23)
  // -------------------------------------------------------------------------

  /**
   * Set the context an app's UI Component contributes through
   * `aa.context.update`; it replaces the previous one (HOOK-REQ-23).
   */
  setInterfaceContext(ref: ConversationRef, appId: string, blocks: ContextBlock[]): void {
    const valid = blocks.filter((b) => ContextBlockSchema.safeParse(b).success);
    this.state(ref).interfaceContext.set(appId, valid.slice(0, MAX_CONTEXT_BLOCKS));
  }

  /**
   * Run `pre-turn`: the transform chain, then every other app at once.
   * A granted veto ends it and nothing reaches the model.
   */
  async preTurn(
    ref: ConversationRef,
    turn: { turnId: string; message: HookMessage; now?: string },
  ): Promise<PreTurnOutcome> {
    const state = this.state(ref);
    const attribution = emptyAttribution();
    const original = turn.message;
    const apps = this.eligible('pre-turn', ref);
    const supports = this.options.host.supports;
    const isLink = (app: HookApp) =>
      supports.transform &&
      declaration(app, 'pre-turn')?.transform === true &&
      app.permissions.hooksTransform === true;
    const order = this.options.transformOrder ?? ((list) => [...list].sort(byAppId));
    const chain = order(apps.filter(isLink));
    const others = apps.filter((a) => !isLink(a));

    const inputFor = (app: HookApp, message: HookMessage) => ({
      conversationId: ref.conversationId,
      turnId: turn.turnId,
      message,
      now: turn.now ?? this.now().toISOString(),
      ...(ref.locale !== undefined ? { locale: ref.locale } : {}),
      ...(ref.timezone !== undefined ? { timezone: ref.timezone } : {}),
      history: this.historyFor(app, state, attribution),
    });

    const contributions: ContextContribution[] = [];
    const vetoes: AttributedVeto[] = [];
    let message = original;

    // Stage 1: the transform chain, one link after the other.
    const chainDeadline = Date.now() + this.ceilings.chain;
    for (const app of chain) {
      const remaining = chainDeadline - Date.now();
      if (remaining <= 0) {
        attribution.timeouts.push(app.appId);
        break;
      }
      const result = await this.invoke(
        app,
        'pre-turn',
        ref,
        inputFor(app, message),
        Math.min(this.ceilings.preTurnApp, remaining),
        attribution,
      );
      const veto = this.vetoOf(app, result, attribution);
      if (veto) {
        vetoes.push(veto);
        break;
      }
      if (result?.message !== undefined) {
        const verdict = checkTransform(message, result.message);
        if (verdict.ok) {
          message = verdict.message;
          attribution.transformations.push({ app: app.appId, message });
        } else {
          attribution.rejectedTransformations.push({ app: app.appId, reason: verdict.reason });
          this.log({
            appId: app.appId,
            point: 'pre-turn',
            durationMs: 0,
            outcome: 'rejected',
            tokens: 0,
            detail: `transform rejected: ${verdict.reason}`,
          });
        }
      }
      const c = this.contextOf(app, 'pre-turn', result, attribution);
      if (c) contributions.push(c);
    }

    // Stage 2: every other app at once, on the chain's output.
    if (vetoes.length === 0) {
      const results = await Promise.all(
        others.map((app) =>
          this.invoke(
            app,
            'pre-turn',
            ref,
            inputFor(app, message),
            this.ceilings.preTurnApp,
            attribution,
          ),
        ),
      );
      results.forEach((result, i) => {
        const app = others[i]!;
        if (result?.message !== undefined) {
          attribution.droppedByGrant.push({ app: app.appId, what: 'message' });
          this.logDrop(app, 'pre-turn', 'transform outside the chain');
        }
        const veto = this.vetoOf(app, result, attribution);
        if (veto) vetoes.push(veto);
        const c = this.contextOf(app, 'pre-turn', result, attribution);
        if (c) contributions.push(c);
      });
    }

    attribution.vetoes = vetoes;
    const audit = { original, transformations: attribution.transformations };
    if (vetoes.length > 0) {
      // HOOK-REQ-15: nothing reaches the model; the record keeps the veto.
      state.turns.push({
        turnId: turn.turnId,
        at: this.now().toISOString(),
        message,
        toolCalls: [],
        vetoes,
      });
      return { vetoed: true, vetoes, message, region: '', attribution, audit };
    }

    // HOOK-REQ-23: interface context is turn context of its app.
    for (const [appId, blocks] of state.interfaceContext) {
      const app = this.options.apps().find((a) => a.appId === appId);
      if (!app || blocks.length === 0) continue;
      const declared = declaration(app, 'pre-turn')?.maxTokens;
      contributions.push({
        appId,
        appName: app.appName,
        blocks,
        ...(declared !== undefined ? { maxTokens: declared } : {}),
        source: 'interface',
      });
    }
    const rendered = this.render('turn', contributions);
    attribution.region = rendered.attribution;
    return { vetoed: false, vetoes, message, region: rendered.text, attribution, audit };
  }

  /** Previous turns for an app, capped by its declaration, its grant and the Host. */
  private historyFor(
    app: HookApp,
    state: ConversationState,
    attribution: TurnAttribution,
  ): HistoryTurn[] {
    const wanted = declaration(app, 'pre-turn')?.history ?? 0;
    if (wanted === 0) return [];
    if (app.permissions.hooksHistory !== true || !this.options.host.supports.history) {
      if (app.permissions.hooksHistory !== true) {
        attribution.droppedByGrant.push({ app: app.appId, what: 'history' });
      }
      return [];
    }
    const turns = state.turns.filter((t) => t.response !== undefined).slice(-wanted);
    return turns.flatMap((t) => [
      { role: 'user' as const, text: t.message.text },
      { role: 'assistant' as const, text: t.response ?? '' },
    ]);
  }

  // -------------------------------------------------------------------------
  // post-turn (HOOK-REQ-5, HOOK-REQ-17)
  // -------------------------------------------------------------------------

  /**
   * Record a completed turn and notify the apps. Returns at once; delivery
   * happens afterwards. Do not call it for a vetoed turn.
   */
  postTurn(
    ref: ConversationRef,
    turn: { turnId: string; message: HookMessage; response: string; toolCalls: HookToolCall[] },
  ): void {
    const state = this.state(ref);
    state.turns.push({
      turnId: turn.turnId,
      at: this.now().toISOString(),
      message: turn.message,
      response: turn.response,
      toolCalls: turn.toolCalls,
    });
    this.enqueue('post-turn', ref, `${ref.conversationId}:${turn.turnId}`, {
      conversationId: ref.conversationId,
      turnId: turn.turnId,
      message: turn.message,
      response: turn.response,
      toolCalls: turn.toolCalls,
    });
  }

  // -------------------------------------------------------------------------
  // Compaction (HOOK-REQ-28, HOOK-REQ-19)
  // -------------------------------------------------------------------------

  /**
   * Run `pre-compaction` over the turns about to be compacted and keep the
   * preserved region until the next compaction.
   */
  async preCompaction(
    ref: ConversationRef,
    compaction: { selection: string[]; segment: string },
  ): Promise<ShapingOutcome> {
    const state = this.state(ref);
    const attribution = emptyAttribution();
    const input = {
      conversationId: ref.conversationId,
      segment: compaction.segment,
      sessionContext: state.sessionRegion,
      selection: compaction.selection,
    };
    const contributions = await this.parallel(
      'pre-compaction',
      ref,
      input,
      this.ceilings.preCompaction,
      attribution,
    );
    const rendered = this.render('preserved', contributions);
    attribution.region = rendered.attribution;
    state.preservedRegion = rendered.text;
    return { region: rendered.text, attribution };
  }

  /**
   * Announce a compaction's chunk and notify the apps. The chunk gets a new
   * id; earlier chunks whose turns are all in the selection are absorbed.
   * The conversation record keeps the original turns.
   */
  postCompaction(
    ref: ConversationRef,
    compaction: { selection: string[]; summary: string },
  ): Chunk {
    const state = this.state(ref);
    const selected = new Set(compaction.selection);
    const absorbs = state.chunks
      .filter((c) => !state.chunks.some((o) => o.absorbs?.includes(c.id)))
      .filter((c) => c.turnIds.every((t) => selected.has(t)))
      .map((c) => c.id);
    state.chunkSeq += 1;
    const chunk: Chunk = {
      id: `${ref.conversationId}:chunk:${state.chunkSeq}`,
      summary: compaction.summary,
      turnIds: [...compaction.selection],
      ...(absorbs.length > 0 ? { absorbs } : {}),
    };
    state.chunks.push(chunk);
    this.enqueue('post-compaction', ref, undefined, { conversationId: ref.conversationId, chunk });
    return chunk;
  }

  // -------------------------------------------------------------------------
  // Closure (HOOK-REQ-18)
  // -------------------------------------------------------------------------

  /**
   * The Host closed the conversation: number the closure and notify the
   * apps once. Turns added later belong to the next closure. `turns`, when
   * given, is the Host's record of the whole conversation at closure.
   */
  close(
    ref: ConversationRef,
    reason: string,
    options: { turns?: ConversationTurn[] } = {},
  ): { closure: number } {
    const state = this.state(ref);
    // The Host's own record of the conversation, such as a transcript
    // snapshot, replaces what the dispatcher saw turn by turn.
    if (options.turns) state.turns = [...options.turns];
    const closure = state.closures.length + 1;
    const closedAt = this.now().toISOString();
    const previous = state.closures[state.closures.length - 1];
    state.closures.push({ closure, closedAt, turnCount: state.turns.length });
    const readableUntil = new Date(
      Math.max(
        this.now().getTime() + (this.options.readableForMs ?? 7 * 24 * 3600_000),
        this.now().getTime() + this.retentionMs(),
      ),
    ).toISOString();
    const turns = state.turns;
    this.enqueue(
      'on-dream',
      ref,
      `${ref.conversationId}:${closure}`,
      {
        conversationId: ref.conversationId,
        closure,
        closedAt,
        reason,
        ...(previous ? { previousClosureAt: previous.closedAt } : {}),
        turnCount: turns.length,
        ...(turns[0] ? { firstTurnAt: turns[0].at } : {}),
        ...(turns.length > 0 ? { lastTurnAt: turns[turns.length - 1]!.at } : {}),
        sizeBytes: Buffer.byteLength(JSON.stringify(turns)),
        readableUntil,
      },
      {
        conversationId: ref.conversationId,
        closure,
        turnCount: turns.length,
        readableUntil: Date.parse(readableUntil),
      },
    );
    return { closure };
  }

  // -------------------------------------------------------------------------
  // conversation_read (HOOK-REQ-27)
  // -------------------------------------------------------------------------

  /**
   * Answer an app's `conversation_read`: only with `hooksConversation`, only
   * for a closure it was notified about, only until `readableUntil`, and
   * only the turns that existed at that closure.
   */
  async readConversation(
    sessionId: string,
    request: { conversationId: string; cursor?: string; limit?: number },
  ): Promise<{
    turns: ConversationTurn[];
    nextCursor?: string;
    error?: { code: string; message: string };
  }> {
    const app = this.options.apps().find((a) => a.session?.sessionId === sessionId);
    const deny = (why: string) => {
      this.log({
        appId: app?.appId ?? `session:${sessionId}`,
        point: 'on-dream',
        durationMs: 0,
        outcome: 'rejected',
        tokens: 0,
        detail: `conversation_read ${request.conversationId} denied: ${why}`,
      });
      return { turns: [], error: { code: ErrorCode.PERMISSION_DENIED, message: why } };
    };
    if (!app) return deny('unknown session');
    if (app.permissions.hooksConversation !== true) return deny('hooksConversation not granted');
    const now = this.now().getTime();
    const grants = (this.readable.get(app.installationId) ?? []).filter(
      (r) => r.conversationId === request.conversationId && r.readableUntil > now,
    );
    const grant = grants.sort((a, b) => b.closure - a.closure)[0];
    if (!grant) return deny('no readable closure of this conversation was notified');

    const turns =
      this.conversations.get(request.conversationId)?.turns.slice(0, grant.turnCount) ?? [];
    const pageSize = Math.min(
      request.limit ?? this.options.host.readPageSize ?? 50,
      this.options.host.readPageSize ?? 50,
    );
    const start = request.cursor !== undefined ? Number.parseInt(request.cursor, 10) || 0 : 0;
    const page = turns.slice(start, start + pageSize);
    const next = start + page.length;
    return { turns: page, ...(next < turns.length ? { nextCursor: String(next) } : {}) };
  }

  // -------------------------------------------------------------------------
  // Notify delivery (HOOK-REQ-16)
  // -------------------------------------------------------------------------

  private retentionMs(): number {
    if (this.options.notifyRetentionMs !== undefined) return this.options.notifyRetentionMs;
    return parseIsoDuration(this.options.host.notifyRetention) ?? 24 * 3600_000;
  }

  private enqueue(
    point: NotifyHookPoint,
    ref: ConversationRef,
    key: string | undefined,
    input: Record<string, unknown>,
    readable?: Readable,
  ): void {
    for (const app of this.eligible(point, ref)) {
      const queueKey = `${app.installationId}|${ref.conversationId}`;
      const queue = this.queues.get(queueKey) ?? [];
      queue.push({
        point,
        ...(key !== undefined ? { key } : {}),
        conversation: ref,
        input,
        enqueuedAt: Date.now(),
        attempts: 0,
        ...(readable ? { readable } : {}),
      });
      this.queues.set(queueKey, queue);
      // After the triggering moment completes.
      this.schedule(() => this.drain(app.installationId, queueKey), 0);
    }
  }

  private schedule(fn: () => void, delayMs: number): void {
    if (this.stopped) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delayMs);
    if (typeof timer === 'object' && 'unref' in timer) timer.unref();
    this.timers.add(timer);
  }

  /** Deliver the queue head until acknowledged, then the next one, in order. */
  private async drain(installationId: string, queueKey: string): Promise<void> {
    if (this.draining.has(queueKey) || this.stopped) return;
    this.draining.add(queueKey);
    try {
      const queue = this.queues.get(queueKey) ?? [];
      while (queue.length > 0 && !this.stopped) {
        const head = queue[0]!;
        const app = this.options.apps().find((a) => a.installationId === installationId);
        if (!app) {
          queue.shift();
          continue;
        }
        if (Date.now() - head.enqueuedAt > this.retentionMs()) {
          queue.shift();
          this.log({
            appId: app.appId,
            point: head.point,
            durationMs: Date.now() - head.enqueuedAt,
            outcome: 'expired',
            tokens: 0,
            ...(head.key ? { detail: `key=${head.key}` } : {}),
          });
          continue;
        }
        const started = Date.now();
        head.attempts += 1;
        // A closure becomes readable once the app is told about it.
        if (head.readable) this.allowRead(installationId, head.readable);
        const acked = app.session
          ? await app.session
              .sendNotify(
                head.point,
                {
                  ...(head.key !== undefined ? { key: head.key } : {}),
                  context: this.context(app, head.conversation),
                  host: this.options.host,
                  input: head.input,
                },
                this.options.ackTimeoutMs ?? 5_000,
              )
              .catch(() => false)
          : false;
        if (acked) {
          queue.shift();
          this.log({
            appId: app.appId,
            point: head.point,
            durationMs: Date.now() - started,
            outcome: 'delivered',
            tokens: 0,
            ...(head.key ? { detail: `key=${head.key}` } : {}),
          });
          continue;
        }
        this.log({
          appId: app.appId,
          point: head.point,
          durationMs: Date.now() - started,
          outcome: 'retried',
          tokens: 0,
          detail: `attempt=${head.attempts}`,
        });
        const delays = this.options.retryDelaysMs ?? [500, 1_000, 5_000, 30_000, 60_000];
        const delay = delays[Math.min(head.attempts - 1, delays.length - 1)]!;
        this.schedule(() => this.drain(installationId, queueKey), delay);
        return;
      }
    } finally {
      this.draining.delete(queueKey);
    }
  }

  private allowRead(installationId: string, readable: Readable): void {
    const list = this.readable.get(installationId) ?? [];
    if (
      !list.some(
        (r) => r.conversationId === readable.conversationId && r.closure === readable.closure,
      )
    ) {
      list.push(readable);
    }
    this.readable.set(installationId, list);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function declaration(app: HookApp, point: HookPoint) {
  const entry = app.hooks.find((e) => (typeof e === 'string' ? e : e.point) === point);
  return entry === undefined ? undefined : normalizeHookEntry(entry);
}

function isNotify(point: HookPoint): point is NotifyHookPoint {
  return point === 'post-turn' || point === 'post-compaction' || point === 'on-dream';
}

function byAppId(a: HookApp, b: HookApp): number {
  return a.appId < b.appId ? -1 : a.appId > b.appId ? 1 : 0;
}

function emptyAttribution(): TurnAttribution {
  return {
    region: { rendered: [], truncated: [], dropped: [] },
    transformations: [],
    rejectedTransformations: [],
    vetoes: [],
    timeouts: [],
    failures: [],
    droppedByGrant: [],
  };
}

function tokensOf(context: unknown[] | undefined, count: (s: string) => number): number {
  if (!context) return 0;
  return context.reduce<number>((sum, b) => {
    const text = (b as { text?: unknown }).text;
    return sum + (typeof text === 'string' ? count(text) : 0);
  }, 0);
}

/**
 * A transform keeps the message shape and never adds an attachment the user
 * did not send (HOOK-REQ-11).
 */
function checkTransform(
  previous: HookMessage,
  candidate: unknown,
): { ok: true; message: HookMessage } | { ok: false; reason: string } {
  const parsed = HookMessageSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, reason: 'not a message' };
  const known = new Set(previous.attachments.map((a) => a.id));
  const added = parsed.data.attachments.filter((a) => !known.has(a.id));
  if (added.length > 0) return { ok: false, reason: `adds attachment ${added[0]!.id}` };
  return { ok: true, message: parsed.data };
}

/** Parse the subset of ISO 8601 durations a Host declares, such as `PT24H` or `P7D`. */
function parseIsoDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return undefined;
  const [, d, h, min, s] = m.map((x) => (x === undefined ? 0 : Number(x)));
  return (((d! * 24 + h!) * 60 + min!) * 60 + s!) * 1000;
}
