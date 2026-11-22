import type { AgentApp } from '@agentapps/sdk';
import { zendeskRequest } from '../lib/zendesk-client.js';

/**
 * get-ticket — GET /tickets/{id}.json.
 */
export function registerGetTicketTool(app: AgentApp): void {
  app.tool('get-ticket', {
    description:
      'Get a single Zendesk ticket by ID with full details including description, custom fields, and tags.',
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
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const { ticketId } = args as { ticketId: string };

      const result = await zendeskRequest<any>(ctx, `/tickets/${ticketId}.json`);
      const t = result.ticket;

      return {
        id: t.id,
        subject: t.subject,
        description: t.description,
        status: t.status,
        priority: t.priority,
        type: t.type,
        requesterId: t.requester_id,
        submitterId: t.submitter_id,
        assigneeId: t.assignee_id,
        organizationId: t.organization_id,
        groupId: t.group_id,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        tags: t.tags ?? [],
        customFields: (t.custom_fields ?? []).map((f: any) => ({
          id: f.id,
          value: f.value,
        })),
        url: t.url,
      };
    },
  });
}
