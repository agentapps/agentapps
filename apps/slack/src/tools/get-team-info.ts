import type { AgentApp } from '@agentapps/sdk';
import { getSlackSession } from '../lib/index.js';
import { TEAM_FIELDS } from './_fields.js';
import { extractTeam } from './_helpers.js';
import { resolveFields, wrapSlackCall } from './utils.js';

interface GetTeamInfoArgs {
  fields?: string[];
  includeRaw?: boolean;
}

export function registerGetTeamInfoTool(app: AgentApp): void {
  app.tool('get-team-info', {
    description:
      'Get the connected Slack workspace info. Returns { id, name, domain, emailDomain, iconUrl, enterpriseId, enterpriseName }. Params: fields?, includeRaw.',
    parameters: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override default whitelist on the returned team.',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Return raw Slack team object. Default false.',
        },
      },
    },
    annotations: { readOnlyHint: true },
    handler: async (args, ctx) => {
      const { fields, includeRaw } = args as GetTeamInfoArgs;
      const { client } = await getSlackSession(ctx);
      const result = await wrapSlackCall(() => client.team.info());
      const raw = result.team;
      if (!raw) throw new Error('Slack team.info returned no team');
      const shape = extractTeam(raw);
      return resolveFields(shape as any, raw, {
        includeRaw,
        fields,
        defaultFields: TEAM_FIELDS,
      });
    },
  });
}
