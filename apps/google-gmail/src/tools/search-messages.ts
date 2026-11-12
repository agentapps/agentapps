import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * search-messages — Search for email messages using Gmail's search syntax.
 */
export function registerSearchMessagesTool(app: AgentApp): void {
  app.tool('search-messages', {
    description: "Search for email messages using Gmail's search syntax.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query' },
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
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const query = a.query as string;
      const maxResults = Math.min((a.maxResults as number) || 10, 100);

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
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
          };
        }),
      );

      return { account: email, query, count: detailedMessages.length, messages: detailedMessages };
    },
  });
}
