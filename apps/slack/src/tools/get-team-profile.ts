import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { sanitiseBody, wrapSlackCall } from './utils.js';

interface GetTeamProfileArgs {
  visibility?: 'all' | 'visible' | 'hidden';
  includeRaw?: boolean;
}

interface CuratedTeamProfileField {
  id: string;
  label: string;
  type: string;
  hint: string | null;
  isHidden: boolean;
  ordering: number | null;
  possibleValues: string[] | null;
}

function extractField(raw: any): CuratedTeamProfileField {
  return {
    id: raw?.id ?? '',
    label: raw?.label ?? '',
    type: raw?.type ?? 'text',
    hint: raw?.hint || null,
    isHidden: Boolean(raw?.is_hidden),
    ordering: typeof raw?.ordering === 'number' ? raw.ordering : null,
    possibleValues: Array.isArray(raw?.possible_values) ? raw.possible_values : null,
  };
}

export function registerGetTeamProfileTool(app: AgentApp): void {
  app.tool('get-team-profile', {
    description:
      'Get the schema of custom user profile fields for the workspace. Returns { fields: [{ id, label, type, hint, isHidden, ordering, possibleValues }] }. Retryable. Params: visibility (def all).',
    parameters: {
      type: 'object',
      properties: {
        visibility: {
          type: 'string',
          enum: ['all', 'visible', 'hidden'],
          description: 'Filter by visibility. Default all.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { visibility, includeRaw } = args as unknown as GetTeamProfileArgs;
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() =>
        (client as any).team.profile.get(sanitiseBody({ visibility }) as any),
      );
      if (includeRaw) return result;
      const fields = (((result as any).profile?.fields ?? []) as any[]).map(extractField);
      return { fields, count: fields.length };
    },
  });
}
