import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { shapeTemplate } from './_helpers.js';

/**
 * get-template — GET /templates/{templateId}.
 *
 * Detail of a single template.
 */
export function registerGetTemplateTool(app: AgentApp): void {
  app.tool('get-template', {
    description:
      'Get one template by id from Mailchimp (GET /templates/{templateId}). Returns template details. Params: templateId (required, number).',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'number', description: 'Id of the template (required).' },
      },
      required: ['templateId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const templateId = a.templateId;
      if (
        templateId === undefined ||
        templateId === null ||
        typeof templateId !== 'number' ||
        !Number.isInteger(templateId)
      ) {
        throw new Error('templateId is required and must be an integer.');
      }

      const res = await mailchimpRequest<unknown>(ctx, `/templates/${templateId}`);
      return shapeTemplate(res);
    },
  });
}
