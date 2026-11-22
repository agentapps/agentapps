import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatNotebook, requireId } from '../lib/index.js';

/** get-notebook — GET /me/onenote/notebooks/{id}. */
export function registerGetNotebookTool(app: AgentApp): void {
  app.tool('get-notebook', {
    description: 'Get one OneNote notebook by id, with its name, sharing state, and web URL.',
    parameters: {
      type: 'object',
      properties: {
        notebookId: {
          type: 'string',
          description: 'Notebook id, as returned by list-notebooks.',
        },
      },
      required: ['notebookId'],
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
      const notebook = requireId(a, ['notebookId'], 'the notebook id from list-notebooks');

      const found = await graphRequest<Record<string, any>>(
        'GET',
        `/me/onenote/notebooks/${notebook.encoded}`,
      );

      return { account: email, notebook: formatNotebook(found) };
    },
  });
}
