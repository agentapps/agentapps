/**
 * Argument parsing shared by the tools. JSON Schema is advisory in this stack, so every
 * handler validates its arguments again here. Only values that pass these checks (digits,
 * enum members, ISO dates) are ever put into a GAQL query or a resource name.
 */

export type Args = Record<string, unknown>;

/** JSON Schema snippets reused by several tools. */
export const CUSTOMER_ID_SCHEMA = {
  type: ['string', 'number'],
  description:
    'Google Ads customer (account) ID, 10 digits, with or without dashes (123-456-7890 or 1234567890).',
} as const;

export const LOGIN_CUSTOMER_ID_SCHEMA = {
  type: ['string', 'number'],
  description:
    'Optional. Manager (MCC) account ID to access customerId through, sent as the login-customer-id header. Needed when the connected user reaches the account only via a manager account (list-client-accounts shows which).',
} as const;

export const DATE_PRESETS = [
  'TODAY',
  'YESTERDAY',
  'LAST_7_DAYS',
  'LAST_14_DAYS',
  'LAST_30_DAYS',
  'LAST_BUSINESS_WEEK',
  'LAST_WEEK_MON_SUN',
  'LAST_WEEK_SUN_SAT',
  'THIS_WEEK_MON_TODAY',
  'THIS_WEEK_SUN_TODAY',
  'THIS_MONTH',
  'LAST_MONTH',
] as const;

export const DATE_RANGE_SCHEMA = {
  dateRange: {
    type: 'string',
    enum: DATE_PRESETS,
    description:
      'Predefined date range in the account time zone (default LAST_30_DAYS). Ignored when startDate and endDate are given.',
  },
  startDate: {
    type: 'string',
    description: 'Custom range start, YYYY-MM-DD (inclusive). Use together with endDate.',
  },
  endDate: {
    type: 'string',
    description: 'Custom range end, YYYY-MM-DD (inclusive). Use together with startDate.',
  },
} as const;

export const VALIDATE_ONLY_SCHEMA = {
  type: 'boolean',
  description:
    'Default false. When true, Google validates the change without applying it (a dry run).',
} as const;

function bad(message: string): Error {
  return new Error(`[BAD_REQUEST] ${message}`);
}

/** Accepts a string or a number (the agentapps CLI turns number-like values into numbers). */
function digitsOf(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw bad(
        `${name} ${value} is not an exact positive integer. Pass large IDs as strings inside a JSON object argument, e.g. '{"${name}":"..."}'.`,
      );
    }
    return String(value);
  }
  if (typeof value === 'string') return value.trim();
  throw bad(`${name} must be a string or a number; got ${typeof value}.`);
}

/** A 10-digit customer ID, dashes removed. */
export function parseCustomerId(value: unknown, name = 'customerId'): string {
  const raw = digitsOf(value, name);
  if (raw === undefined) throw bad(`${name} is required (10-digit Google Ads customer ID).`);
  const id = raw.replace(/-/g, '');
  if (!/^\d{10}$/.test(id)) {
    throw bad(
      `${name} must be a 10-digit Google Ads customer ID such as 123-456-7890; got ${JSON.stringify(value)}.`,
    );
  }
  return id;
}

export function parseOptionalCustomerId(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return parseCustomerId(value, name);
}

/** A numeric entity ID (campaign, ad group, budget, criterion). */
export function parseId(value: unknown, name: string): string {
  const id = digitsOf(value, name);
  if (id === undefined) throw bad(`${name} is required.`);
  if (!/^\d{1,19}$/.test(id))
    throw bad(`${name} must be a numeric ID; got ${JSON.stringify(value)}.`);
  return id;
}

export function parseOptionalId(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return parseId(value, name);
}

export function parseInteger(
  value: unknown,
  name: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${name} must be an integer from ${min} to ${max}; got ${JSON.stringify(value)}.`);
  }
  return n;
}

export function parseEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).toUpperCase();
  if (!(allowed as readonly string[]).includes(v)) {
    throw bad(`${name} must be one of ${allowed.join(', ')}; got ${JSON.stringify(value)}.`);
  }
  return v as T;
}

export function parseBoolean(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw bad(`${name} must be true or false; got ${JSON.stringify(value)}.`);
}

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface DateRange {
  /** The GAQL condition, e.g. `segments.date DURING LAST_30_DAYS`. */
  condition: string;
  /** Echoed in results so the agent knows which period the numbers cover. */
  label: { preset: string } | { startDate: string; endDate: string };
}

export function parseDateRange(a: Args): DateRange {
  const start = a.startDate === undefined || a.startDate === '' ? undefined : String(a.startDate);
  const end = a.endDate === undefined || a.endDate === '' ? undefined : String(a.endDate);
  if (start !== undefined || end !== undefined) {
    if (start === undefined || end === undefined) {
      throw bad('Give both startDate and endDate (YYYY-MM-DD), or neither and use dateRange.');
    }
    if (!isRealDate(start) || !isRealDate(end)) {
      throw bad(`startDate and endDate must be dates as YYYY-MM-DD; got ${start} and ${end}.`);
    }
    if (start > end) throw bad(`startDate ${start} is after endDate ${end}.`);
    return {
      condition: `segments.date BETWEEN '${start}' AND '${end}'`,
      label: { startDate: start, endDate: end },
    };
  }
  const preset = parseEnum(a.dateRange, 'dateRange', DATE_PRESETS, 'LAST_30_DAYS');
  return { condition: `segments.date DURING ${preset}`, label: { preset } };
}
