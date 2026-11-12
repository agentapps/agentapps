import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatNotebook } from '../lib/index.js';

/** list-notebooks — GET /me/onenote/notebooks. */
export function registerListNotebooksTool(app: AgentApp): void {
  app.tool('list-notebooks', {
    description:
      'List every OneNote notebook the signed-in account can open, including shared ones.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        '/me/onenote/notebooks?$orderby=displayName',
      );
      const notebooks = (response.value || []).map((n) => formatNotebook(n));

      return { account: email, count: notebooks.length, notebooks };
    },
  });
}
