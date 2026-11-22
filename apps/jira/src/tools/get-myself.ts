/**
 * get_myself — get the current authenticated Jira user.
 */

import type { AgentApp } from '@agentapps/sdk';
import { jiraRequest } from '../lib/jira-client.js';

export function registerGetMyselfTool(app: AgentApp): void {
  app.tool('get_myself', {
    description:
      'Get information about the currently authenticated Jira user, including display name, email, and account ID.',
    parameters: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    handler: async (_args, ctx) => {
      return await jiraRequest('GET', '/myself', null, ctx);
    },
  });
}
