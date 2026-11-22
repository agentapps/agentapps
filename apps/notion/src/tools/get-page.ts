import type { AgentApp } from '@agentapps/sdk';
import { getNotionClient } from '../lib/notion-client.js';
import { PAGE_DETAIL_FIELDS } from './_fields.js';
import { extractPageShape, resolveNotionId } from './_notion-helpers.js';
import { resolveFields, wrapNotionCall } from './utils.js';

export function registerGetPageTool(app: AgentApp): void {
  app.tool('get-page', {
    description:
      'Retrieve a page. Returns curated { id, url, title, icon, cover, properties, createdTime, lastEditedTime, parentType, parentId, archived }. Params: pageId, fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Page UUID (with or without dashes).',
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Notion page object. Default false.',
        },
      },
      required: ['pageId'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
      version: '1.1.0',
      stability: 'stable',
    },
    handler: async (args: any, ctx) => {
      const client = await getNotionClient(ctx);
      const {
        pageId: rawPageId,
        fields,
        includeRaw,
      } = args as {
        pageId: string;
        fields?: string[];
        includeRaw?: boolean;
      };
      const pageId = resolveNotionId(rawPageId, 'pageId');

      const raw: any = await wrapNotionCall(() => client.pages.retrieve({ page_id: pageId }));
      const shape = extractPageShape(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: PAGE_DETAIL_FIELDS,
      });
    },
  });
}
