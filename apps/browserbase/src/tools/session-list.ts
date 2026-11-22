import type { AgentApp } from '@agentapps/sdk';
import { getActiveSessions } from '../lib/index.js';

export function registerSessionListTool(app: AgentApp): void {
  app.tool('session-list', {
    // Reads the sessions the app holds in memory: it changes nothing and calls no API.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      sensitive: false,
    },
    description: 'List all active Browserbase sessions in this instance.',
    parameters: { type: 'object', properties: {} },
    handler: async (_args, _ctx) => {
      const sessions = getActiveSessions();

      if (sessions.length === 0) {
        return 'No active sessions. Use session-create to start one.';
      }

      const rows = sessions.map((s) => ({
        sessionId: s.sessionId,
        createdAt: s.createdAt,
        currentUrl: s.page.url(),
        liveViewUrl: s.liveViewUrl,
      }));

      return JSON.stringify(rows, null, 2);
    },
  });
}
