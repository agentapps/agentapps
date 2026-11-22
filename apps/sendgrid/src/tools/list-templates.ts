/**
 * list-templates — GET /templates?generations=dynamic
 *
 * List all dynamic transactional templates from SendGrid.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

interface ListTemplatesResponse {
  templates?: unknown[];
}

export function registerListTemplatesTool(app: AgentApp): void {
  app.tool('list-templates', {
    description:
      'List dynamic transactional templates from SendGrid (GET /templates?generations=dynamic). Returns { templates }.',
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
      const res = (await sendgridRequest(
        'GET',
        '/templates?generations=dynamic',
        null,
        ctx,
      )) as ListTemplatesResponse;

      return {
        templates: res.templates ?? [],
      };
    },
  });
}
