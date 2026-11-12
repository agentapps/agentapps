import type { AgentApp } from '@agentapps/sdk';
import { createGraphClient, itemAction, itemRef } from '../lib/index.js';
import { documentXmlOf, listParagraphs } from '../lib/read-docx.js';

/** list-paragraphs — the index map every edit tool targets. */
export function registerListParagraphsTool(app: AgentApp): void {
  app.tool('list-paragraphs', {
    description:
      "List a Word document's paragraphs with the stable indices that append-paragraphs, delete-paragraph, and the other edit tools target. Call this before editing to find the paragraph you mean. Text inside tables is not listed and cannot be targeted by index.",
    parameters: {
      type: 'object',
      properties: {
        itemId: {
          type: 'string',
          description: 'OneDrive item id of the .docx. Takes precedence over path.',
        },
        path: {
          type: 'string',
          description:
            'Path to the .docx relative to the drive root. Pass literal names, not pre-encoded ones.',
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
      const bytes = await graphRequest<Buffer>('GET', itemAction(ref, '/content'), undefined, {
        responseType: 'buffer',
      });
      const paragraphs = listParagraphs(await documentXmlOf(Buffer.from(bytes)));

      return { account: email, count: paragraphs.length, paragraphs };
    },
  });
}
