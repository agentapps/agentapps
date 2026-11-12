import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * delete-filter — Delete a Gmail filter by its ID. IRREVERSIBLE.
 */
export function registerDeleteFilterTool(app: AgentApp): void {
  app.tool('delete-filter', {
    description: 'Delete a Gmail filter by its ID.',
    parameters: {
      type: 'object',
      properties: {
        filterId: { type: 'string', description: 'ID of the filter to delete' },
      },
      required: ['filterId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const filterId = (args as Record<string, unknown>).filterId as string;
      await gmail.users.settings.filters.delete({ userId: 'me', id: filterId });

      return { success: true, account: email, filterId, message: 'Filter deleted successfully' };
    },
  });
}
