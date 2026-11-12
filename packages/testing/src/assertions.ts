/**
 * Assertion helpers over captured protocol traffic.
 */

import type { MessageBase } from '@agentapps/protocol';

/** A filter used to match protocol messages. */
export type TrafficFilter =
  | string // exact type match
  | { type?: string; predicate?: (msg: Record<string, unknown>) => boolean };

function matches(msg: Record<string, unknown>, filter: TrafficFilter): boolean {
  if (typeof filter === 'string') {
    return msg.type === filter;
  }
  if (filter.type && msg.type !== filter.type) {
    return false;
  }
  if (filter.predicate && !filter.predicate(msg)) {
    return false;
  }
  return true;
}

/**
 * Assert that `traffic` contains at least one message matching `filter`.
 *
 * @example
 * ```ts
 * harness.toContainMessage('initialized');
 * harness.toContainMessage({ type: 'tool_result', predicate: m => m.success === true });
 * ```
 */
export function toContainMessage(traffic: MessageBase[], filter: TrafficFilter): void {
  const found = traffic.some((m) => matches(m as Record<string, unknown>, filter));
  if (!found) {
    const types = traffic.map((m) => m.type).join(', ');
    throw new Error(
      `Expected traffic to contain message matching ${JSON.stringify(filter)}. Types seen: [${types}]`,
    );
  }
}

/**
 * Assert that `traffic` contains a subsequence of messages whose types match
 * `expectedTypes` in order (other messages may appear between them).
 *
 * @example
 * ```ts
 * harness.toHaveMessageSequence(['session_opened', 'list_tools', 'tools_list']);
 * ```
 */
export function toHaveMessageSequence(traffic: MessageBase[], expectedTypes: string[]): void {
  let idx = 0;
  for (const msg of traffic) {
    if (msg.type === expectedTypes[idx]) {
      idx++;
      if (idx === expectedTypes.length) return;
    }
  }
  const seen = traffic.map((m) => m.type).join(', ');
  throw new Error(
    `Expected message sequence [${expectedTypes.join(', ')}] but only matched ${idx}/${expectedTypes.length}. Types seen: [${seen}]`,
  );
}
