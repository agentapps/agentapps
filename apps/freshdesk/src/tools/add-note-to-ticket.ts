import type { AgentApp } from '@agentapps/sdk';
import { freshdeskRequest } from '../lib/freshdesk-client.js';

/**
 * add-note-to-ticket — POST /tickets/{ticketId}/notes
 *
 * Adds a note (public or private) to a Freshdesk ticket.
 */
export function registerAddNoteToTicketTool(app: AgentApp): void {
  app.tool('add-note-to-ticket', {
    description:
      'Add a note to a Freshdesk ticket (POST /api/v2/tickets/{ticketId}/notes). Requires body (HTML content). Notes are private by default (visible only to agents). Set private=false to make it public. Returns the created note.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'number',
          description: 'The Freshdesk ticket ID to add the note to.',
        },
        body: {
          type: 'string',
          description: 'HTML content of the note.',
        },
        private: {
          type: 'boolean',
          description:
            'Whether the note is private (default true). Private notes are only visible to agents.',
        },
      },
      required: ['ticketId', 'body'],
    },
    // Adds a note (private by default) without mailing the requester: a create, not a send.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const ticketId = args.ticketId as number;
      const params: Record<string, unknown> = {
        body: args.body,
        private: args.private !== undefined ? args.private : true,
      };

      return await freshdeskRequest('POST', `/tickets/${ticketId}/notes`, params, ctx);
    },
  });
}
