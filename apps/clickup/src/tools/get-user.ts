import type { AgentApp } from '@agentapps/sdk';
import { clickupRequest } from '../lib/clickup-client.js';

export function registerGetUserTool(app: AgentApp): void {
  app.tool('get-user', {
    description: 'Get the authenticated ClickUp user information.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
    },
    handler: async (_args, ctx) => {
      const data = (await clickupRequest(ctx, '/user')) as { user: any };
      const user = data.user;
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        color: user.color,
        profilePicture: user.profilePicture,
        timezone: user.timezone,
        weekStartDay: user.week_start_day,
      };
    },
  });
}
