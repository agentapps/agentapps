import type { AgentApp } from '@agentapps/sdk';
import { getAccessibilitySnapshot, requireSession } from '../lib/index.js';

export function registerSnapshotTool(app: AgentApp): void {
  app.tool('snapshot', {
    // Only reads the page's accessibility tree from the cloud browser.
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: false,
    },
    description:
      'Capture an accessibility snapshot of the current page. Returns the page structure with element refs for interaction.',
    parameters: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Active session ID' },
      },
      required: ['sessionId'],
    },
    handler: async (args, _ctx) => {
      const { page } = requireSession(args.sessionId as string);
      return getAccessibilitySnapshot(page);
    },
  });
}
