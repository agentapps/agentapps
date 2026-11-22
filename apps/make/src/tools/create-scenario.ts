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
 * create-scenario — create a new Make scenario (requires MAKE_API_TOKEN).
 * POST /v2/scenarios
 */
export function registerCreateScenarioTool(app: AgentApp): void {
  app.tool('create-scenario', {
    description:
      'Create a new Make.com scenario (requires MAKE_API_TOKEN in installation secrets). The `blueprint` is provided as a JSON object and is serialized internally. Returns { scenarioId, name, teamId, folderId, isActive, region, url }. Some Make plans require a paid subscription to use this endpoint.',
    parameters: {
      type: 'object',
      properties: {
        teamId: {
          type: 'string',
          description: 'Make team id that will own the scenario.',
        },
        name: {
          type: 'string',
          description: 'Human-readable name for the scenario.',
        },
        blueprint: {
          type: 'object',
          description:
            'Scenario blueprint as a JSON object (not an escaped string). It will be serialized to a string before sending to Make.',
          additionalProperties: true,
        },
        scheduling: {
          type: 'object',
          description:
            'Scheduling configuration. Defaults to { type: "indefinitely", interval: 60 }.',
          additionalProperties: true,
        },
        folderId: {
          type: 'string',
          description: 'Optional folder id to place the scenario in.',
        },
        confirmed: {
          type: 'boolean',
          description: 'Whether the scenario is confirmed on creation (default true).',
        },
        basedon: {
          type: 'string',
          description: 'Optional id of an existing scenario to base this one on.',
        },
      },
      required: ['teamId', 'blueprint'],
    },
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

      const teamId = String(a.teamId ?? '').trim();
      if (!teamId) {
        throw new MakeError('BAD_REQUEST', 'teamId is required and must be a non-empty string');
      }

      if (a.blueprint == null || typeof a.blueprint !== 'object' || Array.isArray(a.blueprint)) {
        throw new MakeError('BAD_REQUEST', 'blueprint is required and must be a JSON object');
      }

      const body: Record<string, unknown> = {
        teamId,
        blueprint: JSON.stringify(a.blueprint),
        scheduling: a.scheduling ?? { type: 'indefinitely', interval: 60 },
        confirmed: a.confirmed !== false,
      };
      if (a.name !== undefined && a.name !== '') body.name = a.name;
      if (a.folderId !== undefined && a.folderId !== '') body.folderId = a.folderId;
      if (a.basedon !== undefined && a.basedon !== '') body.basedon = a.basedon;

      const raw = await accountApiJson<RawScenario>('POST', '/scenarios', {
        apiKey,
        region,
        body,
      });

      return {
        scenarioId: strId(raw.id),
        name: raw.name ?? null,
        teamId: strId(raw.teamId) ?? teamId,
        folderId: strId(raw.folderId),
        isActive: typeof raw.isActive === 'boolean' ? raw.isActive : null,
        region,
        url: raw.url ?? null,
      };
    },
  });
}
