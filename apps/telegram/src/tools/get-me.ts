/**
 * get_me — get information about the bot.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerGetMeTool(app: AgentApp): void {
  app.tool('get_me', {
    description: 'Get basic information about the bot — username, name, and capabilities.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: { readOnlyHint: true },
    handler: async (_args, ctx) => {
      return await telegramRequest('getMe', null, ctx);
    },
  });
}
