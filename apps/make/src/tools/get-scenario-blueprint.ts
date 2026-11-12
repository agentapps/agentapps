import type { AgentApp } from '@agentapps/sdk';
import { MakeError } from '../lib/errors.js';
import { accountApiJson, normalizeRegion } from '../lib/make-client.js';
import { getUserSecretsSafe, requireApiToken } from './_helpers.js';

interface RawScenario {
  blueprint?: string | Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * get-scenario-blueprint — fetch the blueprint of a scenario (requires MAKE_API_TOKEN).
 * GET /v2/scenarios/{id}/blueprint
 */
export function registerGetScenarioBlueprintTool(app: AgentApp): void {
  app.tool('get-scenario-blueprint', {
    description:
      'Get the blueprint of a Make.com scenario by id (requires MAKE_API_TOKEN in installation secrets). Returns { scenarioId, blueprint } where blueprint is a parsed JSON object when possible.',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The id of the scenario whose blueprint to retrieve.',
        },
      },
      required: ['scenarioId'],
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
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

      const raw = await accountApiJson<RawScenario>(
        'GET',
        `/scenarios/${encodeURIComponent(scenarioId)}/blueprint`,
        { apiKey, region },
      );

      let blueprint: unknown = raw.blueprint ?? null;
      if (typeof blueprint === 'string') {
        try {
          blueprint = JSON.parse(blueprint);
        } catch {
          // Leave as raw string if it is not valid JSON.
        }
      }

      return { scenarioId, blueprint, region };
    },
  });
}
