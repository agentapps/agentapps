import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { BLOCK_COMPACT_FIELDS } from './_fields.js';
import { extractBlockShape, validateUuid } from './_notion-helpers.js';
import { resolveFieldsList, wrapNotionWrite } from './utils.js';

export function registerCreateColumnLayoutTool(app: AgentApp): void {
  app.tool('create-column-layout', {
    description:
      'Create a column_list with N columns on a page. `columns` is an array of arrays of Notion block objects (one inner array per column). Not retryable.',
    parameters: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Page UUID to append the column layout to.',
        },
        columns: {
          type: 'array',
          items: { type: 'object' },
          description: 'Array of arrays. Each inner array is the blocks for one column.',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the returned column_list blocks.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Notion blocks. Default false.',
        },
      },
      required: ['pageId', 'columns'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
      version: '1.1.0',
      stability: 'experimental',
    },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const { pageId, columns, fields, includeRaw } = args as {
        pageId: string;
        columns: any[][];
        fields?: string[];
        includeRaw?: boolean;
      };
      validateUuid(pageId, 'pageId');

      const columnBlocks = columns.map((columnContent) => ({
        object: 'block',
        type: 'column',
        column: { children: columnContent },
      }));
      const columnListBlock = {
        object: 'block',
        type: 'column_list',
        column_list: { children: columnBlocks },
      };

      const response: any = await wrapNotionWrite(() =>
        client.blocks.children.append({
          block_id: pageId,
          children: [columnListBlock] as any,
        }),
      );

      const shaped = response.results.map(extractBlockShape);
      const results = resolveFieldsList(shaped as any, response.results, {
        includeRaw,
        fields,
        defaultFields: BLOCK_COMPACT_FIELDS,
      });

      return {
        parentId: pageId,
        blocks: results,
        columnsCreated: columns.length,
      };
    },
  });
}
