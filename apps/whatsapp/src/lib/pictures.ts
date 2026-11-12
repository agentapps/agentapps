/**
 * Profile picture enrichment helper for whatsapp agent app tools.
 *
 * Fetches profilePictureURL for a list of items that have a chatId/contactId
 * field, attaching the result as `picture`. Runs in parallel, best-effort --
 * failures are silently ignored and the item is returned unchanged.
 *
 * Only enriches IDs in @c.us or @g.us format (phone/group JIDs).
 * @lid internal IDs are skipped -- WAHA cannot resolve pictures for them.
 */

import type { SecretsContext } from './api.js';
import { wahaFetch } from './api.js';

/**
 * Fetch profile picture URL for a single JID. Returns null on failure.
 */
async function fetchPicture(
  ctx: SecretsContext,
  contactId: string,
  session: string,
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ contactId, session });
    const res = await wahaFetch(ctx, `/contacts/profile-picture?${params}`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.profilePictureURL ?? data?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Enrich an array of objects with a `picture` field.
 *
 * @param ctx     Secrets context for WAHA API access
 * @param items   Array of objects to enrich
 * @param getId   Function to extract the JID from each item
 * @param session WAHA session name
 */
export async function enrichWithPictures<T extends Record<string, unknown>>(
  ctx: SecretsContext,
  items: T[],
  getId: (item: T) => string | undefined,
  session: string,
): Promise<T[]> {
  const results = await Promise.allSettled(
    items.map(async (item) => {
      const id = getId(item);
      // Only @c.us (individual) and @g.us (group) IDs are resolvable
      if (!id || (!id.endsWith('@c.us') && !id.endsWith('@g.us'))) return item;
      const picture = await fetchPicture(ctx, id, session);
      return picture ? ({ ...item, picture } as T) : item;
    }),
  );

  return results.map((r, i) => (r.status === 'fulfilled' ? r.value : items[i]));
}
