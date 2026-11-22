/**
 * list_predictions — list recent predictions with their status.
 */

import type { AgentApp } from '@agentapps/sdk';
import { assertOk, replicateRequest } from '../types.js';

export function registerListPredictionsTool(app: AgentApp): void {
  app.tool('list_predictions', {
    description:
      'List recent predictions with their status. Useful to track ongoing or past generations.',
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
      const apiToken = await ctx.systemSecret('API_TOKEN');
      if (!apiToken) {
        throw new Error('Missing API_TOKEN system secret — configure it to use Replicate.');
      }

      ctx.log('info', 'Listing predictions');

      const response = await replicateRequest('/predictions', apiToken);
      await assertOk(response);
      const data = await response.json();

      return (data.results || []).map((p: Record<string, unknown>) => ({
        id: p.id,
        model: p.model,
        status: p.status,
        created_at: p.created_at,
        completed_at: p.completed_at || null,
        error: p.error || null,
        output: p.output || null,
      }));
    },
  });
}
