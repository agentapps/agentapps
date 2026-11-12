/**
 * Telemetry provider — pluggable observability for Agent Apps.
 *
 * Defines a provider interface for metrics (counters, histograms, gauges)
 * and tracing (spans). Both `@agentapps/station` and `@agentapps/host`
 * accept an optional `TelemetryProvider` — when omitted, a no-op singleton
 * with ZERO runtime overhead is used.
 *
 * To wire up OpenTelemetry (or any other backend), implement
 * `TelemetryProvider` and pass it via the config object.
 */

// ---------------------------------------------------------------------------
// Span handle
// ---------------------------------------------------------------------------

/** Minimal span handle returned by `TelemetryProvider.startSpan`. */
export interface SpanHandle {
  /** Set a key/value attribute on the span. */
  setAttribute(key: string, value: string | number | boolean): void;
  /** Set the span status. */
  setStatus(status: 'ok' | 'error', message?: string): void;
  /** End the span (records its duration). */
  end(): void;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/** Attribute bag passed to metric and span calls. */
export type TelemetryAttributes = Record<string, string | number>;

/**
 * Pluggable telemetry provider.
 *
 * Every method is fire-and-forget — implementations MUST NOT throw.
 */
export interface TelemetryProvider {
  /** Increment a counter metric. */
  counter(name: string, value?: number, attributes?: TelemetryAttributes): void;
  /** Record a histogram / distribution value. */
  histogram(name: string, value: number, attributes?: TelemetryAttributes): void;
  /** Record an instantaneous gauge value. */
  gauge(name: string, value: number, attributes?: TelemetryAttributes): void;
  /** Start a trace span. Returns a handle to annotate and close it. */
  startSpan(name: string, attributes?: TelemetryAttributes): SpanHandle;
}

// ---------------------------------------------------------------------------
// No-op provider (zero overhead)
// ---------------------------------------------------------------------------

/** Singleton span handle that does nothing. */
const NOOP_SPAN: SpanHandle = {
  setAttribute() {},
  setStatus() {},
  end() {},
};

/**
 * No-op telemetry provider.
 *
 * Used as the default when no telemetry is configured. Every method is a
 * static no-op — no object allocations, no closures, no overhead.
 */
export class NoopTelemetryProvider implements TelemetryProvider {
  counter(): void {}
  histogram(): void {}
  gauge(): void {}
  startSpan(): SpanHandle {
    return NOOP_SPAN;
  }
}

/**
 * Pre-built singleton — avoids allocating a new NoopTelemetryProvider for
 * every component that doesn't configure telemetry.
 */
export const NOOP_TELEMETRY = new NoopTelemetryProvider();
