/**
 * get-note — get full details of a Granola meeting note by ID.
 *
 * Returns summary, attendees, calendar event, and folder membership.
 * For the transcript use the dedicated get-transcript tool which
 * supports pagination over potentially large segment arrays.
 */

import type { AgentApp } from '@agentapps/sdk';
import { GranolaClient } from '../lib/index.js';

export function registerGetNoteTool(app: AgentApp): void {
  app.tool('get-note', {
    description:
      'Get details of a Granola meeting note by ID: summary, attendees, ' +
      'calendar event, and folder membership. For the transcript use the ' +
      'get-transcript tool instead (it supports pagination).',
    parameters: {
      type: 'object',
      properties: {
        noteId: {
          type: 'string',
          description: 'Note ID (format: not_XXXXXXXXXXXXXX).',
        },
      },
      required: ['noteId'],
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const apiKey = await ctx.installationSecret('API_KEY');
      if (!apiKey) throw new Error('Missing API_KEY user secret.');

      const noteId = args.noteId as string;

      const client = new GranolaClient(apiKey);
      const note = await client.getNote(noteId, false);

      // Strip the transcript field — use get-transcript for that.
      const { transcript: _ignored, ...rest } = note;
      return rest;
    },
  });
}
