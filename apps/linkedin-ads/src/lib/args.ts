/**
 * Argument validation and result shaping shared by the tools.
 *
 * JSON Schema is advisory in this stack, so every handler validates its arguments again
 * here. The agentapps CLI turns number-like values into numbers, so id-like parameters
 * accept both strings and numbers.
 */

/** Results stay below this so the SDK never truncates them (its limit is 50,000). */
export const MAX_RESULT_CHARS = 45_000;

export type Args = Record<string, unknown>;

export function bad(message: string): Error {
  return new Error(`[BAD_REQUEST] ${message}`);
}

/**
 * A numeric LinkedIn id. Accepts `123`, `"123"` or the full URN
 * (`urn:li:sponsoredCampaign:123`) of the expected type, and returns the digits.
 */
export function numericId(value: unknown, name: string, urnType: string): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw bad(
        `${name} must be a positive integer below 2^53; pass a larger id as a string in a JSON ` +
          `object, e.g. '{"${name}":"<id>"}'.`,
      );
    }
    return String(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const prefix = `urn:li:${urnType}:`;
    const digits = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
    if (/^\d{1,20}$/.test(digits)) return digits;
  }
  throw bad(
    `${name} must be a numeric id (or urn:li:${urnType}:<id>); got ${JSON.stringify(value)}.`,
  );
}

/** An optional list of numeric ids (array, or one id). Returns [] when absent. */
export function idList(value: unknown, name: string, urnType: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  if (items.length > max) throw bad(`${name} accepts at most ${max} ids; got ${items.length}.`);
  return items.map((item, i) => numericId(item, `${name}[${i}]`, urnType));
}

/** An optional list of enum values (array, or one value). Returns [] when absent. */
export function enumList<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T[] {
  if (value === undefined || value === null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => {
    const upper = typeof item === 'string' ? item.trim().toUpperCase() : '';
    if (!(allowed as readonly string[]).includes(upper)) {
      throw bad(`${name} must be one of ${allowed.join(', ')}; got ${JSON.stringify(item)}.`);
    }
    return upper as T;
  });
}

export function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  throw bad(`${name} must be true or false; got ${JSON.stringify(value)}.`);
}

export function pageSize(value: unknown, fallback: number, max: number): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > max) {
    throw bad(`pageSize must be an integer from 1 to ${max}; got ${JSON.stringify(value)}.`);
  }
  return n;
}

export function pageToken(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 2_000) {
    throw bad('pageToken must be the nextPageToken string returned by the previous call.');
  }
  return value;
}

/** A money amount for a budget: positive, at most 2 decimals, as LinkedIn's decimal string. */
export function amount(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    throw bad(
      `${name} must be a positive amount with at most 2 decimals, in the account currency ` +
        `(e.g. 50 or "49.99"); got ${JSON.stringify(value)}.`,
    );
  }
  return text;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** An ISO date `YYYY-MM-DD` that is a real calendar date. */
export function isoDate(value: unknown, name: string): string {
  if (typeof value === 'string' && ISO_DATE.test(value.trim())) {
    const text = value.trim();
    const date = new Date(`${text}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text) return text;
  }
  throw bad(`${name} must be a date in YYYY-MM-DD format; got ${JSON.stringify(value)}.`);
}

// ---------------------------------------------------------------------------
// Result shaping
// ---------------------------------------------------------------------------

export interface Money {
  amount: string;
  currencyCode: string;
}

/** Epoch milliseconds to ISO 8601, or null. */
export function isoTime(ms: unknown): string | null {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The numeric id at the end of a URN (`urn:li:sponsoredCampaign:7` -> `7`), or null. */
export function idFromUrn(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const last = value.slice(value.lastIndexOf(':') + 1);
  return last || null;
}

export function money(value: unknown): Money | null {
  if (!value || typeof value !== 'object') return null;
  const m = value as Record<string, unknown>;
  if (m.amount === undefined || typeof m.currencyCode !== 'string') return null;
  return { amount: String(m.amount), currencyCode: m.currencyCode };
}

/** Fails with a message naming what to shrink when a result would be truncated. */
export function ensureSize<T>(result: T, shrink: string): T {
  const size = JSON.stringify(result).length;
  if (size > MAX_RESULT_CHARS) {
    throw new Error(
      `[RESULT_TOO_LARGE] The result is ${size} characters, above the ${MAX_RESULT_CHARS} limit. ${shrink}`,
    );
  }
  return result;
}
