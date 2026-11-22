import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient } from '../lib/index.js';

/**
 * list-rules — GET /me/mailFolders/Inbox/messageRules.
 */
export function registerListRulesTool(app: AgentApp): void {
  app.tool('list-rules', {
    description: 'List all inbox rules (mail filters) for the account.',
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
      const { graphRequest, email } = await createGraphClient(ctx);

      const response = await graphRequest('GET', '/me/mailFolders/Inbox/messageRules');

      return { account: email, count: (response.value || []).length, rules: response.value || [] };
    },
  });
}
