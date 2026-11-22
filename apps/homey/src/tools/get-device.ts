import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, getZones, withTokenRefresh } from '../lib/index.js';

export function registerGetDeviceTool(app: AgentApp): void {
  app.tool('homey-get-device', {
    description: 'Get detailed information and current state of a specific Homey device by ID.',
    parameters: {
      type: 'object',
      properties: {
        device_id: {
          type: 'string',
          description: 'Device ID.',
        },
      },
      required: ['device_id'],
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getSecrets(ctx);

      return withTokenRefresh(secrets, async (sec) => {
        const api = await getHomeyApi(sec);
        const device = await api.devices.getDevice({ id: a.device_id as string });
        const zones = await getZones(sec);
        const zone = device.zone ? zones[device.zone] : null;

        return {
          ...device,
          zoneName: zone?.name || 'No Zone',
        };
      });
    },
  });
}
