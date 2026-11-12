import type { AgentApp } from '@agentapps/sdk';
import { calendlyRequest } from '../lib/calendly-client.js';

/**
 * get-current-user — GET /users/me
 *
 * Returns the authenticated Calendly user's profile.
 */
export function registerGetCurrentUserTool(app: AgentApp): void {
  app.tool('get-current-user', {
    description:
      'Get the authenticated Calendly user profile (GET /users/me). Returns name, email, timezone, scheduling URL, organization, and avatar.',
    parameters: { type: 'object', properties: {} },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (_args, ctx) => {
      const data = (await calendlyRequest('GET', '/users/me', undefined, ctx)) as {
        resource: Record<string, unknown>;
      };
      return { user: data.resource };
    },
  });
}
