import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * update-label — Update an existing Gmail label (name, colors, visibility).
 */
export function registerUpdateLabelTool(app: AgentApp): void {
  app.tool('update-label', {
    description: 'Update an existing Gmail label (name, colors, visibility).',
    parameters: {
      type: 'object',
      properties: {
        labelId: { type: 'string', description: 'ID of the label to update' },
        name: { type: 'string', description: 'New name for the label' },
        backgroundColor: { type: 'string', description: 'Background color in hex format' },
        textColor: { type: 'string', description: 'Text color in hex format' },
      },
      required: ['labelId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const labelId = a.labelId as string;
      const labelName = a.name as string | undefined;
      const backgroundColor = a.backgroundColor as string | undefined;
      const textColor = a.textColor as string | undefined;

      const updateRequest: any = {};
      if (labelName) updateRequest.name = labelName;

      if (backgroundColor || textColor) {
        updateRequest.color = {};
        if (backgroundColor) updateRequest.color.backgroundColor = backgroundColor;
        if (textColor) updateRequest.color.textColor = textColor;
      }

      const response = await gmail.users.labels.update({
        userId: 'me',
        id: labelId,
        requestBody: updateRequest,
      });

      return {
        success: true,
        account: email,
        label: {
          id: response.data.id,
          name: response.data.name,
          color: response.data.color,
        },
      };
    },
  });
}
