import type { AgentApp } from '@agentapps/sdk';
import { setStatus, statusParameters } from '../lib/mutate.js';

export function registerPauseAdGroupTool(app: AgentApp): void {
  app.tool('pause-ad-group', {
    description:
      'Pause one ad group: its ads and keywords stop serving. Reversible with enable-ad-group. ' +
      'Returns { success, adGroupId, resourceName, status: "PAUSED", validateOnly }.',
    parameters: statusParameters('adGroup'),
    annotations: {
      readOnlyHint: false,
      // Reversible with enable-ad-group, and it stops spend rather than causing it.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: (args, ctx) => setStatus(ctx, 'adGroup', 'PAUSED', args),
  });
}
