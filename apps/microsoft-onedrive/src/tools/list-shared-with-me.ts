import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, formatItem } from '../lib/index.js';

/** list-shared-with-me — GET /me/drive/sharedWithMe. */
export function registerListSharedWithMeTool(app: AgentApp): void {
  app.tool('list-shared-with-me', {
    description:
      'List OneDrive files and folders that other people have shared with this account. Listing only: a shared item lives on the drive of the person who shared it, and every other tool in this app addresses /me/drive, so the IDs returned here cannot be passed to get-item, download-file, or any other tool. Use webUrl to open a shared item.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of items to return (default: 50, max: 200)',
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
      const maxResults = Math.min((a.maxResults as number) || 50, 200);

      const response = await graphRequest<{ value?: any[] }>(
        'GET',
        `/me/drive/sharedWithMe?$top=${maxResults}`,
      );
      const items = (response.value || []).map((item: any) => ({
        // sharedWithMe entries are shortcuts: the `file` / `folder` / `size`
        // facets describe the item on the *owner's* drive and live under
        // `remoteItem`, not at the top level. Formatting the bare entry would
        // report every shared folder as a file and every size as undefined.
        // The overlay also makes id/name/parentReference describe the remote
        // item rather than the local shortcut, which is what a reader of this
        // listing means by "the shared file".
        ...formatItem({ ...item, ...item.remoteItem }),
        remoteItemId: item.remoteItem?.id,
        remoteDriveId: item.remoteItem?.parentReference?.driveId,
      }));

      return { account: email, count: items.length, items };
    },
  });
}
