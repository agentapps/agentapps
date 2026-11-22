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

export function registerSetVariableTool(app: AgentApp): void {
  app.tool('set-variable', {
    description:
      'Set the value of a Homey logic variable by its ID. Use get-variables to find variable IDs.',
    parameters: {
      type: 'object',
      properties: {
        variable_id: {
          type: 'string',
          description: 'Variable ID (UUID).',
        },
        value: {
          description:
            'New value for the variable (string, number, or boolean — must match the variable type).',
        },
      },
      required: ['variable_id', 'value'],
    },
    // Changes a logic variable on the Homey, which flows may react to. Setting the previous
    // value restores the variable.
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

        const parsedValue = parseValue(a.value);

        await api.logic.updateVariable({
          id: a.variable_id as string,
          variable: { value: parsedValue },
        });

        return {
          success: true,
          variable_id: a.variable_id,
          value: parsedValue,
          message: 'Variable updated successfully',
        };
      });
    },
  });
}
