import type { AgentApp } from '@agentapps/sdk';
import { setStatus, statusParameters } from '../lib/mutate.js';

export function registerEnableAdGroupTool(app: AgentApp): void {
  app.tool('enable-ad-group', {
    description:
      'Enable (unpause) one ad group. AFFECTS SPEND: if its campaign is enabled, its ads start serving and spending right away. ' +
      'Returns { success, adGroupId, resourceName, status: "ENABLED", validateOnly }. Pass validateOnly: true for a dry run.',
    parameters: statusParameters('adGroup'),
    annotations: {
      readOnlyHint: false,
      // Money spent while the ad group runs cannot be undone, so this counts as destructive.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: (args, ctx) => setStatus(ctx, 'adGroup', 'ENABLED', args),
  });
}
