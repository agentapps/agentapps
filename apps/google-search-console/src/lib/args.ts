/**
 * Argument parsing shared by the tools. JSON Schema is advisory in this stack (nothing
 * validates arguments at runtime), so every handler re-checks its input here before any
 * value reaches a URL or a request body.
 */

export type Args = Record<string, unknown>;

export const bad = (message: string) => new Error(`[BAD_REQUEST] ${message}`);

/** Largest result the tools build; the SDK truncates anything over 50,000 characters. */
export const MAX_RESULT_CHARS = 45_000;

/** Search Console keeps about 16 months of data. */
export const MAX_RANGE_DAYS = 500;

const SITE_URL_HELP =
  'Pass siteUrl exactly as list-sites returns it: "sc-domain:example.com" for a Domain ' +
  'property or "https://www.example.com/" (with the trailing slash) for a URL-prefix property.';

/**
 * A Search Console property: `sc-domain:<host>` or an http(s) URL prefix. A bare origin
 * without the trailing slash gets one, because that is how Search Console stores it.
 */
export function parseSiteUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw bad(`siteUrl is required. ${SITE_URL_HELP}`);
  const raw = value.trim();
  const domain = /^sc-domain:(.+)$/i.exec(raw);
  if (domain) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain[1])) {
      throw bad(`siteUrl "${raw}" is not a valid Domain property. ${SITE_URL_HELP}`);
    }
    return `sc-domain:${domain[1]}`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad(`siteUrl "${raw}" is not a URL. ${SITE_URL_HELP}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw bad(`siteUrl "${raw}" must start with http:// or https://. ${SITE_URL_HELP}`);
  }
  if (url.search || url.hash)
    throw bad(`siteUrl "${raw}" must not contain ? or #. ${SITE_URL_HELP}`);
  return url.pathname === '/' && !raw.endsWith('/') ? `${raw}/` : raw;
}

/** The API path of one property; the property URL is a single encoded path segment. */
export const sitePath = (siteUrl: string) => `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`;

/** An absolute http(s) URL (a sitemap or a page to inspect). */
export function parseHttpUrl(name: string, value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw bad(`${name} is required (an absolute URL).`);
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad(`${name} "${raw}" is not an absolute URL such as https://www.example.com/page.`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw bad(`${name} "${raw}" must start with http:// or https://.`);
  }
  return raw;
}

export function optionalString(name: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') throw bad(`${name} must be a string.`);
  return value.trim() || undefined;
}

export function parseEnum<T extends string>(
  name: string,
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T;
export function parseEnum<T extends string>(
  name: string,
  value: unknown,
  allowed: readonly T[],
): T | undefined;
export function parseEnum<T extends string>(
  name: string,
  value: unknown,
  allowed: readonly T[],
  fallback?: T,
): T | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw bad(`${name} must be one of ${allowed.join(', ')}; got ${JSON.stringify(value)}.`);
  }
  return value as T;
}

/** An integer in [min, max]; number-like strings are accepted (the CLI may send either). */
export function parseInteger(
  name: string,
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${name} must be an integer from ${min} to ${max}; got ${JSON.stringify(value)}.`);
  }
  return n;
}

const DAY_MS = 86_400_000;

function parseDate(name: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = typeof value === 'string' ? value.trim() : '';
  const time = /^\d{4}-\d{2}-\d{2}$/.test(text) ? Date.parse(`${text}T00:00:00Z`) : Number.NaN;
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== text) {
    throw bad(`${name} must be a date as YYYY-MM-DD; got ${JSON.stringify(value)}.`);
  }
  return text;
}

const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Days between two YYYY-MM-DD dates, both included. */
export const daysBetween = (start: string, end: string) => (toMs(end) - toMs(start)) / DAY_MS + 1;

export const shiftDate = (date: string, days: number) => toDate(toMs(date) + days * DAY_MS);

/**
 * Today in Search Console's time zone (America/Los_Angeles) minus 3 days: the most
 * recent day whose data is normally final. `now` is injectable for tests.
 */
export function defaultEndDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return shiftDate(parts, -3);
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Resolves `startDate` / `endDate` / `days` into a range: explicit dates win; otherwise
 * the range is the `days` (default `defaultDays`) ending at `endDate` or at the latest
 * final day.
 */
export function parseDateRange(a: Args, defaultDays: number): DateRange {
  const start = parseDate('startDate', a.startDate);
  const endDate = parseDate('endDate', a.endDate) ?? defaultEndDate();
  const days = parseInteger('days', a.days, 1, MAX_RANGE_DAYS, defaultDays);
  const startDate = start ?? shiftDate(endDate, -(days - 1));
  if (startDate > endDate) throw bad(`startDate ${startDate} is after endDate ${endDate}.`);
  if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) {
    throw bad(`The range ${startDate}..${endDate} is longer than ${MAX_RANGE_DAYS} days.`);
  }
  return { startDate, endDate };
}
