import type { AgentApp } from '@agentapps/sdk';
import { MakeError } from '../lib/errors.js';
import { accountApiJson, normalizeRegion } from '../lib/make-client.js';
import { getUserSecretsSafe, requireApiToken } from './_helpers.js';

/**
 * delete-scenario — delete a scenario (requires MAKE_API_TOKEN).
 * DELETE /v2/scenarios/{id}
 */
export function registerDeleteScenarioTool(app: AgentApp): void {
  app.tool('delete-scenario', {
    description:
      'Delete a Make.com scenario by id (requires MAKE_API_TOKEN in installation secrets). This action is irreversible. Returns { scenarioId, deleted, region }.',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The id of the scenario to delete.',
        },
      },
      required: ['scenarioId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const a = (args ?? {}) as Record<string, unknown>;
      const secrets = await getUserSecretsSafe(ctx);
      const apiKey = requireApiToken(secrets);
      const region = normalizeRegion(secrets.MAKE_REGION);

      const scenarioId = String(a.scenarioId ?? '').trim();
      if (!scenarioId) {
        throw new MakeError('BAD_REQUEST', 'scenarioId is required and must be a non-empty string');
      }

      await accountApiJson<unknown>('DELETE', `/scenarios/${encodeURIComponent(scenarioId)}`, {
        apiKey,
        region,
      });

      return { scenarioId, deleted: true, region };
    },
  });
}
