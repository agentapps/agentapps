import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { BLOCK_COMPACT_FIELDS } from './_fields.js';
import { extractBlockShape, validateUuid } from './_notion-helpers.js';
import { resolveFields, wrapNotionWrite } from './utils.js';

export function registerDeleteBlockTool(app: AgentApp): void {
  app.tool('delete-block', {
    description:
      'Delete (archive) a block. Returns the curated archived block { id, type, archived, lastEditedTime }. Idempotent — retries are safe.',
    parameters: {
      type: 'object',
      properties: {
        blockId: {
          type: 'string',
          description: 'Block UUID.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Notion block. Default false.',
        },
      },
      required: ['blockId'],
    },
    annotations: { sensitive: true, readOnlyHint: false, version: '1.1.0', stability: 'stable' },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const { blockId, fields, includeRaw } = args as {
        blockId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      validateUuid(blockId, 'blockId');

      const raw: any = await wrapNotionWrite(() => client.blocks.delete({ block_id: blockId }));
      const shape = extractBlockShape(raw);
      return {
        block: resolveFields(shape as any, raw, {
          includeRaw,
          fields,
          defaultFields: BLOCK_COMPACT_FIELDS,
        }),
        deleted: true,
      };
    },
  });
}
