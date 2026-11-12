import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * list-ticket-comments — GET /tickets/{id}/comments.json.
 */
export function registerListTicketCommentsTool(app: AgentApp): void {
  app.tool('list-ticket-comments', {
    description:
      'List all comments (public and internal notes) on a Zendesk ticket. Returns curated rows { id, authorId, body, public, createdAt }. Params: ticketId.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'Zendesk ticket ID.',
        },
      },
      required: ['ticketId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { ticketId } = args as { ticketId: string };

      const result = await zendeskRequest<any>(ctx, `/tickets/${ticketId}/comments.json`);

      const comments = (result.comments ?? []).map((c: any) => ({
        id: c.id,
        authorId: c.author_id,
        body: c.body,
        public: c.public,
        htmlBody: c.html_body,
        createdAt: c.created_at,
        attachments: (c.attachments ?? []).map((a: any) => ({
          id: a.id,
          fileName: a.file_name,
          url: a.content_url,
          size: a.size,
        })),
      }));

      return {
        ticketId,
        comments,
        count: comments.length,
      };
    },
  });
}
