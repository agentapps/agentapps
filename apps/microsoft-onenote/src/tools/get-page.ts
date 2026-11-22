import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatPage, PAGE_EXPAND, requireId } from '../lib/index.js';

/** get-page — GET /me/onenote/pages/{id}. */
export function registerGetPageTool(app: AgentApp): void {
  app.tool('get-page', {
    description:
      'Get one OneNote page by id: its title, timestamps, position, and parent section. Use get-page-content to read the page body.',
    parameters: {
      type: 'object',
      properties: {
        pageId: {
          type: 'string',
          description: 'Page id, as returned by list-pages or search-pages.',
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
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const page = requireId(a, ['pageId'], 'the page id from list-pages or search-pages');

      const found = await graphRequest<Record<string, any>>(
        'GET',
        `/me/onenote/pages/${page.encoded}?$expand=${PAGE_EXPAND}`,
      );

      return { account: email, page: formatPage(found) };
    },
  });
}
