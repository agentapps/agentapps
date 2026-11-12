import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * create-filter — Create a new Gmail filter to automatically organize emails.
 */
export function registerCreateFilterTool(app: AgentApp): void {
  app.tool('create-filter', {
    description: 'Create a new Gmail filter to automatically organize emails.',
    parameters: {
      type: 'object',
      properties: {
        criteria: {
          type: 'object',
          description: 'Filter criteria',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            subject: { type: 'string' },
            query: { type: 'string' },
            hasAttachment: { type: 'boolean' },
            excludeChats: { type: 'boolean' },
          },
        },
        action: {
          type: 'object',
          description: 'Actions to perform when filter matches',
          properties: {
            addLabelIds: { type: 'array', items: { type: 'string' } },
            removeLabelIds: { type: 'array', items: { type: 'string' } },
            forward: { type: 'string' },
          },
        },
      },
      required: ['criteria', 'action'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const criteria = a.criteria as any;
      const action = a.action as any;

      const response = await gmail.users.settings.filters.create({
        userId: 'me',
        requestBody: { criteria, action },
      });

      return { success: true, account: email, filter: response.data };
    },
  });
}
