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
 * update-scenario — update an existing scenario (requires MAKE_API_TOKEN).
 * PATCH /v2/scenarios/{id}
 */
export function registerUpdateScenarioTool(app: AgentApp): void {
  app.tool('update-scenario', {
    description:
      'Update an existing Make.com scenario by id (requires MAKE_API_TOKEN in installation secrets). Supports updating name, blueprint (as a JSON object), scheduling, and folderId. Returns the updated scenario summary.',
    parameters: {
      type: 'object',
      properties: {
        scenarioId: {
          type: 'string',
          description: 'The id of the scenario to update.',
        },
        name: {
          type: 'string',
          description: 'New name for the scenario.',
        },
        blueprint: {
          type: 'object',
          description:
            'New scenario blueprint as a JSON object (not an escaped string). It will be serialized to a string before sending to Make.',
          additionalProperties: true,
        },
        scheduling: {
          type: 'object',
          description: 'New scheduling configuration.',
          additionalProperties: true,
        },
        folderId: {
          type: 'string',
          description: 'New folder id for the scenario.',
        },
      },
      required: ['scenarioId'],
    },
    // Replaces the given fields, the blueprint included; setting them again undoes it, so it is
    // kept as not destructive. It changes a live automation, so it needs approval.
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

      const body: Record<string, unknown> = {};
      if (a.name !== undefined && a.name !== '') body.name = a.name;
      if (a.blueprint !== undefined) body.blueprint = JSON.stringify(a.blueprint);
      if (a.scheduling !== undefined) body.scheduling = a.scheduling;
      if (a.folderId !== undefined && a.folderId !== '') body.folderId = a.folderId;

      if (Object.keys(body).length === 0) {
        throw new MakeError('BAD_REQUEST', 'At least one field to update must be provided');
      }

      const raw = await accountApiJson<RawScenario>(
        'PATCH',
        `/scenarios/${encodeURIComponent(scenarioId)}`,
        { apiKey, region, body },
      );

      return {
        scenarioId: strId(raw.id) ?? scenarioId,
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
