import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * delete-label — Delete a Gmail label. IRREVERSIBLE.
 */
export function registerDeleteLabelTool(app: AgentApp): void {
  app.tool('delete-label', {
    description: 'Delete a Gmail label. This does NOT delete the emails with this label.',
    parameters: {
      type: 'object',
      properties: {
        labelId: { type: 'string', description: 'ID of the label to delete' },
      },
      required: ['labelId'],
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

      const labelId = (args as Record<string, unknown>).labelId as string;
      await gmail.users.labels.delete({ userId: 'me', id: labelId });

      return { success: true, account: email, labelId, message: 'Label deleted successfully' };
    },
  });
}
