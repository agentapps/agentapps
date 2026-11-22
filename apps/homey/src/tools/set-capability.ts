import type { AgentApp } from '@agentapps/sdk';
import { getHomeyApi, getSecrets, withTokenRefresh } from '../lib/index.js';

/**
 * Parse a value to its correct type. The transport may stringify booleans and
 * numbers, so we coerce them back.
 */
function parseValue(value: unknown): unknown {
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
  }
  return value;
}

export function registerSetCapabilityTool(app: AgentApp): void {
  app.tool('homey-set-capability', {
    description:
      'Set a device capability value (e.g., turn on/off, set brightness, temperature). Use homey-list-devices to find device IDs and capabilities.',
    parameters: {
      type: 'object',
      properties: {
        device_id: {
          type: 'string',
          description: 'Device ID.',
        },
        capability: {
          type: 'string',
          description: "Capability name (e.g., 'onoff', 'dim', 'target_temperature').",
        },
        value: {
          description:
            'Value to set (boolean for onoff, number 0-1 for dim, number for temperature).',
        },
      },
      required: ['device_id', 'capability', 'value'],
    },
    // Acts on a physical device in the home (a light, a lock, a thermostat), so it waits for
    // approval. Not destructive: setting the previous value puts the device back.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getSecrets(ctx);

      return withTokenRefresh(secrets, async (sec) => {
        const api = await getHomeyApi(sec);
        const device = await api.devices.getDevice({ id: a.device_id as string });

        const parsedValue = parseValue(a.value);

        await device.setCapabilityValue({
          capabilityId: a.capability as string,
          value: parsedValue,
        });

        return {
          success: true,
          device_id: a.device_id,
          capability: a.capability,
          value: parsedValue,
          message: `Capability '${a.capability}' set to '${parsedValue}' on device '${device.name}'`,
        };
      });
    },
  });
}
