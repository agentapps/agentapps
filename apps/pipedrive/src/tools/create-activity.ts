/**
 * create-activity — create a new activity in Pipedrive.
 */

import type { AgentApp } from '@agentapps/sdk';
import { pipedriveRequest } from '../lib/pipedrive-client.js';

export function registerCreateActivityTool(app: AgentApp): void {
  app.tool('create-activity', {
    description: 'Create a new activity in Pipedrive. Returns the created activity object.',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'The subject/title of the activity (required).',
        },
        type: {
          type: 'string',
          description:
            'The type of the activity (required): call, meeting, task, deadline, email, lunch.',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format.',
        },
        due_time: {
          type: 'string',
          description: 'Due time in HH:MM format.',
        },
        duration: {
          type: 'string',
          description: 'Duration in HH:MM format.',
        },
        deal_id: {
          type: 'number',
          description: 'ID of the deal to associate with this activity.',
        },
        person_id: {
          type: 'number',
          description: 'ID of the person to associate with this activity.',
        },
        org_id: {
          type: 'number',
          description: 'ID of the organization to associate with this activity.',
        },
        note: {
          type: 'string',
          description: 'Additional note/description for the activity.',
        },
      },
      required: ['subject', 'type'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const body: Record<string, unknown> = {
        subject: args.subject,
        type: args.type,
      };
      if (args.due_date) body.due_date = args.due_date;
      if (args.due_time) body.due_time = args.due_time;
      if (args.duration) body.duration = args.duration;
      if (args.deal_id) body.deal_id = args.deal_id;
      if (args.person_id) body.person_id = args.person_id;
      if (args.org_id) body.org_id = args.org_id;
      if (args.note) body.note = args.note;

      return await pipedriveRequest('POST', '/activities', { body }, ctx);
    },
  });
}
