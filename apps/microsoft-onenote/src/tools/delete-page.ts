import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, requireId } from '../lib/index.js';

/** delete-page — DELETE /me/onenote/pages/{id}. */
export function registerDeletePageTool(app: AgentApp): void {
  app.tool('delete-page', {
    description:
      'Delete a OneNote page. The page goes to the notebook recycle bin, but this cannot be undone from here.',
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
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      // A destructive tool never guesses its target (spec §3.4).
      const page = requireId(a, ['pageId'], 'the page id from list-pages or search-pages');

      await graphRequest('DELETE', `/me/onenote/pages/${page.encoded}`);

      return { success: true, account: email, pageId: page.id, deleted: true };
    },
  });
}
