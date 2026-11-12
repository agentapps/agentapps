import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * delete-draft — Delete a draft email by its draft ID. IRREVERSIBLE.
 */
export function registerDeleteDraftTool(app: AgentApp): void {
  app.tool('delete-draft', {
    description: 'Delete a draft email by its draft ID.',
    parameters: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'The ID of the draft to delete' },
      },
      required: ['draftId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const draftId = (args as Record<string, unknown>).draftId as string;
      await gmail.users.drafts.delete({ userId: 'me', id: draftId });

      return { success: true, account: email, draftId, message: 'Draft deleted successfully' };
    },
  });
}
