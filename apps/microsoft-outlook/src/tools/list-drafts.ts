import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatMessage } from '../lib/index.js';

/**
 * list-drafts — GET /me/mailFolders/Drafts/messages.
 */
export function registerListDraftsTool(app: AgentApp): void {
  app.tool('list-drafts', {
    description: 'List all draft emails in the account.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of drafts to return (default: 10, max: 100)',
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

      const response = await graphRequest(
        'GET',
        `/me/mailFolders/Drafts/messages?$top=${maxResults}&$orderby=createdDateTime desc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,createdDateTime,bodyPreview,isRead,isDraft,importance,hasAttachments,categories,parentFolderId`,
      );
      const drafts = (response.value || []).map((msg: any) => formatMessage(msg));

      return { account: email, count: drafts.length, drafts };
    },
  });
}
