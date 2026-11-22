/**
 * @agentapps/sdk — polling helper.
 *
 * - `createPoller()` — periodic polling with start/stop and error handling.
 *
 * Receiving webhooks from third-party services is the app's own business:
 * run whatever listener the service needs and emit the app's Events from it.
 */

import type { ToolContext } from './types.js';

// ---------------------------------------------------------------------------
// Poller
// ---------------------------------------------------------------------------

export interface PollerOptions {
  /** Interval between calls in ms. Default: 30_000. */
  intervalMs?: number;
  /** Run the first call immediately after start(). Default: false. */
  immediate?: boolean;
  /** Keep polling after an error. Default: true. */
  continueOnError?: boolean;
  /**
   * Callback invoked when a poll iteration throws. If `continueOnError` is
   * false the poller stops after the first error.
   */
  onError?: (error: unknown) => void;
}

export interface Poller {
  /** True when the poller is actively scheduling/running iterations. */
  readonly running: boolean;
  /**
   * Start periodic polling with the context each iteration receives. Idempotent
   * while running; a context passed to a running poller replaces the one in use.
   * Without a context the poller waits: no iteration runs until one is given.
   *
   * @spec DEVX-REQ-2
   */
  start(ctx?: ToolContext): void;
  /** Stop polling. Clears pending timers and does not abort an in-flight call. */
  stop(): void;
  /** @internal @deprecated Pass the context to `start(ctx)`. */
  _bindContext(ctx: ToolContext): void;
}

/**
 * Create a periodic poller.
 *
 * The supplied function is called every `intervalMs` milliseconds. It receives
 * the current `ToolContext` so it can emit events, check subscribers, or call
 * other tools. The poller is not started automatically; the app must call
 * `start(ctx)` (usually when subscribers are detected).
 *
 * Example:
 * ```ts
 * const poller = createPoller(async (ctx) => {
 *   const events = await fetchCalendarUpdates(ctx);
 *   for (const e of events) ctx.emit('calendar_updated', e);
 * }, 30_000);
 * // in a tool or lifecycle handler, where a context exists:
 * poller.start(ctx);
 * ```
 */
export function createPoller(
  fn: (ctx: ToolContext) => unknown | Promise<unknown>,
  intervalMs = 30_000,
  options: PollerOptions = {},
): Poller {
  const opts = {
    intervalMs,
    immediate: false,
    continueOnError: true,
    ...options,
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  let _running = false;
  let currentContext: ToolContext | null = null;

  const run = async () => {
    if (!_running || !currentContext) return;
    try {
      await fn(currentContext);
    } catch (err) {
      opts.onError?.(err);
      if (!opts.continueOnError) {
        stop();
        return;
      }
    }
    if (_running) {
      timer = setTimeout(run, opts.intervalMs);
    }
  };

  const start = (ctx?: ToolContext) => {
    if (ctx) currentContext = ctx;
    if (_running) return;
    _running = true;
    if (opts.immediate) {
      timer = setTimeout(run, 0);
    } else {
      timer = setTimeout(run, opts.intervalMs);
    }
  };

  const stop = () => {
    _running = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    get running() {
      return _running;
    },
    start,
    stop,
    _bindContext(ctx: ToolContext) {
      currentContext = ctx;
    },
  };
}
