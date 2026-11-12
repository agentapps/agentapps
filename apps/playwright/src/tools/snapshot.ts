import { basename } from 'node:path';
import type { AgentApp } from '@agentapps/sdk';
import { ensureBrowser, getAccessibilitySnapshot } from '../browser.js';

export function registerSnapshotTool(app: AgentApp): void {
  app.tool('snapshot', {
    description:
      'Capture accessibility snapshot of the current page, this is better than screenshot',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description:
            'Save the snapshot as a markdown object instead of returning it in the response (e.g., "snapshot.md"). A link valid for one hour is returned.',
        },
      },
    },
    annotations: { readOnlyHint: false },
    handler: async (args, ctx) => {
      const { page } = await ensureBrowser();
      const snapshot = await getAccessibilitySnapshot(page);

      if (args.filename) {
        const filename = basename(args.filename as string);
        const object = await ctx.objects.put(Buffer.from(snapshot, 'utf8'), {
          contentType: 'text/markdown',
          filename,
        });
        const { url } = await ctx.objects.link(object.objectId, { expiresIn: 3600 });
        return `Snapshot saved as ${filename} — ${url}`;
      }

      return snapshot;
    },
  });
}
