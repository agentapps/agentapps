import type { AgentApp } from '@agentapps/sdk';
import type { Args } from '../lib/args.js';
import { statusParameters, updateStatus } from '../lib/status.js';

export function registerPauseDeliveryTool(app: AgentApp): void {
  app.tool('pause-delivery', {
    description:
      'Pause TikTok campaigns, ad groups or ads (operation_status DISABLE), up to 20 of one ' +
      'level per call. Paused items stop spending; enable-delivery turns them back on. Returns ' +
      '{ success, level, operationStatus, updatedIds, notUpdatedIds? }.',
    parameters: statusParameters('pause'),
    annotations: {
      readOnlyHint: false,
      // Pausing stops spend and is undone with enable-delivery, so it is not destructive.
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => updateStatus(ctx, (args ?? {}) as Args, 'DISABLE'),
  });
}
