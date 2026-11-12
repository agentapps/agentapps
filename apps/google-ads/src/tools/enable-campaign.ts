import type { AgentApp } from '@agentapps/sdk';
import { setStatus, statusParameters } from '../lib/mutate.js';

export function registerEnableCampaignTool(app: AgentApp): void {
  app.tool('enable-campaign', {
    description:
      'Enable (unpause) one Google Ads campaign. AFFECTS SPEND: its ads start serving and it starts spending its budget right away. ' +
      'Confirm the campaign and its budget with the user first (list-campaigns shows both). ' +
      'Returns { success, campaignId, resourceName, status: "ENABLED", validateOnly }. Pass validateOnly: true for a dry run.',
    parameters: statusParameters('campaign'),
    annotations: {
      readOnlyHint: false,
      // Money spent while the campaign runs cannot be undone, so this counts as destructive.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: (args, ctx) => setStatus(ctx, 'campaign', 'ENABLED', args),
  });
}
