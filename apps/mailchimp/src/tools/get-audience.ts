import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { shapeAudience } from './_helpers.js';

/**
 * get-audience — GET /lists/{listId}.
 */
export function registerGetAudienceTool(app: AgentApp): void {
  app.tool('get-audience', {
    description:
      'Get one audience (list) by id from Mailchimp (GET /lists/{listId}). Returns audience details including stats and member count. Params: listId (required, string).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
      },
      required: ['listId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!a.listId || typeof a.listId !== 'string' || a.listId.trim() === '') {
        throw new Error('listId is required and must be a non-empty string.');
      }
      const listId = String(a.listId).trim();

      const res = await mailchimpRequest<unknown>(ctx, `/lists/${encodeURIComponent(listId)}`);
      return shapeAudience(res);
    },
  });
}
