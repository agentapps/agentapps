/**
 * get-me — get information about the bot.
 */

import type { AgentApp } from '@agentapps/sdk';
import { telegramRequest } from '../lib/telegram-client.js';

export function registerGetMeTool(app: AgentApp): void {
  app.tool('get-me', {
    description: 'Get basic information about the bot — username, name, and capabilities.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return await telegramRequest('getMe', null, ctx);
    },
  });
}
