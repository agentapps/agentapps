import type { AgentApp } from '@agentapps/sdk';
import { assertDisplayName, createGraphClient, formatNotebook } from '../lib/index.js';

/** create-notebook — POST /me/onenote/notebooks. */
export function registerCreateNotebookTool(app: AgentApp): void {
  app.tool('create-notebook', {
    description:
      'Create a new OneNote notebook. Names may not contain ? * \\ / : < > | \' " # and are limited to 50 characters.',
    parameters: {
      type: 'object',
      properties: {
        displayName: {
          type: 'string',
          description: 'Notebook name. Max 50 characters; ? * \\ / : < > | \' " # are not allowed.',
        },
      },
      required: ['displayName'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      // Validate before the request: OneNote answers a bad name with an opaque
      // error code, and this POST is not retried, so a clear message here is
      // the agent's only actionable signal.
      const displayName = assertDisplayName(a.displayName, 'notebook name');

      const created = await graphRequest<Record<string, any>>('POST', '/me/onenote/notebooks', {
        displayName,
      });

      return { success: true, account: email, notebook: formatNotebook(created) };
    },
  });
}
