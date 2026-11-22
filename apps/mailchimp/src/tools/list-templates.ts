import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { clampInt, shapeTemplate } from './_helpers.js';

interface ListTemplatesResponse {
  templates?: unknown[];
  total_items?: number;
}

/**
 * list-templates — GET /templates.
 */
export function registerListTemplatesTool(app: AgentApp): void {
  app.tool('list-templates', {
    description:
      'List templates from Mailchimp (GET /templates). Returns { templates, total_items, count }. Params: count? (1-1000, default 10).',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Max templates to return (1-1000, default 10).',
          default: 10,
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
      const a = (args ?? {}) as Record<string, unknown>;
      const count = clampInt(a.count, 1, 1000, 10);

      const res = await mailchimpRequest<ListTemplatesResponse>(ctx, '/templates', {
        query: { count },
      });

      const templates = (res.templates ?? []).map(shapeTemplate);
      return {
        templates,
        total_items: typeof res.total_items === 'number' ? res.total_items : templates.length,
        count,
      };
    },
  });
}
