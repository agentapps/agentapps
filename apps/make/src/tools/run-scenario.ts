import type { AgentApp } from '@agentapps/sdk';
import { MakeError } from '../lib/errors.js';
import { accountApiJson, normalizeRegion } from '../lib/make-client.js';
import { getUserSecretsSafe, requireApiToken } from './_helpers.js';

interface RawRunResponse {
  executionId?: string;
  status?: string;
  outputs?: unknown;
}

/**
 * run-scenario — run a Make scenario on demand by id (requires MAKE_API_TOKEN).
 * POST is executed exactly once (the client never retries POSTs — a retried run
 * would fire the scenario twice).
 */
export function registerRunScenarioTool(app: AgentApp): void {
  app.tool('run-scenario', {
    description:
      'Run a Make.com scenario on demand by id (requires MAKE_API_TOKEN in installation secrets). Pass optional `data` for the run inputs and `responsive: true` to wait for and return its outputs. Returns { scenarioId, executionId, status, responsive, outputs }.',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The id of the scenario to run (from list-scenarios).',
        },
        data: {
          type: 'object',
          description: 'Optional input data passed to the scenario run.',
          additionalProperties: true,
        },
        responsive: {
          type: 'boolean',
          description:
            'If true, wait for the run to finish and return its outputs (default false).',
        },
      },
      required: ['scenarioId'],
    },
    annotations: {
      sensitive: true,
      readOnlyHint: false,
      destructiveHint: false,
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

      const responsive = Boolean(a.responsive);
      const body: Record<string, unknown> = {};
      if (a.data !== undefined) body.data = a.data;
      if (a.responsive !== undefined) body.responsive = responsive;

      const raw = await accountApiJson<RawRunResponse>(
        'POST',
        `/scenarios/${encodeURIComponent(scenarioId)}/run`,
        { apiKey, region, body },
      );

      return {
        scenarioId,
        executionId: raw.executionId ?? null,
        status: raw.status ?? null,
        responsive,
        outputs: raw.outputs ?? null,
      };
    },
  });
}
