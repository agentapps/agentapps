/**
 * Argument validation shared by the tools.
 *
 * JSON Schema is advisory in this stack (nothing validates arguments at runtime), so every
 * handler checks its arguments again here. The `agentapps` CLI turns number-like values into
 * numbers, so ID-like parameters accept numbers too and are converted with `String()`.
 */

export type Args = Record<string, unknown>;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY = /^[A-Z]{2}$/;

export function bad(message: string): Error {
  return new Error(`[BAD_REQUEST] ${message}`);
}

/** A string or number argument as a trimmed string; undefined when absent or empty. */
export function idLike(args: Args, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw bad(
        `${key} ${value} lost precision as a number. Pass it as a string inside a JSON object, e.g. '{"${key}":"..."}'.`,
      );
    }
    return String(value);
  }
  if (typeof value === 'string') return value.trim() || undefined;
  throw bad(`${key} must be a string; got ${JSON.stringify(value)}.`);
}

export function videoId(args: Args, key = 'videoId'): string {
  const id = idLike(args, key);
  if (!id) throw bad(`${key} is required (an 11-character YouTube video id such as dQw4w9WgXcQ).`);
  if (!VIDEO_ID.test(id)) {
    throw bad(`${key} must be an 11-character YouTube video id; got ${JSON.stringify(id)}.`);
  }
  return id;
}

/** A list of video ids, from an array or a comma-separated string. */
export function videoIds(args: Args, key: string, max: number): string[] {
  const raw = args[key];
  const parts = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [raw])
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
    .map((v) => String(v).trim());
  if (parts.length === 0) throw bad(`${key} is required: one or more YouTube video ids.`);
  if (parts.length > max) throw bad(`${key} accepts at most ${max} ids; got ${parts.length}.`);
  for (const id of parts) {
    if (!VIDEO_ID.test(id)) {
      throw bad(`${key} must hold 11-character YouTube video ids; got ${JSON.stringify(id)}.`);
    }
  }
  return [...new Set(parts)];
}

/** An optional channel id (UC...); undefined means the connected account's own channel. */
export function channelId(args: Args, key = 'channelId'): string | undefined {
  const id = idLike(args, key);
  if (id === undefined || id.toUpperCase() === 'MINE') return undefined;
  if (!CHANNEL_ID.test(id)) {
    throw bad(
      `${key} must be a channel id starting with UC (24 characters); got ${JSON.stringify(id)}.`,
    );
  }
  return id;
}

export function playlistId(args: Args, key = 'playlistId'): string {
  const id = idLike(args, key);
  if (!id) throw bad(`${key} is required.`);
  if (!PLAYLIST_ID.test(id)) {
    throw bad(
      `${key} must be a YouTube playlist id (letters, digits, "-", "_"); got ${JSON.stringify(id)}.`,
    );
  }
  return id;
}

export function optionalString(args: Args, key: string, maxLength = 200): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw bad(`${key} must be a string; got ${JSON.stringify(value)}.`);
  }
  const text = String(value).trim();
  if (text.length > maxLength) throw bad(`${key} is longer than ${maxLength} characters.`);
  return text || undefined;
}

export function oneOf<T extends string>(
  args: Args,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = args[key];
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw bad(`${key} must be one of ${allowed.join(', ')}; got ${JSON.stringify(value)}.`);
}

export function optionalOneOf<T extends string>(
  args: Args,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === '') return undefined;
  return oneOf(args, key, allowed, allowed[0]);
}

export function intInRange(
  args: Args,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = args[key];
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw bad(`${key} must be an integer from ${min} to ${max}; got ${JSON.stringify(value)}.`);
  }
  return n;
}

/** An ISO 3166-1 alpha-2 country code, upper-cased. */
export function country(args: Args, key = 'country'): string | undefined {
  const value = optionalString(args, key, 20);
  if (value === undefined) return undefined;
  const code = value.toUpperCase();
  if (!COUNTRY.test(code)) {
    throw bad(
      `${key} must be a two-letter ISO 3166-1 country code such as US or ES; got ${JSON.stringify(value)}.`,
    );
  }
  return code;
}

/** Metric names: an array or a comma-separated string of camelCase API names. */
export function metricList(args: Args, key: string, fallback: string[]): string[] {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parts = (Array.isArray(raw) ? raw : String(raw).split(','))
    .map((v) => String(v).trim())
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length > 20) throw bad(`${key} accepts at most 20 metrics.`);
  for (const name of parts) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
      throw bad(
        `${key} holds an invalid metric name ${JSON.stringify(name)}; use API names such as views or estimatedMinutesWatched.`,
      );
    }
  }
  return [...new Set(parts)];
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}

/** Default report window: the last 28 days, ending today (YouTube Studio's default). */
export const DEFAULT_RANGE_DAYS = 28;

/**
 * Reads startDate and endDate (YYYY-MM-DD). Both default: endDate to today (UTC) and
 * startDate to 27 days before endDate.
 */
export function dateRange(args: Args, now = new Date()): { startDate: string; endDate: string } {
  const endRaw = optionalString(args, 'endDate', 10);
  const startRaw = optionalString(args, 'startDate', 10);
  const endDate = endRaw ?? isoDay(now);
  if (!isRealDate(endDate))
    throw bad(`endDate must be a date in YYYY-MM-DD format; got ${JSON.stringify(endRaw)}.`);
  const startDate =
    startRaw ??
    isoDay(new Date(Date.parse(`${endDate}T00:00:00Z`) - (DEFAULT_RANGE_DAYS - 1) * 86_400_000));
  if (!isRealDate(startDate)) {
    throw bad(`startDate must be a date in YYYY-MM-DD format; got ${JSON.stringify(startRaw)}.`);
  }
  if (startDate > endDate) throw bad(`startDate ${startDate} is after endDate ${endDate}.`);
  if (startDate < '2005-02-14') throw bad('startDate is before YouTube existed (2005-02-14).');
  return { startDate, endDate };
}

/** The month dimension needs both dates on the first day of their month. */
export function toMonthRange(range: { startDate: string; endDate: string }): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: `${range.startDate.slice(0, 7)}-01`,
    endDate: `${range.endDate.slice(0, 7)}-01`,
  };
}
