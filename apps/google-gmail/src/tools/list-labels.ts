import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * list-labels — List all Gmail labels (both system and custom labels).
 */
export function registerListLabelsTool(app: AgentApp): void {
  app.tool('list-labels', {
    description: 'List all Gmail labels (both system and custom labels) for the account.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const response = await gmail.users.labels.list({ userId: 'me' });
      const labels = response.data.labels || [];

      return {
        account: email,
        count: labels.length,
        labels: labels.map((l: any) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          messageListVisibility: l.messageListVisibility,
          labelListVisibility: l.labelListVisibility,
          color: l.color,
        })),
      };
    },
  });
}
