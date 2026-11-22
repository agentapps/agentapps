import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, requireItemRef } from '../lib/index.js';

/** remove-permission — DELETE {itemRef}/permissions/{permissionId}. */
export function registerRemovePermissionTool(app: AgentApp): void {
  app.tool('remove-permission', {
    description:
      'Revoke a sharing permission or link on a OneDrive item. Use list-permissions to find the permission ID.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'string', description: 'Item ID. Takes precedence over path.' },
        path: {
          type: 'string',
          description:
            'Item path relative to the drive root. Pass literal file and folder names, not pre-encoded ones.',
        },
        permissionId: { type: 'string', description: 'The permission ID to revoke' },
      },
      required: ['permissionId'],
    },
    annotations: {
      readOnlyHint: false,
      // Revoking access cannot be undone by this app; the permission must be recreated.
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
      sensitive: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      await graphRequest(
        'DELETE',
        `${requireItemRef(a)}/permissions/${encodeURIComponent(a.permissionId as string)}`,
      );

      return { success: true, account: email, message: 'Permission revoked.' };
    },
  });
}
