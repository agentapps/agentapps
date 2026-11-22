import type { AgentApp } from '@agentapps/sdk';
import { MakeError } from '../lib/errors.js';
import { accountApiJson, normalizeRegion } from '../lib/make-client.js';
import { getUserSecretsSafe, requireApiToken } from './_helpers.js';

interface RawScenario {
  id?: number | string;
  isActive?: boolean;
  [key: string]: unknown;
}

function strId(value: number | string | undefined | null): string | null {
  return value != null ? String(value) : null;
}

/**
 * stop-scenario — pause a scenario (requires MAKE_API_TOKEN).
 * POST /v2/scenarios/{id}/stop
 */
export function registerStopScenarioTool(app: AgentApp): void {
  app.tool('stop-scenario', {
    description:
      'Pause (stop) a Make.com scenario by id (requires MAKE_API_TOKEN in installation secrets). Returns { scenarioId, isActive, region }.',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The id of the scenario to pause.',
        },
      },
      required: ['scenarioId'],
    },
    // Pauses a live automation in Make (start-scenario resumes it): an outside change, so sensitive.
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      sensitive: true,
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
        'POST',
        `/scenarios/${encodeURIComponent(scenarioId)}/stop`,
        { apiKey, region },
      );

      return {
        scenarioId: strId(raw.id) ?? scenarioId,
        isActive: typeof raw.isActive === 'boolean' ? raw.isActive : false,
        region,
      };
    },
  });
}
