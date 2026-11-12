import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

export function registerGetEnergyTool(app: AgentApp): void {
  app.tool('homey-get-energy', {
    description:
      'Get live energy report from Homey including current power usage and generation across the home.',
    parameters: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Optional zone ID to filter energy data for a specific zone.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getSecrets(ctx);

      return withTokenRefresh(secrets, async (sec) => {
        const api = await getHomeyApi(sec);

        const opts: any = {};
        if (a.zone) {
          opts.zone = a.zone as string;
        }

        const liveReport = await api.energy.getLiveReport(opts);
        return liveReport;
      });
    },
  });
}
