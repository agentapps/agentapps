/**
 * answer_callback_query — respond to a callback query from an inline keyboard.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerAnswerCallbackQueryTool(app: AgentApp): void {
  app.tool('answer_callback_query', {
    description:
      'Send an answer to a callback query sent from an inline keyboard. The answer will be displayed as a notification at the top of the chat screen or as an alert.',
    parameters: {
      type: 'object',
      properties: {
        callbackQueryId: {
          type: 'string',
          description: 'Unique identifier for the callback query to answer.',
        },
        text: {
          type: 'string',
          description:
            'Text of the notification (0-200 characters). If not specified, nothing will be shown to the user.',
        },
        showAlert: {
          type: 'boolean',
          description:
            'If true, show an alert instead of a notification at the top of the chat screen.',
        },
      },
      required: ['callbackQueryId'],
    },
    // Shows a notification or alert to another person; once shown it cannot be taken back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const params: Record<string, unknown> = {
        callback_query_id: args.callbackQueryId,
      };
      if (args.text) params.text = args.text;
      if (args.showAlert !== undefined) params.show_alert = args.showAlert;

      return await telegramRequest('answerCallbackQuery', params, ctx);
    },
  });
}
