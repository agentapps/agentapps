import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatMessage } from '../lib/index.js';

/**
 * get-message — GET /me/messages/{messageId}.
 */
export function registerGetMessageTool(app: AgentApp): void {
  app.tool('get-message', {
    description:
      'Get full details of a specific email message by ID, including body and attachments.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The ID of the message to retrieve' },
      },
      required: ['messageId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const messageId = (args as Record<string, unknown>).messageId as string;
      const message = await graphRequest(
        'GET',
        `/me/messages/${messageId}?$expand=attachments($select=id,name,contentType,size,isInline)`,
      );

      return { account: email, ...formatMessage(message, true) };
    },
  });
}
