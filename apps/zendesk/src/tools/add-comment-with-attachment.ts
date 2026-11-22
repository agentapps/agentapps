import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * add-comment-with-attachment — PUT /tickets/{id}.json with comment + uploads.
 */
export function registerAddCommentWithAttachmentTool(app: AgentApp): void {
  app.tool('add-comment-with-attachment', {
    description:
      'Add a comment to a Zendesk ticket with file attachments. Uses upload tokens from upload-attachment. Returns the updated ticket. Params: ticketId, body, uploadTokens?, public?.',
    parameters: {
      type: 'object',
      properties: {
        ticketId: {
          type: 'string',
          description: 'Zendesk ticket ID.',
        },
        body: {
          type: 'string',
          description: 'Comment text/body.',
        },
        uploadTokens: {
          type: 'array',
          items: { type: 'string' },
          description: 'Upload tokens from upload-attachment tool.',
        },
        public: {
          type: 'boolean',
          description: 'Whether the comment is public (customer-visible). Default true.',
        },
      },
      required: ['ticketId', 'body'],
    },
    annotations: {
      readOnlyHint: false,
      // A comment is public by default, reaches the requester and cannot be removed.
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        ticketId,
        body,
        uploadTokens,
        public: isPublic = true,
      } = args as {
        ticketId: string;
        body: string;
        uploadTokens?: string[];
        public?: boolean;
      };

      const comment: Record<string, unknown> = { body, public: isPublic };
      if (uploadTokens && uploadTokens.length > 0) {
        comment.uploads = uploadTokens;
      }

      const result = await zendeskRequest<any>(ctx, `/tickets/${ticketId}.json`, {
        method: 'PUT',
        body: {
          ticket: { comment },
        },
      });

      const t = result.ticket;
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        updatedAt: t.updated_at,
        url: t.url,
      };
    },
  });
}
