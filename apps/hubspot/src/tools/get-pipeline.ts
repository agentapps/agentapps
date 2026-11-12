import type { AgentApp } from '@agentapps/sdk';
import { formatPipeline, hubspotRequest } from '../lib/index.js';

/**
 * get-pipeline — GET /crm/v3/pipelines/{objectType}/{pipelineId}.
 */
export function registerGetPipelineTool(app: AgentApp): void {
  app.tool('get-pipeline', {
    description:
      'Get a specific HubSpot pipeline by ID. Returns pipeline with stages. Params: objectType, pipelineId',
    parameters: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          description: 'Pipeline object type.',
          enum: ['deals', 'tickets'],
        },
        pipelineId: { type: 'string', description: 'Pipeline ID.' },
      },
      required: ['objectType', 'pipelineId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { objectType, pipelineId } = args as {
        objectType: 'deals' | 'tickets';
        pipelineId: string;
      };

      const data = (await hubspotRequest(
        ctx,
        `/crm/v3/pipelines/${objectType}/${encodeURIComponent(pipelineId)}`,
      )) as any;

      return formatPipeline(data);
    },
  });
}
