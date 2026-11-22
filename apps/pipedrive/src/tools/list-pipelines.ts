/**
 * list-pipelines — list pipelines from Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerListPipelinesTool(app: AgentApp): void {
  app.tool('list-pipelines', {
    description: 'List all pipelines from your Pipedrive account.',
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
      return await pipedriveRequest('GET', '/pipelines', {}, ctx);
    },
  });
}
