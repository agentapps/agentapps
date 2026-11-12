import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * list-drafts — List all draft emails in the account.
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
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const maxResults = Math.min((a.maxResults as number) || 10, 100);

      const response = await gmail.users.drafts.list({
        userId: 'me',
        maxResults,
      });

      const drafts = response.data.drafts || [];
      const detailedDrafts = await Promise.all(
        drafts.map(async (draft: any) => {
          const detail = await gmail.users.drafts.get({
            userId: 'me',
            id: draft.id,
            format: 'metadata',
          });

          const headers = detail.data.message?.payload?.headers || [];
          return {
            draftId: draft.id,
            messageId: draft.message?.id,
            threadId: draft.message?.threadId,
            from: headers.find((h: any) => h.name === 'From')?.value,
            to: headers.find((h: any) => h.name === 'To')?.value,
            subject: headers.find((h: any) => h.name === 'Subject')?.value,
            date: headers.find((h: any) => h.name === 'Date')?.value,
            snippet: detail.data.message?.snippet,
          };
        }),
      );

      return { account: email, count: detailedDrafts.length, drafts: detailedDrafts };
    },
  });
}
