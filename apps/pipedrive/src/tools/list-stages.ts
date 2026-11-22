/**
 * list-stages — list stages from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerListStagesTool(app: AgentApp): void {
  app.tool('list-stages', {
    description: 'List stages from your Pipedrive account. Optionally filter by pipeline ID.',
    parameters: {
      type: 'object',
      properties: {
        pipeline_id: {
          type: 'number',
          description:
            'Filter stages by pipeline ID. If omitted, returns stages from all pipelines.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (args.pipeline_id) params.pipeline_id = args.pipeline_id as number;

      return await pipedriveRequest('GET', '/stages', { params }, ctx);
    },
  });
}
