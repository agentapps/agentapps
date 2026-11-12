import type { AgentApp } from '@agentapps/sdk';
import { formatPipeline, hubspotRequest } from '../lib/index.js';

/**
 * list-pipelines — GET /crm/v3/pipelines/{objectType}.
 */
export function registerListPipelinesTool(app: AgentApp): void {
  app.tool('list-pipelines', {
    description:
      'List HubSpot pipelines for deals or tickets. Returns pipeline definitions with stages. Params: objectType (deals or tickets), includeInactive?',
    parameters: {
      type: 'object',
      properties: {
        objectType: {
          type: 'string',
          description: 'Pipeline object type.',
          enum: ['deals', 'tickets'],
        },
        includeInactive: {
          type: 'boolean',
          description: 'Include inactive pipelines. Default false.',
        },
      },
      required: ['objectType'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { objectType, includeInactive = false } = args as {
        objectType: 'deals' | 'tickets';
        includeInactive?: boolean;
      };

      const data = (await hubspotRequest(ctx, `/crm/v3/pipelines/${objectType}`, {
        params: includeInactive ? { includeInactive: 'true' } : undefined,
      })) as any;

      return {
        pipelines: (data.results ?? []).map(formatPipeline),
        total: data.results?.length ?? 0,
      };
    },
  });
}
