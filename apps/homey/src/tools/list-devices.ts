import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, getZones, withTokenRefresh } from '../lib/index.js';

export function registerListDevicesTool(app: AgentApp): void {
  app.tool('homey-list-devices', {
    description:
      'List all devices connected to Homey with their zone, class, capabilities, and availability status.',
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
        const api = await getHomeyApi(sec);
        const devices = await api.devices.getDevices();
        const zones = await getZones(sec);

        const deviceList = Object.values(devices).map((device: any) => {
          const zone = device.zone ? zones[device.zone] : null;
          return {
            id: device.id,
            name: device.name,
            zoneName: zone?.name || 'No Zone',
            zoneId: device.zone,
            class: device.class,
            capabilities: device.capabilities,
            capabilitiesObj: device.capabilitiesObj,
            available: device.available,
            ready: device.ready,
          };
        });

        return deviceList;
      });
    },
  });
}
