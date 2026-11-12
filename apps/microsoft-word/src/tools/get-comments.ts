import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, itemAction, itemRef } from '../lib/index.js';
import { readComments } from '../lib/read-docx.js';

/** get-comments — read-only; writing comments is out of scope (spec §7.6). */
export function registerGetCommentsTool(app: AgentApp): void {
  app.tool('get-comments', {
    description:
      'Read the review comments in a Word document, with their authors and dates. Returns an empty list when the document has none.',
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'OneDrive item id of the .docx. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description: 'Path to the .docx relative to the drive root. Pass literal names.',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const { graphRequest, email } = await createGraphClient(ctx);

      const a = (args ?? {}) as Record<string, unknown>;
      const ref = itemRef(a);
      const raw = await graphRequest<Buffer>('GET', itemAction(ref, '/content'), undefined, {
        responseType: 'buffer',
      });
      const comments = await readComments(Buffer.from(raw));

      return { account: email, count: comments.length, comments };
    },
  });
}
