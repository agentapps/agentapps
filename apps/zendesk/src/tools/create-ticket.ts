import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * create-ticket — POST /tickets.json.
 */
export function registerCreateTicketTool(app: AgentApp): void {
  app.tool('create-ticket', {
    description:
      'Create a new Zendesk ticket. Returns the created ticket. Not retryable (no idempotency key). Params: subject, description, requesterEmail?, priority?, status?, assigneeId?, tags?, customFields?.',
    parameters: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Ticket subject line.',
        },
        description: {
          type: 'string',
          description: 'Ticket body/description.',
        },
        requesterEmail: {
          type: 'string',
          description: 'Email address of the requester. If omitted, uses the authenticated user.',
        },
        priority: {
          type: 'string',
          enum: ['urgent', 'high', 'normal', 'low'],
          description: 'Ticket priority.',
        },
        status: {
          type: 'string',
          enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
          description: 'Initial ticket status. Default: open.',
        },
        assigneeId: {
          type: 'string',
          description: 'User ID to assign the ticket to.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to attach to the ticket.',
        },
        customFields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              value: {},
            },
          },
          description: 'Custom field values [{id, value}].',
        },
      },
      required: ['subject', 'description'],
    },
    annotations: {
      readOnlyHint: false,
      // delete-ticket removes the ticket; whether the requester is emailed depends on triggers.
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const {
        subject,
        description,
        requesterEmail,
        priority,
        status,
        assigneeId,
        tags,
        customFields,
      } = args as {
        subject: string;
        description: string;
        requesterEmail?: string;
        priority?: string;
        status?: string;
        assigneeId?: string;
        tags?: string[];
        customFields?: Array<{ id: number; value: unknown }>;
      };

      const ticket: Record<string, unknown> = {
        subject,
        comment: { body: description },
      };

      if (requesterEmail) ticket.requester = { email: requesterEmail };
      if (priority) ticket.priority = priority;
      if (status) ticket.status = status;
      if (assigneeId) ticket.assignee_id = Number(assigneeId);
      if (tags) ticket.tags = tags;
      if (customFields) ticket.custom_fields = customFields;

      const result = await zendeskRequest<any>(ctx, '/tickets.json', {
        method: 'POST',
        body: { ticket },
      });

      const t = result.ticket;
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        requesterId: t.requester_id,
        assigneeId: t.assignee_id,
        createdAt: t.created_at,
        url: t.url,
      };
    },
  });
}
