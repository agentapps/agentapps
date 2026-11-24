/** Argument readers shared by the tools. JSON Schema is advisory, so handlers check again. */

export type Args = Record<string, unknown>;

/**
 * Reads a Metricool numeric id (a brand or a post). The agentapps CLI turns number-like
 * values into numbers, so both are accepted; anything that is not a positive integer is
 * rejected before it reaches a URL.
 */
export function readPositiveInt(value: unknown, name: string): number {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[1-9]\d{0,14}$/.test(text)) {
    throw new Error(
      `[BAD_REQUEST] Specify ${name} as a positive whole number; got ${JSON.stringify(value)}.`,
    );
  }
  return Number(text);
}

/** Reads the brand a call is about: Metricool's `blogId`. */
export function readBrandId(value: unknown): number {
  try {
    return readPositiveInt(value, 'brandId');
  } catch (err) {
    throw new Error(`${(err as Error).message} Get brand ids with list-brands.`);
  }
}

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** Reads a local date-time, `YYYY-MM-DDTHH:mm:ss`, with no offset: the timezone travels apart. */
export function readLocalDateTime(value: unknown, name: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = LOCAL_DATE_TIME.exec(text);
  const valid =
    match !== null &&
    // Round-trip through UTC rejects dates such as 2026-02-30 and hours such as 25.
    new Date(`${text}Z`).toISOString().slice(0, 19) === text;
  if (!valid) {
    throw new Error(
      `[BAD_REQUEST] Specify ${name} as a local date-time, YYYY-MM-DDTHH:mm:ss, such as 2026-12-01T09:00:00; got ${JSON.stringify(value)}. The timezone goes in its own argument.`,
    );
  }
  return text;
}

/** Reads an IANA timezone the runtime knows, such as Europe/Madrid. */
export function readTimezone(value: unknown): string {
  const zone = typeof value === 'string' ? value.trim() : '';
  let known = zone !== '';
  if (known) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
    } catch {
      known = false;
    }
  }
  if (!known) {
    throw new Error(
      `[BAD_REQUEST] Specify timezone as an IANA name such as Europe/Madrid; got ${JSON.stringify(value)}. list-brands gives the timezone of each brand.`,
    );
  }
  return zone;
}

/** The offset of `zone` at the instant `time`, in minutes east of UTC. */
function offsetMinutes(zone: string, time: number): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(new Date(time))
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  // "GMT" for UTC, otherwise "GMT+02:00" or "GMT-03:30".
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Turns a local date-time into ISO 8601 with the offset `zone` has at that date:
 * `2026-07-01T00:00:00` in Europe/Madrid becomes `2026-07-01T00:00:00+02:00`.
 *
 * @spec METRICOOL-REQ-9
 */
export function withOffset(local: string, zone: string): string {
  const asUtc = Date.parse(`${local}Z`);
  // The offset depends on the instant, which depends on the offset: a second pass settles
  // it on both sides of a daylight-saving change.
  const first = offsetMinutes(zone, asUtc);
  const minutes = offsetMinutes(zone, asUtc - first * 60_000);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Reads one value of a closed list, case-insensitively, and returns it as listed. */
export function readOneOf<T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const found = allowed.find((item) => item === text);
  if (!found) {
    throw new Error(
      `[BAD_REQUEST] Specify ${name} as one of ${allowed.join(', ')}; got ${JSON.stringify(value)}.`,
    );
  }
  return found;
}

/** Reads a required non-empty text argument. */
export function readText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[BAD_REQUEST] Specify ${name} as text; got ${JSON.stringify(value)}.`);
  }
  return value;
}
