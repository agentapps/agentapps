/**
 * Result shaping shared by the tools: Graph paging, the 50,000-character result budget
 * and number cleanup.
 */

/** The SDK truncates results above 50,000 characters; stay well under it. */
export const MAX_RESULT_CHARS = 45_000;

export interface GraphPage<T> {
  data?: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

export interface ListResult<T> {
  items: T[];
  count: number;
  /** Pass as `after` to get the next page. Absent on the last page. */
  nextCursor?: string;
  /** True when items were dropped to stay under the size budget. */
  limitApplied?: boolean;
  hint?: string;
}

/**
 * Builds a list result from one Graph page. If the items would push the result over the
 * size budget, the tail is dropped and the cursor removed (Graph cursors point past the
 * whole page, so they would skip the dropped items): the hint says to lower `limit`.
 */
export function listResult<T>(page: GraphPage<T>, items: T[]): ListResult<T> {
  const after = page.paging?.next ? page.paging.cursors?.after : undefined;
  const result: ListResult<T> = { items, count: items.length };
  if (after) result.nextCursor = after;
  if (JSON.stringify(result).length <= MAX_RESULT_CHARS) return result;

  const kept: T[] = [];
  let size = 200;
  for (const item of items) {
    const itemSize = JSON.stringify(item).length + 1;
    if (size + itemSize > MAX_RESULT_CHARS) break;
    kept.push(item);
    size += itemSize;
  }
  return {
    items: kept,
    count: kept.length,
    limitApplied: true,
    hint: `Only ${kept.length} of ${items.length} items fit in one result. Call again with limit:${Math.max(1, kept.length)} (or fewer fields) and page with the returned nextCursor.`,
  };
}

/** A numeric string from the API ("5000", "12.34") as a number; anything else unchanged. */
export function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** A budget in minor units; Meta sends "0" or nothing when the other level holds the budget. */
export function toBudget(value: unknown): number | undefined {
  return toNumber(value) || undefined;
}

/** Drops keys whose value is undefined, so results stay compact. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) if (obj[key] === undefined) delete obj[key];
  return obj;
}
