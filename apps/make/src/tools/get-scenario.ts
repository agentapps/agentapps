import type { AgentApp } from '@agentapps/sdk';
import { MakeError } from '../lib/errors.js';
import { accountApiJson, normalizeRegion } from '../lib/make-client.js';
import { getUserSecretsSafe, requireApiToken } from './_helpers.js';

interface RawScenario {
  id?: number | string;
  name?: string;
  isActive?: boolean;
  teamId?: number | string;
  folderId?: number | string | null;
  [key: string]: unknown;
}

function strId(value: number | string | undefined | null): string | null {
  return value != null ? String(value) : null;
}

/**
 * get-scenario — read a single Make scenario (requires MAKE_API_TOKEN).
 * GET /v2/scenarios/{id}
 */
export function registerGetScenarioTool(app: AgentApp): void {
  app.tool('get-scenario', {
    description:
      'Get a single Make.com scenario by id (requires MAKE_API_TOKEN in installation secrets). Returns the scenario object as returned by Make.',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The id of the scenario to retrieve.',
        },
      },
      required: ['scenarioId'],
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
      const secrets = await getUserSecretsSafe(ctx);
      const apiKey = requireApiToken(secrets);
      const region = normalizeRegion(secrets.MAKE_REGION);

      const scenarioId = String(a.scenarioId ?? '').trim();
      if (!scenarioId) {
        throw new MakeError('BAD_REQUEST', 'scenarioId is required and must be a non-empty string');
      }

      const raw = await accountApiJson<RawScenario>(
        'GET',
        `/scenarios/${encodeURIComponent(scenarioId)}`,
        { apiKey, region },
      );

      return {
        scenarioId: strId(raw.id) ?? scenarioId,
        name: raw.name ?? null,
        isActive: typeof raw.isActive === 'boolean' ? raw.isActive : null,
        teamId: strId(raw.teamId),
        folderId: strId(raw.folderId),
        region,
        raw,
      };
    },
  });
}
