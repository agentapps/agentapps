import type { AgentApp } from '@agentapps/sdk';
import type { PlaudRecording } from '../lib/index.js';
import { getPlaudClient, mapRecording } from '../lib/index.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function registerListNotesTool(app: AgentApp): void {
  app.tool('list-notes', {
    description:
      'List PLAUD voice recordings. Returns metadata for each recording ordered by creation date (most recent first).',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: `Maximum number of recordings to return (default: ${DEFAULT_LIMIT}, max: ${MAX_LIMIT})`,
          default: DEFAULT_LIMIT,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const limit = Math.min(
        Math.max(1, (a.limit as number | undefined) ?? DEFAULT_LIMIT),
        MAX_LIMIT,
      );

      const client = await getPlaudClient(ctx);
      const raw = (await client.listRecordings({ page_size: limit })) as Record<string, unknown>;

      // Handle both array and wrapped response shapes
      const list: Record<string, unknown>[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any).data)
          ? (raw as any).data
          : Array.isArray((raw as any).list)
            ? (raw as any).list
            : [];

      const recordings: PlaudRecording[] = list
        .map((item) => mapRecording(item))
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        })
        .slice(0, limit);

      return {
        recordings,
        total: recordings.length,
      };
    },
  });
}
