/** Results stay under the SDK's 50,000-character limit. */
export const MAX_RESULT_CHARS = 45_000;

/**
 * Keeps the leading items that fit in `MAX_RESULT_CHARS`. When some are left out the
 * answer says so, so the agent narrows the range instead of trusting a partial list.
 */
export function capItems<T>(
  all: T[],
  what: string,
): { items: T[]; limitApplied?: true; message?: string } {
  const items: T[] = [];
  let size = 0;
  for (const item of all) {
    size += JSON.stringify(item).length + 1;
    if (size > MAX_RESULT_CHARS) {
      return {
        items,
        limitApplied: true,
        message: `Showing ${items.length} of ${all.length} ${what}. Narrow the date range to see the rest.`,
      };
    }
    items.push(item);
  }
  return { items };
}
