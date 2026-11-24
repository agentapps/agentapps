/** Argument readers shared by the tools. JSON Schema is advisory, so handlers check again. */

export type Args = Record<string, unknown>;

/**
 * Reads an id that goes into a URL path. The agentapps CLI turns number-like values into
 * numbers, so both are accepted; anything that could change the path is rejected.
 */
export function readId(value: unknown, name: string): string {
  const id =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(
      `[BAD_REQUEST] Specify ${name} as letters, digits, "-" or "_"; got ${JSON.stringify(value)}.`,
    );
  }
  return id;
}

/** Reads an ISO 8601 date and returns it in UTC ISO format. */
export function readIsoDate(value: unknown, name: string): string {
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(time)) {
    throw new Error(
      `[BAD_REQUEST] Specify ${name} as an ISO 8601 date such as 2026-12-01T09:00:00Z; got ${JSON.stringify(value)}.`,
    );
  }
  return new Date(time).toISOString();
}

export const MAX_ANALYTICS_DAYS = 90;

/** Reads the look-back window of the analytics tools: a whole number of days, 1 to 90. */
export function readDays(value: unknown): number {
  const days = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (
    typeof days !== 'number' ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > MAX_ANALYTICS_DAYS
  ) {
    throw new Error(
      `[BAD_REQUEST] Specify days as a whole number from 1 to ${MAX_ANALYTICS_DAYS}; got ${JSON.stringify(value)}.`,
    );
  }
  return days;
}

/** Reads an optional page number: a whole number from `min` up, or `min` when absent. */
export function readPage(value: unknown, min: number): number {
  if (value === undefined || value === null) return min;
  const page = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < min) {
    throw new Error(
      `[BAD_REQUEST] Specify page as a whole number from ${min}; got ${JSON.stringify(value)}.`,
    );
  }
  return page;
}
