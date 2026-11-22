import type { AgentApp } from '@agentapps/sdk';
import { intercomRequest } from '../lib/intercom-client.js';

/**
 * assign-conversation — POST /conversations/{conversationId}/reply (assignment).
 */
export function registerAssignConversationTool(app: AgentApp): void {
  app.tool('assign-conversation', {
    description:
      'Assign an Intercom conversation to a specific admin or team. Can also unassign by omitting both.',
    parameters: {
      type: 'object',
      properties: {
        conversationId: {
          type: 'string',
          description: 'The Intercom conversation ID',
        },
        adminId: {
          type: 'string',
          description: 'Admin ID to assign the conversation to',
        },
        teamId: {
          type: 'string',
          description: 'Team ID to assign the conversation to',
        },
      },
      required: ['conversationId'],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { conversationId, adminId, teamId } = args as {
        conversationId: string;
        adminId?: string;
        teamId?: string;
      };

      const me = await intercomRequest<Record<string, unknown>>(ctx, '/me');

      const body: Record<string, unknown> = {
        message_type: 'assignment',
        type: 'admin',
        admin_id: me.id,
      };

      if (adminId) body.assignee_id = adminId;
      if (teamId) body.team_id = teamId;

      return intercomRequest(ctx, `/conversations/${conversationId}/reply`, {
        method: 'POST',
        body,
      });
    },
  });
}
