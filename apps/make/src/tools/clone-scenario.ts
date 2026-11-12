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
  url?: string;
  [key: string]: unknown;
}

function strId(value: number | string | undefined | null): string | null {
  return value != null ? String(value) : null;
}

/**
 * clone-scenario — clone an existing scenario (requires MAKE_API_TOKEN).
 * POST /v2/scenarios/{id}/clone
 */
export function registerCloneScenarioTool(app: AgentApp): void {
  app.tool('clone-scenario', {
    description:
      'Clone an existing Make.com scenario by id (requires MAKE_API_TOKEN in installation secrets). Optionally set a new name or folder. Returns the cloned scenario summary.',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The id of the scenario to clone.',
        },
        name: {
          type: 'string',
          description: 'Optional new name for the cloned scenario.',
        },
        folderId: {
          type: 'string',
          description: 'Optional folder id for the cloned scenario.',
        },
      },
      required: ['scenarioId'],
    },
    annotations: {
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

      const body: Record<string, unknown> = {};
      if (a.name !== undefined && a.name !== '') body.name = a.name;
      if (a.folderId !== undefined && a.folderId !== '') body.folderId = a.folderId;

      const raw = await accountApiJson<RawScenario>(
        'POST',
        `/scenarios/${encodeURIComponent(scenarioId)}/clone`,
        { apiKey, region, body },
      );

      return {
        scenarioId: strId(raw.id),
        name: raw.name ?? null,
        teamId: strId(raw.teamId),
        folderId: strId(raw.folderId),
        isActive: typeof raw.isActive === 'boolean' ? raw.isActive : null,
        region,
        url: raw.url ?? null,
      };
    },
  });
}
