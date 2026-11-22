import type { AgentApp } from '@agentapps/sdk';
import { getSecrets, getZones, withTokenRefresh } from '../lib/index.js';

export function registerListZonesTool(app: AgentApp): void {
  app.tool('list-zones', {
    description: 'List all zones (rooms/areas) configured in Homey.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      const secrets = await getSecrets(ctx);

      return withTokenRefresh(secrets, async (sec) => {
        const zones = await getZones(sec);

        const zoneList = Object.values(zones).map((zone: any) => ({
          id: zone.id,
          name: zone.name,
          parent: zone.parent,
          icon: zone.icon,
        }));

        return zoneList;
      });
    },
  });
}
