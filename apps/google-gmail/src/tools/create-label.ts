import type { AgentApp } from '@agentapps/sdk';
import { createGmailClient, getSecrets } from '../lib/gmail-client.js';

/**
 * create-label — Create a new Gmail label.
 */
export function registerCreateLabelTool(app: AgentApp): void {
  app.tool('create-label', {
    description: 'Create a new Gmail label.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the label' },
        backgroundColor: { type: 'string', description: 'Background color in hex format' },
        textColor: { type: 'string', description: 'Text color in hex format' },
      },
      required: ['name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const secrets = await getSecrets(ctx);
      const { gmail, email } = await createGmailClient(secrets);

      const a = (args ?? {}) as Record<string, unknown>;
      const labelName = a.name as string;
      const backgroundColor = a.backgroundColor as string | undefined;
      const textColor = a.textColor as string | undefined;

      const labelRequest: any = {
        name: labelName,
        messageListVisibility: 'show',
        labelListVisibility: 'labelShow',
      };

      if (backgroundColor || textColor) {
        labelRequest.color = {};
        if (backgroundColor) labelRequest.color.backgroundColor = backgroundColor;
        if (textColor) labelRequest.color.textColor = textColor;
      }

      const response = await gmail.users.labels.create({
        userId: 'me',
        requestBody: labelRequest,
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
