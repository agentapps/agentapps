import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * list-messages — List email messages from inbox or specific labels.
 */
export function registerListMessagesTool(app: AgentApp): void {
  app.tool('list-messages', {
    description:
      'List email messages from inbox or specific labels. Supports filtering by unread, starred, etc.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 10, max: 100)',
        },
        labelIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Label IDs to filter by',
        },
        query: {
          type: 'string',
          description: 'Gmail search query',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const maxResults = Math.min((a.maxResults as number) || 10, 100);
      const labelIds = (a.labelIds as string[]) || ['INBOX'];
      const query = a.query as string | undefined;

      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
        labelIds,
        q: query,
      });

      const messages = response.data.messages || [];
      const detailedMessages = await Promise.all(
        messages.map(async (msg: any) => {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });

          const headers = detail.data.payload?.headers || [];
          return {
            id: msg.id,
            threadId: msg.threadId,
            from: headers.find((h: any) => h.name === 'From')?.value,
            to: headers.find((h: any) => h.name === 'To')?.value,
            subject: headers.find((h: any) => h.name === 'Subject')?.value,
            date: headers.find((h: any) => h.name === 'Date')?.value,
            snippet: detail.data.snippet,
            labelIds: detail.data.labelIds,
          };
        }),
      );

      return { account: email, count: detailedMessages.length, messages: detailedMessages };
    },
  });
}
