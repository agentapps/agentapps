import type { AgentApp } from '@agentapps/sdk';
import { mailchimpRequest } from '../lib/mailchimp-client.js';
import { buildCreateSegmentBody, shapeSegment, validateCreateSegmentArgs } from './_helpers.js';

/**
 * create-segment — POST /lists/{listId}/segments.
 *
 * Creates a new segment for an audience. Can be a static segment (list of
 * emails) or a dynamic segment (conditions object with match + conditions[]).
 */
export function registerCreateSegmentTool(app: AgentApp): void {
  app.tool('create-segment', {
    description:
      'Create a segment in a Mailchimp audience (POST /lists/{listId}/segments). Returns the created segment. Params: listId (required), name (required), static_segment? (array of emails for static segment), conditions? ({ match: "any"|"all", conditions: [...] } for dynamic segment).',
    parameters: {
      type: 'object',
      properties: {
        listId: { type: 'string', description: 'Id of the audience/list (required).' },
        name: { type: 'string', description: 'Name of the segment (required).' },
        static_segment: {
          type: 'array',
          description: 'Array of email addresses for a static segment.',
          items: { type: 'string' },
        },
        conditions: {
          type: 'object',
          description:
            'Conditions object for a dynamic segment — { match: "any"|"all", conditions: [...] }.',
        },
      },
      required: ['listId', 'name'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      validateCreateSegmentArgs(args);
      const a = args as Record<string, unknown>;
      const listId = String(a.listId).trim();
      const body = buildCreateSegmentBody(a);

      const res = await mailchimpRequest<unknown>(
        ctx,
        `/lists/${encodeURIComponent(listId)}/segments`,
        { method: 'POST', body },
      );

      return shapeSegment(res);
    },
  });
}
