import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatMessage } from '../lib/index.js';

/**
 * list-messages — GET /me/mailFolders/{folderId}/messages.
 */
export function registerListMessagesTool(app: AgentApp): void {
  app.tool('list-messages', {
    description:
      'List email messages from inbox or a specific folder. Supports filtering by unread, importance, etc.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 10, max: 100)',
        },
        folderId: {
          type: 'string',
          description:
            'Mail folder ID or well-known name (e.g., "Inbox", "SentItems", "Drafts", "DeletedItems", "Archive"). Defaults to Inbox.',
        },
        filter: {
          type: 'string',
          description:
            'OData $filter expression (e.g., "isRead eq false", "importance eq \'high\'")',
        },
      },
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
      const maxResults = Math.min((a.maxResults as number) || 10, 100);
      const folderId = (a.folderId as string) || 'Inbox';
      const filter = a.filter as string | undefined;

      let path = `/me/mailFolders/${folderId}/messages?$top=${maxResults}&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,isDraft,importance,hasAttachments,categories,parentFolderId`;

      if (filter) {
        path += `&$filter=${encodeURIComponent(filter)}`;
      }

      const response = await graphRequest('GET', path);
      const messages = (response.value || []).map((msg: any) => formatMessage(msg));

      return { account: email, count: messages.length, messages };
    },
  });
}
