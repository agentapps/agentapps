/**
 * Argument parsing shared by the tools. JSON Schema is advisory in this stack, so every
 * handler validates its arguments again here before anything reaches a URL or a form.
 *
 * The agentapps CLI turns number-like values into numbers. Meta ids for campaigns, ad sets
 * and ads have 15-18 digits, above Number.MAX_SAFE_INTEGER, so a number that large has
 * already been rounded: it is rejected with a message that says how to keep it a string.
 */

export type Args = Record<string, unknown>;

export const asArgs = (args: unknown): Args => (args ?? {}) as Args;

function bad(message: string): Error {
  return new Error(`[BAD_REQUEST] ${message}`);
}

/** A numeric Graph id (campaign, ad set, ad, creative), as a digit string. */
export function readId(a: Args, key: string, opts: { required: true }): string;
export function readId(a: Args, key: string, opts?: { required?: boolean }): string | undefined;
export function readId(a: Args, key: string, opts: { required?: boolean } = {}) {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) throw bad(`${key} is required: the numeric Meta id.`);
    return undefined;
  }
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw) || raw <= 0) {
      throw bad(
        `${key} ${raw} is too large to pass as a number: Meta ids have up to 18 digits and the CLI rounds them. Pass the arguments as one JSON object instead, e.g. '{"${key}":"120210000000000000"}'.`,
      );
    }
    return String(raw);
  }
  if (typeof raw === 'string' && /^\d{1,25}$/.test(raw.trim())) return raw.trim();
  throw bad(`${key} must be a numeric Meta id (digits only); got ${JSON.stringify(raw)}.`);
}

/** An ad account id, accepted as `act_123`, `123` or 123; returned as `act_123`. */
export function readAccountId(a: Args, key = 'accountId', required = true): string | undefined {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) {
      throw bad(`${key} is required: the ad account id (act_<digits>). Use list-ad-accounts.`);
    }
    return undefined;
  }
  const value = typeof raw === 'string' ? raw.trim().replace(/^act_/, '') : raw;
  const id = readId({ [key]: value }, key, { required: true });
  return `act_${id}`;
}

export function readString(a: Args, key: string, opts: { required: true; max?: number }): string;
export function readString(
  a: Args,
  key: string,
  opts?: { required?: boolean; max?: number },
): string | undefined;
export function readString(a: Args, key: string, opts: { required?: boolean; max?: number } = {}) {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) throw bad(`${key} is required.`);
    return undefined;
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw bad(`${key} must be a string; got ${JSON.stringify(raw)}.`);
  }
  const value = String(raw).trim();
  if (opts.max !== undefined && value.length > opts.max) {
    throw bad(`${key} is longer than ${opts.max} characters.`);
  }
  if (opts.required && value === '') throw bad(`${key} is required.`);
  return value;
}

export function readEnum<T extends string>(
  a: Args,
  key: string,
  allowed: readonly T[],
  fallback?: T,
): T | undefined {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = String(raw).trim();
  const match = allowed.find((v) => v.toLowerCase() === value.toLowerCase());
  if (!match) throw bad(`${key} must be one of ${allowed.join(', ')}; got ${JSON.stringify(raw)}.`);
  return match;
}

export function readInt(
  a: Args,
  key: string,
  opts: { min: number; max: number; fallback?: number },
): number | undefined {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') return opts.fallback;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(value) || value < opts.min || value > opts.max) {
    throw bad(
      `${key} must be an integer from ${opts.min} to ${opts.max}; got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

export function readBoolean(a: Args, key: string, fallback: boolean): boolean {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw bad(`${key} must be true or false; got ${JSON.stringify(raw)}.`);
}

/** A list given as an array or a comma-separated string; each item must match `pattern`. */
export function readList(
  a: Args,
  key: string,
  opts: { pattern: RegExp; max: number; describe: string },
): string[] | undefined {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const items = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((v) => String(v).trim())
    .filter((v) => v !== '');
  if (items.length === 0) return undefined;
  if (items.length > opts.max) throw bad(`${key} accepts at most ${opts.max} items.`);
  for (const item of items) {
    if (!opts.pattern.test(item)) {
      throw bad(`${key} item ${JSON.stringify(item)} is not ${opts.describe}.`);
    }
  }
  return items;
}

/** A JSON object given as an object or a JSON string. */
export function readObject(
  a: Args,
  key: string,
  required = false,
): Record<string, unknown> | undefined {
  let raw = a[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw bad(`${key} is required (a JSON object).`);
    return undefined;
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      throw bad(`${key} must be a JSON object; the string given is not valid JSON.`);
    }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw bad(`${key} must be a JSON object.`);
  }
  return raw as Record<string, unknown>;
}

/** A calendar date YYYY-MM-DD that exists. */
export function readDate(a: Args, key: string): string | undefined {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = String(raw).trim();
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw bad(`${key} must be a date as YYYY-MM-DD; got ${JSON.stringify(raw)}.`);
  }
  return value;
}

/** A budget in the account currency's minor units (cents), as a positive integer. */
export function readBudget(a: Args, key: string): number | undefined {
  const raw = a[key];
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw bad(
      `${key} must be a positive integer in the account currency's minor units (cents: 5000 = 50.00); got ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}
