import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * list-filters — List all Gmail filters for the account.
 */
export function registerListFiltersTool(app: AgentApp): void {
  app.tool('list-filters', {
    description: 'List all Gmail filters for the account.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const response = await gmail.users.settings.filters.list({ userId: 'me' });
      const filters = response.data.filter || [];

      return { success: true, account: email, count: filters.length, filters };
    },
  });
}
