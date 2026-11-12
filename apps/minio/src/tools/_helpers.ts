/**
 * Pure helpers for MinIO tools — stream collection and shared utilities.
 */

/**
 * Collect all items from an async iterable stream into an array.
 */
export async function streamToArray<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) {
    items.push(item);
  }
  return items;
}
