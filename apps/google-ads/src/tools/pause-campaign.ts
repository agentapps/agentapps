import type { AgentApp } from '@agentapps/sdk';
import { setStatus, statusParameters } from '../lib/mutate.js';

export function registerPauseCampaignTool(app: AgentApp): void {
  app.tool('pause-campaign', {
    description:
      'Pause one Google Ads campaign: its ads stop serving and it stops spending. Reversible with enable-campaign. ' +
      'Returns { success, campaignId, resourceName, status: "PAUSED", validateOnly }. Pausing an already paused campaign changes nothing.',
    parameters: statusParameters('campaign'),
    annotations: {
      readOnlyHint: false,
      // Reversible with enable-campaign, and it stops spend rather than causing it.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: (args, ctx) => setStatus(ctx, 'campaign', 'PAUSED', args),
  });
}
