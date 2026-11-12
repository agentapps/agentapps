import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { clampInt, shapeAutomation } from './_helpers.js';

interface ListAutomationsResponse {
  automations?: unknown[];
  total_items?: number;
}

/**
 * list-automations — GET /automations.
 */
export function registerListAutomationsTool(app: AgentApp): void {
  app.tool('list-automations', {
    description:
      'List automations from Mailchimp (GET /automations). Returns { automations, total_items, count }. Params: count? (1-1000, default 10).',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Max automations to return (1-1000, default 10).',
          default: 10,
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const count = clampInt(a.count, 1, 1000, 10);

      const res = await mailchimpRequest<ListAutomationsResponse>(ctx, '/automations', {
        query: { count },
      });

      const automations = (res.automations ?? []).map(shapeAutomation);
      return {
        automations,
        total_items: typeof res.total_items === 'number' ? res.total_items : automations.length,
        count,
      };
    },
  });
}
