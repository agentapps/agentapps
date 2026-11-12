import type { AgentApp } from '@agentapps/sdk';
import { hubspotRequest } from '../lib/index.js';

/**
 * delete-engagement — DELETE /crm/v3/objects/{engagementType}/{engagementId}.
 *
 * Archives (soft-deletes) the engagement. IRREVERSIBLE via API.
 */
export function registerDeleteEngagementTool(app: AgentApp): void {
  app.tool('delete-engagement', {
    description:
      'Archive (soft delete) a HubSpot engagement. Params: type (call|email|meeting|note|task), engagementId',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Engagement type.',
          enum: ['call', 'email', 'meeting', 'note', 'task'],
        },
        engagementId: { type: 'string', description: 'HubSpot engagement ID to archive.' },
      },
      required: ['type', 'engagementId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { type, engagementId } = args as {
        type: 'call' | 'email' | 'meeting' | 'note' | 'task';
        engagementId: string;
      };

      const engagementTypeMap: Record<string, string> = {
        call: 'calls',
        email: 'emails',
        meeting: 'meetings',
        note: 'notes',
        task: 'tasks',
      };

      const objectType = engagementTypeMap[type];

      await hubspotRequest(
        ctx,
        `/crm/v3/objects/${objectType}/${encodeURIComponent(engagementId)}`,
        { method: 'DELETE' },
      );

      return { success: true, engagementId, type };
    },
  });
}
