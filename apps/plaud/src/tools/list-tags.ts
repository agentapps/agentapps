import type { AgentApp } from '@agentapps/sdk';
import type { PlaudTag } from '../lib/index.js';
import { getPlaudClient, mapTag } from '../lib/index.js';

export function registerListTagsTool(app: AgentApp): void {
  app.tool('list-tags', {
    description:
      'List all tags and folders in your PLAUD library. Each tag includes its ID, name, and recording count if available.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const client = await getPlaudClient(ctx);
      const raw = (await client.listTags()) as Record<string, unknown>;

      const list: Record<string, unknown>[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any).data)
          ? (raw as any).data
          : Array.isArray((raw as any).list)
            ? (raw as any).list
            : [];

      const tags: PlaudTag[] = list.map((item) => mapTag(item));

      return { tags };
    },
  });
}
