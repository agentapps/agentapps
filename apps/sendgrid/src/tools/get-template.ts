/**
 * get-template — GET /templates/{templateId}
 *
 * Retrieve a specific transactional template by ID from SendGrid.
 */

import type { AgentApp } from '@agentapps/sdk';
import { sendgridRequest } from '../lib/sendgrid-client.js';

export function registerGetTemplateTool(app: AgentApp): void {
  app.tool('get-template', {
    description:
      'Get a specific transactional template by ID from SendGrid (GET /templates/{templateId}). Returns the template with its versions.',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'The ID of the template to retrieve.',
        },
      },
      required: ['templateId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const templateId = args.templateId as string;

      if (!templateId) {
        throw new Error('templateId is required.');
      }

      const res = await sendgridRequest(
        'GET',
        `/templates/${encodeURIComponent(templateId)}`,
        null,
        ctx,
      );

      return res;
    },
  });
}
