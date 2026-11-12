import type { AgentApp } from '@agentapps/sdk';
import { buildProperties, formatTicket, hubspotRequest } from '../lib/index.js';

/**
 * create-ticket — POST /crm/v3/objects/tickets.
 */
export function registerCreateTicketTool(app: AgentApp): void {
  app.tool('create-ticket', {
    description:
      'Create a new HubSpot ticket. Returns curated ticket shape. Not retryable. Params: subject, content?, status?, priority?, category?, pipeline?, stage?, source?, properties?',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Ticket subject (required).' },
        content: { type: 'string', description: 'Ticket description/content.' },
        status: { type: 'string', description: 'Ticket status.' },
        priority: { type: 'string', description: 'Ticket priority: LOW, MEDIUM, HIGH.' },
        category: { type: 'string', description: 'Ticket category.' },
        pipeline: { type: 'string', description: 'Pipeline ID.' },
        stage: { type: 'string', description: 'Pipeline stage ID.' },
        source: { type: 'string', description: 'Ticket source type.' },
        properties: {
          type: 'object',
          description: 'Additional HubSpot ticket properties as key-value pairs.',
        },
      },
      required: ['subject'],
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const {
        subject,
        content,
        status,
        priority,
        category,
        pipeline,
        stage,
        source,
        properties: extraProps,
      } = args as {
        subject: string;
        content?: string;
        status?: string;
        priority?: string;
        category?: string;
        pipeline?: string;
        stage?: string;
        source?: string;
        properties?: Record<string, string>;
      };

      const payload: Record<string, any> = {
        subject,
        ...(content && { content }),
        ...(status && { hs_ticket_priority: status }),
        ...(priority && { hs_pipeline_stage: priority }),
        ...(category && { hs_ticket_category: category }),
        ...(pipeline && { hs_pipeline: pipeline }),
        ...(stage && { hs_pipeline_stage: stage }),
        ...(source && { source_type: source }),
        ...extraProps,
      };

      const data = (await hubspotRequest(ctx, '/crm/v3/objects/tickets', {
        method: 'POST',
        body: buildProperties(payload),
      })) as any;

      return formatTicket(data);
    },
  });
}
