/**
 * execute-action — execute a Zapier NLA action by ID with natural language instructions.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerExecuteActionTool(app: AgentApp): void {
  app.tool('execute-action', {
    description:
      'Execute a Zapier action (exposed Zap) by its action ID. Provide natural language instructions and optional parameter overrides.',
    parameters: {
      type: 'object',
      properties: {
        actionId: {
          type: 'string',
          description: 'The ID of the exposed Zapier action to execute.',
        },
        instructions: {
          type: 'string',
          description:
            'Natural language instructions for the action (e.g. "send an email to john@example.com saying hello").',
        },
        params: {
          type: 'object',
          description: 'Optional key-value parameter overrides for the action fields.',
        },
      },
      required: ['actionId', 'instructions'],
    },
    handler: async (args, ctx) => {
      const actionId = args.actionId as string;
      const instructions = args.instructions as string;
      const params = (args.params as Record<string, unknown>) ?? {};

      return await zapierRequest(
        'POST',
        `/exposed/${actionId}/execute/`,
        {
          body: {
            instructions,
            ...params,
          },
        },
        ctx,
      );
    },
  });
}
