/**
 * preview-action — preview a Zapier NLA action without executing it.
 */

import type { AgentApp } from '@agentapps/sdk';
import { zapierRequest } from '../lib/zapier-client.js';

export function registerPreviewActionTool(app: AgentApp): void {
  app.tool('preview-action', {
    description:
      'Preview a Zapier action without actually executing it. Returns what would happen if the action were run with the given instructions.',
    parameters: {
      type: 'object',
      properties: {
        actionId: {
          type: 'string',
          description: 'The ID of the exposed Zapier action to preview.',
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
    // A POST to the execute endpoint, but always with preview_only: nothing runs.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
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
            preview_only: true,
            ...params,
          },
        },
        ctx,
      );
    },
  });
}
