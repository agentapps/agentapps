/**
 * Argument validation shared by the tools. JSON Schema is advisory in this stack, so every
 * handler checks its arguments again here.
 *
 * TikTok ids (advertiser, campaign, ad group, ad) are 16-19 digit numbers, most of them
 * above Number.MAX_SAFE_INTEGER. The agentapps CLI turns `id:1234...` into a JavaScript
 * number, which silently rounds such an id to a different one. So ids are accepted as
 * strings, and as numbers only while they are still exact.
 */

export type Args = Record<string, unknown>;

const ID_PATTERN = /^\d{1,20}$/;

export const ID_HINT =
  'TikTok ids are long numbers: pass them as strings, e.g. inside a JSON object ' +
  `('{"advertiserId":"7012345678901234567"}') or as JSON on stdin; the CLI's key:value ` +
  'form turns them into rounded numbers.';

export function badRequest(message: string): Error {
  return new Error(`[BAD_REQUEST] ${message}`);
}

/** One TikTok id: digits only, as a string. */
export function parseId(value: unknown, name: string): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw badRequest(`${name} ${value} is not an exact id (it was rounded). ${ID_HINT}`);
    }
    return String(value);
  }
  const id = typeof value === 'string' ? value.trim() : '';
  if (!ID_PATTERN.test(id)) {
    throw badRequest(
      `Specify ${name} as the numeric TikTok id (digits only); got ${JSON.stringify(value) ?? 'nothing'}.`,
    );
  }
  return id;
}

/** A non-empty list of ids, at most `max`. A single id is accepted as a list of one. */
export function parseIdList(value: unknown, name: string, max: number): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  if (list.length === 0) throw badRequest(`Specify ${name}: a list of 1 to ${max} ids.`);
  if (list.length > max) {
    throw badRequest(`${name} has ${list.length} ids; at most ${max} per call.`);
  }
  return [...new Set(list.map((v, i) => parseId(v, `${name}[${i}]`)))];
}

/** An optional list of ids (undefined when absent or empty). */
export function parseOptionalIdList(
  value: unknown,
  name: string,
  max: number,
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return parseIdList(value, name, max);
}

export function parseEnum<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) {
    return fallback;
  }
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  throw badRequest(
    `${name} must be one of ${allowed.join(', ')}; got ${JSON.stringify(value) ?? 'nothing'}.`,
  );
}

export function parseInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw badRequest(
      `${name} must be an integer from ${min} to ${max}; got ${JSON.stringify(value)}.`,
    );
  }
  return n;
}

export function parseOptionalString(
  value: unknown,
  name: string,
  maxLength = 200,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw badRequest(`${name} must be a string.`);
  }
  const s = String(value).trim();
  if (s.length > maxLength) throw badRequest(`${name} is longer than ${maxLength} characters.`);
  return s || undefined;
}
