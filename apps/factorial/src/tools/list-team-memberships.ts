import type { AgentApp } from '@agentapps/sdk';
import { buildQueryString, factorialRequest } from '../lib/index.js';

export function registerListTeamMembershipsTool(app: AgentApp): void {
  app.tool('list-team-memberships', {
    description: 'List all team memberships (employee-team associations).',
    parameters: {
      type: 'object',
      properties: {
        teamId: { type: 'number', description: 'Filter by team ID' },
        employeeId: { type: 'number', description: 'Filter by employee ID' },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (args, ctx) => {
      const qs = buildQueryString({
        team_id: args.teamId,
        employee_id: args.employeeId,
      });
      return factorialRequest(ctx, `/teams/memberships${qs}`);
    },
  });
}
