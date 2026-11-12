import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatMessage } from '../lib/index.js';

/**
 * search-messages — GET /me/messages?$search=...
 */
export function registerSearchMessagesTool(app: AgentApp): void {
  app.tool('search-messages', {
    description: 'Search for email messages. Supports searching by subject, body, sender, etc.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query text (searches subject, body, sender, etc.)',
        },
        maxResults: { type: 'number', description: 'Maximum number of results (default: 10)' },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = args as Record<string, unknown>;
      const query = a.query as string;
      const maxResults = Math.min((a.maxResults as number) || 10, 100);

      const path = `/me/messages?$search="${encodeURIComponent(query)}"&$top=${maxResults}&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,isDraft,importance,hasAttachments,categories,parentFolderId`;

      const response = await graphRequest('GET', path);
      const messages = (response.value || []).map((msg: any) => formatMessage(msg));

      return { account: email, query, count: messages.length, messages };
    },
  });
}
