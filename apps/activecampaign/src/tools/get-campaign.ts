import type { AgentApp } from '@agentapps/sdk';
import { acRequest } from '../lib/index.js';
import { parseCampaign, wrap } from './_helpers.js';

export function registerGetCampaignTool(app: AgentApp): void {
  app.tool('get-campaign', {
    description:
      'Get a campaign by id. Returns { campaign: {id,name,subject,status,sendDate,fromName,fromEmail,totalRecipients,opens,clicks} }.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    handler: async (args, ctx) => {
      if (!(args as any).id?.trim()) throw new Error('id is required');
      const raw = (await acRequest(ctx, `/campaigns/${encodeURIComponent((args as any).id)}`)) as {
        campaign?: unknown;
      };
      return wrap({ campaign: parseCampaign(raw.campaign) });
    },
  });
}
