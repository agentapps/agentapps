/**
 * create-note — create a new note in Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerCreateNoteTool(app: AgentApp): void {
  app.tool('create-note', {
    description:
      'Create a new note in Pipedrive. Must be associated with at least one entity (deal, person, or organization). Returns the created note object.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The HTML-formatted content of the note (required).',
        },
        deal_id: {
          type: 'number',
          description: 'ID of the deal to associate with this note.',
        },
        person_id: {
          type: 'number',
          description: 'ID of the person to associate with this note.',
        },
        org_id: {
          type: 'number',
          description: 'ID of the organization to associate with this note.',
        },
      },
      required: ['content'],
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = { content: args.content };
      if (args.deal_id) body.deal_id = args.deal_id;
      if (args.person_id) body.person_id = args.person_id;
      if (args.org_id) body.org_id = args.org_id;

      return await pipedriveRequest('POST', '/notes', { body }, ctx);
    },
  });
}
