import type { AgentApp } from '@agentapps/sdk';
import { getLinearClient } from '../lib/index.js';
import { validateUuid } from './_linear-helpers.js';

export function registerDeleteLabelTool(app: AgentApp): void {
  app.tool('delete-label', {
    description: 'Permanently delete a Linear label. Irreversible. Returns { success, labelId }.',
    parameters: {
      type: 'object',
      properties: {
        labelId: { type: 'string', description: 'Label UUID.' },
      },
      required: ['labelId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const client = await getLinearClient(ctx);
      const { labelId } = args as { labelId: string };
      validateUuid(labelId, 'labelId');

      const result = await client.deleteIssueLabel(labelId);
      return { success: !!result.success, labelId };
    },
  });
}
