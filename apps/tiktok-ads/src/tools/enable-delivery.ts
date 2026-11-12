import type { AgentApp } from '@agentapps/sdk';
import type { Args } from '../lib/args.js';
import { statusParameters, updateStatus } from '../lib/status.js';

export function registerEnableDeliveryTool(app: AgentApp): void {
  app.tool('enable-delivery', {
    description:
      'Enable (unpause) TikTok campaigns, ad groups or ads (operation_status ENABLE), up to 20 ' +
      'of one level per call. AFFECTS SPEND: enabled items start delivering and spending the ' +
      "advertiser's money right away, within their budgets. An ad only delivers when its ad " +
      'group and campaign are enabled too. Returns { success, level, operationStatus, ' +
      'updatedIds, notUpdatedIds? }.',
    parameters: statusParameters('enable'),
    annotations: {
      readOnlyHint: false,
      // Money spent while delivering cannot be taken back, so this is destructive.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => updateStatus(ctx, (args ?? {}) as Args, 'ENABLE'),
  });
}
