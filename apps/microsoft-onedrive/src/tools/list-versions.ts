import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, requireItemRef } from '../lib/index.js';

/**
 * list-versions — GET {itemRef}/versions.
 *
 * This is the documented recovery path when a Word or PowerPoint tool
 * overwrites a file (suite spec §7.5).
 */
export function registerListVersionsTool(app: AgentApp): void {
  app.tool('list-versions', {
    description:
      'List the version history of a OneDrive file. Use this to recover an earlier version after an unwanted overwrite.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Item path relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
        },
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
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        `${requireItemRef(a)}/versions`,
      );
      const versions = (response.value || []).map((v: any) => ({
        id: v.id,
        lastModifiedDateTime: v.lastModifiedDateTime,
        lastModifiedBy: v.lastModifiedBy?.user?.displayName,
        size: v.size,
      }));

      return { account: email, count: versions.length, versions };
    },
  });
}
